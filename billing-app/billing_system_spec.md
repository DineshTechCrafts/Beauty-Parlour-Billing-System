# Billing System — Design Specification

**For implementation by Claude Code. This is a design document only — no code is included here.**

Storage: **SQLite** (single file `billing.db`)
Model: **Cash-basis GST billing** — tax liability arises only when payment is allocated to items.
Legacy: An existing CSV bill format must be reproducible as an **export**.

---

## 1. Problem Statement

A shop lets customers take products/services without paying immediately. Payment may arrive weeks or months later, often in installments. The shop must **not** raise a GST invoice (and therefore must not incur GST liability) until money is actually received. Each payment should generate a tax invoice covering only the items that the received amount can fully pay for, including their tax.

The system must:

- Track items taken but not yet paid for (unbilled) vs items invoiced (billed).
- Generate a GST tax invoice at the moment of payment, dated so the liability falls in the correct GST month.
- Handle partial payments, overpayments (advance credit), and payments that span items from multiple receipts.
- Preserve a customer-facing receipt numbering scheme (135, 135(A), 135(B)…) while keeping a strictly sequential GST invoice number for filing.
- Never lose or corrupt data, even on crash or power loss.

---

## 2. Core Design Rules

These rules govern the entire implementation. Carry them into every operation.

1. **Every payment is processed as ONE database transaction.** All writes for a single payment — receipt row, item status updates, invoice rows, ledger entries, counter increments — commit together or roll back together. The books are never left half-written.
2. **Two amounts per item.**
   - `amount` = pre-tax taxable value. **The invoice reads this** (GST is added on top).
   - `taxed_total` = tax-inclusive value. **Allocation and credit read this** (the cash a customer pays already includes tax).
   - Both are computed and **locked at item creation**.
3. **`taxed_total` rounding is locked once** at creation. Allocation always uses the stored value, so balances reconcile exactly to zero (no per-line paisa drift).
4. **Invoice date drives the GST month.** It defaults to today, is editable by the shopkeeper, and is **never** copied from the receipt date.
5. **A part-affordable item is never split.** If the remaining payment cannot cover an item's full `taxed_total`, that item stays PENDING until a future payment covers it completely.
6. **`gst_seq` is strictly sequential** with no gaps (required for GST filing). The customer-facing receipt numbers (135, 135(A)) are a separate, independent identifier.
7. **The SQLite database is the single source of truth.** The legacy CSV bill file is a generated export produced by flattening invoice data — never the primary store.

---

## 3. The Two Documents

| Document | Trigger | GST? | Numbering |
|---|---|---|---|
| **Cash Receipt** | Payment received, items added, or both | No | Customer-facing: 135, 135(A), 135(B)… |
| **Tax Invoice** | Payment allocated to invoiceable items | Yes | Sequential `gst_seq`: 1, 2, 3… |

A Cash Receipt has three modes:

| Mode | Items present | Payment present |
|---|---|---|
| `ITEMS_PAYMENT` | Yes | Yes |
| `ITEMS_ONLY` | Yes | No |
| `PAYMENT_ONLY` | No | Yes |

---

## 4. Database Schema

Enable on connection:
- `PRAGMA foreign_keys = ON;`
- `PRAGMA journal_mode = WAL;` (crash resilience + concurrent reads)

### 4.1 `customers`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| customer_id | TEXT | PRIMARY KEY | e.g. C001 |
| name | TEXT | NOT NULL | |
| phone | TEXT | | |
| gstin | TEXT | NULL | blank for B2C / unregistered |
| address | TEXT | | |
| state_code | TEXT | NOT NULL | e.g. 33 = Tamil Nadu; decides CGST+SGST vs IGST |

### 4.2 `receipts`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| receipt_id | TEXT | PRIMARY KEY | customer-facing: 135, 135(A)… |
| customer_id | TEXT | FK → customers | |
| receipt_date | DATE | NOT NULL | date money/items recorded; triggers allocation |
| payment | REAL | NULL | NULL for ITEMS_ONLY |
| mode | TEXT | NOT NULL | ITEMS_PAYMENT / ITEMS_ONLY / PAYMENT_ONLY |
| bill_receipt_first | INTEGER | NOT NULL DEFAULT 0 | 1/0; only meaningful for ITEMS_PAYMENT |
| created_at | DATETIME | NOT NULL | audit timestamp |

### 4.3 `receipt_items` — the billed / unbilled tracker

This table is the source of truth for what has been invoiced and what is still pending.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| item_id | TEXT | PRIMARY KEY | e.g. I001 |
| receipt_id | TEXT | FK → receipts | originating receipt |
| customer_id | TEXT | FK → customers | denormalized for fast filtering |
| item_description | TEXT | NOT NULL | |
| type | TEXT | NOT NULL | PRODUCT / SERVICE |
| price | REAL | NOT NULL | unit price |
| quantity | REAL | NOT NULL | |
| amount | REAL | NOT NULL | price × quantity — **pre-tax**, the invoice reads this |
| discount | REAL | NOT NULL DEFAULT 0 | line-level discount |
| gst_rate | REAL | NOT NULL | percent; items may differ |
| taxed_total | REAL | NOT NULL | locked tax-inclusive value — **allocation reads this** |
| sac_hsn_code | TEXT | | SAC (service) or HSN (product) |
| unit | TEXT | | PCS, KG, NOS… |
| status | TEXT | NOT NULL DEFAULT 'PENDING' | PENDING / INVOICED |
| invoiced_in_seq | INTEGER | NULL, FK → tax_invoices.gst_seq | which bill consumed it |

**Computed at creation, then locked:**
```
amount      = price * quantity
net_taxable = amount - discount
taxed_total = round( net_taxable * (1 + gst_rate/100) )   # rounding rule fixed here, stored
```

**Index:** `(customer_id, status)`; queue ordering is `ORDER BY receipt_date, item_id`.

### 4.4 `tax_invoices` — legacy bill format preserved

One product per row. Multiple rows share the same `gst_seq` to form a single invoice. Bill-level fields repeat on every line row of that bill. Keep column names and order aligned with the legacy CSV so the export is a direct mapping.

**Bill-level columns** (same value on every row of one gst_seq):

| Column | Notes |
|---|---|
| gst_seq | sequential GST filing number |
| receipt_id | the cash receipt that generated this bill (customer-facing) |
| date | **invoice date** — drives GST month, editable, defaults to today |
| client_name | buyer name |
| client_phone | buyer phone |
| client_address | buyer address |
| sub_total | gross sum of line amounts before discount |
| discount | bill-level discount total |
| cgst | central GST (intra-state) |
| sgst | state GST (intra-state) |
| igst | inter-state GST (0 when intra-state) |
| gst_total | cgst + sgst + igst |
| taxable_amount | sub_total − discount |
| service_total | net taxable of SERVICE lines |
| product_total | net taxable of PRODUCT lines |
| total | taxable_amount + gst_total |
| gst_rate | rate for the bill (or per line if mixed) |
| billing_mode | PRODUCT / SERVICE / MIXED |
| place_of_supply | supply state |
| buyer_gstin | blank for B2C |
| buyer_legal_name | registered name (B2B) |
| buyer_state_code | e.g. 33 |
| reverse_charge | Y / N |
| invoice_type | Tax Invoice / Bill of Supply |

**Line-level columns** (one product per row):

| Column | Notes |
|---|---|
| item_description | product/service name |
| price | unit price |
| quantity | qty |
| amount | price × qty (pre-tax) |
| sac_hsn_code | SAC / HSN |
| unit | PCS, KG, NOS… |

**Tracking columns (appended at the end):**

| Column | Notes |
|---|---|
| row_id | INTEGER PRIMARY KEY AUTOINCREMENT — unique per line row |
| source_receipt_id | the receipt the item originally came from |
| source_item_id | FK → receipt_items.item_id |

**Invariants:**
```
total          = taxable_amount + gst_total
taxable_amount = sub_total - discount
gst_total      = cgst + sgst + igst
bill total     = SUM(taxed_total of covered items) = credit_ledger INVOICE amount for that bill
```

### 4.5 `credit_ledger` — tax-inclusive money journal

| Column | Type | Constraints | Notes |
|---|---|---|---|
| txn_id | INTEGER | PRIMARY KEY AUTOINCREMENT | |
| customer_id | TEXT | FK → customers | |
| type | TEXT | NOT NULL | PAYMENT / INVOICE / ADVANCE_CREDIT / CREDIT_USED |
| amount | REAL | NOT NULL | **tax-inclusive** rupees |
| ref_id | TEXT | | receipt_id (PAYMENT/ADVANCE_CREDIT), gst_seq (INVOICE), or origin receipt (CREDIT_USED) |
| date | DATE | NOT NULL | |

### 4.6 `counters`

SQLite AUTOINCREMENT handles `row_id` and `txn_id`. Only business sequences that are not plain row PKs need a counter.

| key | meaning |
|---|---|
| gst_seq | next GST filing number (strictly +1, no gaps) |
| receipt_base | next base receipt number for a new customer visit (136, 137…) |

Read value → use → increment → write back, **inside the same transaction** as the operation using it.

---

## 5. Derived Values (never stored — always computed on read)

```
Outstanding(customer)     = SUM(taxed_total) WHERE status='PENDING' AND customer_id = ?

Advance Credit(customer)  = SUM(amount WHERE type='ADVANCE_CREDIT' AND customer_id=?)
                          - SUM(amount WHERE type='CREDIT_USED'    AND customer_id=?)

Receipt status            = derived from its items' mix of PENDING/INVOICED
                            (all pending / partial / all invoiced / payment-only)

GST filing list           = tax_invoices GROUP BY gst_seq ORDER BY gst_seq
```

---

## 6. Numbering Logic

### GST invoice number (`gst_seq`)
- Drawn from `counters.gst_seq`, incremented by exactly 1 per invoice, never reused, no gaps.
- Used only for GST filing and internal invoice identity.

### Customer-facing receipt number
- New customer visit takes the next base number from `counters.receipt_base` (135 → 136 → 137…).
- Subsequent receipts for the **same** customer against the same base get a suffix:
  ```
  first    → 135
  second   → 135(A)
  third    → 135(B)
  ...      → up to 135(Z)
  ```
- To assign the next suffix: count existing receipts on that base for the customer, pick the next letter.

The two numbering systems are fully independent. A single tax invoice prints both: its `gst_seq` (for filing) and the originating `receipt_id` (for the customer).

---

## 7. Tax Calculation Rule

```
IF buyer_state_code == seller_state_code:
    cgst = gst_total / 2
    sgst = gst_total / 2
    igst = 0
ELSE:
    igst = gst_total
    cgst = 0
    sgst = 0
```

`gst_total` per line = `net_taxable * gst_rate / 100`. Bill-level `gst_total` is the sum across covered lines.

---

## 8. Bill Receipt First Flag

Relevant only when a receipt has **both** items and payment (`ITEMS_PAYMENT`).

| Flag | Behaviour |
|---|---|
| ON (1) | The current receipt's own items go to the **front** of the allocation queue, invoiced before any older pending items. |
| OFF (0) | The current receipt's items go to the **back**; global FIFO runs oldest pending items first. |

This affects queue priority only — it has no effect on GST logic or amounts.

---

## 9. Core Operation — Process a Payment (single transaction)

This is the heart of the system. Implement exactly as one atomic transaction.

```
BEGIN TRANSACTION

  1. Insert or locate the receipt row (assign receipt_id via numbering logic).

  2. If items are present on this receipt:
        For each item:
            compute amount, net_taxable, taxed_total (lock rounding)
            insert into receipt_items with status = PENDING

  3. Compute advance credit balance for the customer.
     allocatable = advance_credit + fresh_payment
     If advance_credit > 0:
        insert a CREDIT_USED ledger row for the amount that will be consumed
        (consume credit before fresh cash)

  4. Build the allocation queue:
        IF bill_receipt_first = 1:
            this receipt's PENDING items first (oldest-to-newest within receipt),
            then all other PENDING items ordered by (receipt_date, item_id)
        ELSE:
            all PENDING items for the customer ordered by (receipt_date, item_id)

  5. Walk the queue in order:
        for each item:
            IF allocatable >= item.taxed_total:
                mark item INVOICED
                set item.invoiced_in_seq = (the gst_seq about to be created)
                add item to the current bill
                allocatable -= item.taxed_total
            ELSE:
                stop walking (item stays PENDING — never split)

  6. If at least one item was covered:
        take next gst_seq from counters; increment counters.gst_seq
        insert one tax_invoices row per covered item, all sharing this gst_seq
        compute bill-level totals:
            sub_total       = SUM(line amount)
            discount        = SUM(line discount)            (or bill-level if used)
            taxable_amount  = sub_total - discount
            service_total / product_total by line type
            gst_total       = SUM(line net_taxable * rate/100)
            cgst/sgst/igst   per the tax rule (Section 7)
            total           = taxable_amount + gst_total
        insert an INVOICE ledger row, amount = bill total (tax-inclusive)

  7. If allocatable still remains after the queue is exhausted:
        insert an ADVANCE_CREDIT ledger row for the remainder

COMMIT
```

**On any error at any step → ROLLBACK.** The database returns to its exact prior state; no partial bill, no orphaned ledger entry.

### Behaviour by receipt mode
- `ITEMS_ONLY`: steps 1–2 only. Items inserted PENDING. No allocation, no invoice, no ledger entry.
- `PAYMENT_ONLY`: step 1, then 3–7 against existing PENDING items.
- `ITEMS_PAYMENT`: full flow 1–7, queue order set by the flag.

---

## 10. Validation Rules

- `mode` must match content: ITEMS_ONLY has items and NULL payment; PAYMENT_ONLY has payment and no items; ITEMS_PAYMENT has both.
- `payment` (when present) must be > 0.
- `gst_rate` ≥ 0; `quantity` > 0; `discount` ≤ amount.
- `taxed_total` must be recomputed-and-checked equal to stored at write time (guards rounding bugs).
- `state_code` present for any customer who may receive a GST invoice.
- `gst_seq` must increase by exactly 1 versus the previous max (no gaps, no reuse).

---

## 11. CSV Export (legacy bill format)

- The export reads `tax_invoices` (joining customers/receipts as needed) and writes rows in the **exact legacy column order and names**, one product per row, with bill-level fields repeated per row.
- The database remains the source of truth; the CSV is a generated artifact.
- **Production mode is a configurable flag** (decision still open): either
  - *on-demand* — a command/button produces the CSV when needed (recommended default), or
  - *auto* — the CSV is appended/regenerated after every committed bill.
- Note for implementer: default to on-demand unless told otherwise.

---

## 12. Reliability Requirements

- Wrap every multi-write operation in a single transaction (`BEGIN` / `COMMIT`, `ROLLBACK` on error).
- `PRAGMA foreign_keys = ON;` and `PRAGMA journal_mode = WAL;`.
- Back up by copying `billing.db` on a schedule; prefer `VACUUM INTO` for a clean snapshot while the app runs.
- All money math uses the **stored** `taxed_total` — never recompute during allocation.
- Counters are read-incremented-written inside the same transaction that consumes them.

---

## 13. Reconciliation Guarantee (build as automated tests)

For every customer at every point in time:

```
SUM(PAYMENT) + SUM(CREDIT_USED applied)   ==   SUM(INVOICE) + advance_credit_outstanding

For each gst_seq:
    credit_ledger INVOICE amount == SUM(taxed_total of items invoiced in that seq) == bill total

cash_in  ==  invoiced_taxed_total  +  advance_credit_held
```

If any of these ever fail, a transaction wrote partial data — which transactions + WAL are designed to prevent. Implement these as a self-check routine that can run over the whole database.

---

## 14. Worked Examples

All examples intra-state Tamil Nadu (CGST+SGST, IGST = 0). A ₹200 item @18%: `amount` 200, GST 36, **`taxed_total` 236**.

### Case A — Items only (Receipt 135, customer C001 Rajan)
```
Items: Item A 200/236, Item B 200/236, Item C 200/236     Payment: none
Result: receipt_items I001,I002,I003 all PENDING. No invoice. No ledger entry.
```

### Case B — Payment only ₹500 (Receipt 135(A))
```
allocatable = 0 + 500 = 500
Queue (global FIFO): A 236 ✓ (264 left) | B 236 ✓ (28 left) | C 236 ✗ stop → PENDING
Covered A,B → sub_total 400, gst_total 72, total 472. Leftover 28 → advance.  gst_seq = 1

receipt_items: I001,I002 → INVOICED (invoiced_in_seq=1); I003 PENDING
tax_invoices: 2 rows, gst_seq 1 (Item A, Item B), date = today
credit_ledger:
   PAYMENT        500  ref 135(A)
   INVOICE        472  ref 1
   ADVANCE_CREDIT  28  ref 135(A)
```

### Case C — Items + Payment ₹600, Bill Receipt First ON (Receipt 135(B))
```
New items: D 400/472, E 250/295, F 300/354
advance credit 28 + payment 600 = 628 ; CREDIT_USED 28
Queue (this receipt first): D 472 ✓ (156 left) | E 295 ✗ PENDING | F 354 ✗ PENDING
Then older pending: C 236 ✗ (156<236) PENDING
Covered D → sub_total 400, gst_total 72, total 472. Leftover 156 → advance.  gst_seq = 2

tax_invoices: 1 row, gst_seq 2 (Item D)
credit_ledger:
   PAYMENT        600  ref 135(B)
   CREDIT_USED     28  ref 135(A)
   INVOICE        472  ref 2
   ADVANCE_CREDIT 156  ref 135(B)

Reconcile C001: cash in 1100 = invoiced 944 (472+472) + credit held 156. ✓
Outstanding (taxed): C 236 + E 295 + F 354 = 885.
```

### Case D — One payment spans multiple receipts (customer C003 Kumar, Receipt 200(B), ₹900, flag OFF)
```
Pending before: 200 → P 200/236, Q 200/236, R 200/236 ; 200(A) → S 150/177, T 250/295
allocatable 900, global FIFO oldest first:
   P 236 ✓ | Q 236 ✓ | R 236 ✓ (192 left) | S 177 ✓ (15 left) | T 295 ✗ PENDING
Covered P,Q,R,S → sub_total 750, gst_total 135, total 885. Leftover 15 → advance.  gst_seq = 3

tax_invoices: 4 rows, gst_seq 3, source_receipt_id = 200 for P,Q,R and 200(A) for S
credit_ledger:
   PAYMENT        900  ref 200(B)
   INVOICE        885  ref 3
   ADVANCE_CREDIT  15  ref 200(B)
```
One invoice (gst_seq 3) legitimately spans items from two source receipts — captured via `source_receipt_id` per line.

### Case E — Discount + service line, B2B (customer C002 Meena Textiles, Receipt 140, ₹1652, flag ON)
```
Service "Stitching" SAC 9988, 1000 @18%, no discount → taxed_total 1180
Product "Buttons"  HSN 9606, 500 @18%, discount 100   → net 400, taxed_total 472
allocatable 1652: Service 1180 ✓ (472 left) | Buttons 472 ✓ (0 left). Both covered, no advance.  gst_seq = 4

Bill-level: sub_total 1500, discount 100, taxable_amount 1400,
            service_total 1000, product_total 400,
            cgst 126, sgst 126, igst 0, gst_total 252, total 1652,
            billing_mode MIXED, buyer_gstin 33ABCDE1234F1Z5, buyer_state_code 33,
            reverse_charge N, invoice_type Tax Invoice
tax_invoices: 2 rows, gst_seq 4 (Stitching, Buttons)
credit_ledger:
   PAYMENT 1652 ref 140
   INVOICE 1652 ref 4
```

### Customer ledger view — C001 after A–C (derived, taxed rupees)
```
DATE        TYPE         REF      DEBIT   CREDIT   OUTSTANDING
2025-05-10  Items In     135      708              708
2025-06-10  Payment      135(A)           500
2025-06-10  Invoice      1        472
2025-06-10  Adv Credit   —                 28      236
2025-06-20  Items In     135(B)   1121             1357
2025-06-20  Payment      135(B)           600
2025-06-20  Credit Used  135(A)    28
2025-06-20  Invoice      2        472
2025-06-20  Adv Credit   —                156      885
```
Outstanding 885 = C 236 + E 295 + F 354 (all tax-inclusive). Credit held 156.

### GST filing view (derived)
```
gst_seq  date         taxable_amount  gst_total  total
1        2025-06-10   400             72         472
2        2025-06-20   400             72         472
3        2025-06-12   750             135        885
4        2025-07-05   1400            252        1652
```
Portal sees 1,2,3,4 — strictly sequential. Customers see 135(A), 135(B), 200(B), 140 on their bills.

---

## 15. Open Items for the Client's CA (flag before go-live)

1. **Receipt naming**: confirm the customer-facing 135 / 135(A) / 135(B) scheme is acceptable alongside the strictly sequential `gst_seq` used for filing.
2. **Discount apportionment**: when a single bill mixes lines at **different GST rates**, a bill-level discount must be apportioned per rate. The examples keep discount at the **line level** to avoid this. Confirm which approach the business uses, and implement accordingly.

---

## 16. Build Order (suggested for Claude Code)

1. Create schema + pragmas; seed `counters`.
2. Customer create/lookup.
3. Receipt numbering (base + suffix) and `receipt_items` insertion with locked `amount`/`taxed_total`.
4. Advance-credit balance query.
5. The Process-a-Payment transaction (Section 9) — the core; cover all three modes and the flag.
6. Tax split (Section 7) and bill-total computation.
7. Derived views: customer ledger, outstanding, GST filing list.
8. CSV export in legacy column order (on-demand).
9. Reconciliation self-check routine (Section 13) as automated tests.
10. Backup routine (`VACUUM INTO` snapshot).

---

*End of specification.*
