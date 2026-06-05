# Billing System — Design Specification (JSON)

**For implementation by Claude Code. This is a design document only — no code is included here.**

Storage: **JSON files** — `billing.json` (all billing data) + `session.json` (existing customer/session file, extended).
Model: **Cash-basis GST billing** — tax liability arises only when payment is allocated to items.
Legacy: The `tax_invoices` data keeps the legacy bill column shape (migrated to JSON) so a GST CSV report can be generated from it later.

---

## 1. Problem Statement

A shop lets customers take products/services without paying immediately. Payment may arrive weeks or months later, often in installments. The shop must **not** raise a GST invoice (and therefore must not incur GST liability) until money is actually received. Each payment should generate a tax invoice covering only the items that the received amount can fully pay for, including their tax.

The system must:

- Track items taken but not yet paid for (unbilled) vs items invoiced (billed).
- Generate a GST tax invoice at the moment of payment, dated so the liability falls in the correct GST month.
- Handle partial payments, overpayments (advance credit), and payments that span items from multiple receipts.
- Preserve a customer-facing receipt numbering scheme (135, 135 A, 135 B…) while keeping a strictly sequential GST invoice number for filing.
- Never lose or corrupt data, even on crash or power loss.

This is a **single billing software** — one program is the sole reader and writer of both JSON files. There is no second process, so no file-locking/concurrency handling is required; writes happen one after another.

---

## 2. Core Design Rules

These rules govern the entire implementation. Carry them into every operation.

1. **Every payment is ONE atomic write of `billing.json`.** All changes for a single payment — receipt entry, item status flips, invoice entries, ledger entries, counter increment — are made in memory, then the whole file is written via **temp-file-then-rename**. One rename = the entire payment commits, or none of it does. This restores the all-or-nothing property the old SQLite transaction gave.
2. **Two amounts per item.**
   - `amount` = pre-tax taxable value. **The invoice reads this** (GST is added on top).
   - `taxed_total` = tax-inclusive value. **Allocation and credit read this** (the cash a customer pays already includes tax).
   - Both are computed and **locked at item creation**.
3. **`taxed_total` rounding is locked once** at creation. Allocation always uses the stored value, so balances reconcile exactly to zero (no per-line paisa drift).
4. **Invoice date drives the GST month.** It defaults to today and is **never** copied from the receipt date.
5. **A part-affordable item is never split.** If the remaining payment cannot cover an item's full `taxed_total`, that item stays PENDING until a future payment covers it completely.
6. **One row per unit.** Quantity is always expanded: 3 × Product A is stored as three separate item rows, each `qty = 1`, each independently PENDING or INVOICED. There is never a multi-unit line to split. Display/export rolls them back up into a quantity line (see Section 11).
7. **`gst_seq` is strictly sequential** with no gaps (required for GST filing). The customer-facing receipt numbers (135, 135 A) are a separate, independent identifier.
8. **`billing.json` is the single source of truth.** The `_billing` block in `session.json` is a rebuildable cache, and the GST CSV is a generated export — neither is authoritative.
9. **One invoice per payment event.** All units covered by a single allocation pass share one `gst_seq`. A payment event never generates more than one tax invoice.

---

## 3. The Two Documents

| Document | Trigger | GST? | Numbering |
|---|---|---|---|
| **Cash Receipt** | Payment received, items added, or both | No | Customer-facing: 135, 135 A, 135 B… |
| **Tax Invoice** | Payment allocated to invoiceable items | Yes | Sequential `gst_seq`: 1, 2, 3… |

A Cash Receipt has three modes:

| Mode | Items present | Payment present |
|---|---|---|
| `ITEMS_PAYMENT` | Yes | Yes |
| `ITEMS_ONLY` | Yes | No |
| `PAYMENT_ONLY` | No | Yes |

---

## 4. Data Model

Two files. `billing.json` holds everything that mutates together (so a payment is one write). `session.json` is the existing file — services untouched, billing added under reserved `_`-prefixed keys.

### 4.1 `billing.json` — top-level shape

```
{
  "receipts":        [ ... ],
  "receipt_items":   [ ... ],
  "tax_invoices":    [ ... ],
  "credit_ledger":   [ ... ],
  "counters":        { "gst_seq": <int>, "receipt_base": <int> },
  "customer_series": { "<customer_id>": <int>, ... }
}
```

All six sections live in one object so a single read-modify-write commits an entire payment or series reset atomically.

**`customer_series`** maps each `customer_id` to their current active receipt base number (e.g., `"1111111111::ram": 135`). Updated atomically on first receipt creation and on "Start new series". Authoritative source; `_billing.current_receipt_base` in `session.json` is its rebuildable cache.

### 4.2 `receipts[]`

| Field | Type | Notes |
|---|---|---|
| receipt_id | string | customer-facing: "135", "135 A"… |
| customer_id | string | the `phone::name` key (see 4.7) |
| receipt_date | date | date money/items recorded; triggers allocation |
| payment | number / null | null for ITEMS_ONLY |
| mode | string | ITEMS_PAYMENT / ITEMS_ONLY / PAYMENT_ONLY |
| bill_receipt_first | bool | `true` only when actively set for ITEMS_PAYMENT; `false` for all other modes |
| created_at | datetime | audit timestamp |

### 4.3 `receipt_items[]` — the billed / unbilled tracker (one row per unit)

The source of truth for what is invoiced vs pending. One object per single unit (qty always 1).

| Field | Type | Notes |
|---|---|---|
| line_id | string | unique per unit within billing, e.g. `"135#1"`, `"135 A#2"` (receipt_id + "#" + sequence). Used by allocation and referenced by invoice entries. |
| receipt_id | string | originating receipt |
| customer_id | string | the `phone::name` key (lets allocation filter by customer without lookups) |
| product_code | string | catalogue code from the existing product/item file (repeats across units of the same product) |
| item_description | string | from product file |
| type | string | PRODUCT / SERVICE |
| price | number | unit price |
| amount | number | = price (one unit) — **pre-tax**, the invoice reads this |
| discount | number | per-unit discount (default 0) |
| gst_rate | number | percent; items may differ |
| taxed_total | number | locked tax-inclusive value — **allocation reads this** |
| sac_hsn_code | string | SAC (service) or HSN (product) |
| unit | string | PCS, KG, NOS… |
| status | string | PENDING / INVOICED |
| invoiced_in_seq | int / null | which `gst_seq` consumed it |

**Computed at creation, then locked:**
```
amount      = price            (one unit per row)
net_taxable = amount - discount
taxed_total = round( net_taxable * (1 + gst_rate/100) )   # rounding fixed here, stored
```

`product_code`, `item_description`, `price`, `sac_hsn_code`, `unit`, `gst_rate` come from the existing product/item file — the billing flow does not invent them. `line_id` is the only identifier billing assigns.

**Queue ordering:** `(receipt_date, line_id)` — oldest first.

### 4.4 `tax_invoices[]` — legacy bill shape, one entry per unit

One object per invoiced unit. Multiple objects sharing the same `gst_seq` form one invoice. Bill-level fields repeat on every entry of that `gst_seq`. **Keep these field names and their meaning aligned with the legacy CSV** so the GST report export is a direct field-to-column mapping.

**Bill-level fields** (identical on every entry of one `gst_seq`):

| Field | Notes |
|---|---|
| gst_seq | sequential GST filing number |
| receipt_id | the cash receipt that generated this bill (customer-facing) |
| date | **invoice date** — drives GST month, defaults to today |
| client_name | derived from the customer key (split on `::`) |
| client_phone | derived from the customer key (split on `::`) |
| client_address | from `_customer.address` in session.json |
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
| gst_rate | rate if all covered units share the same rate; `null` if mixed rates |
| billing_mode | always `"b2c"` — B2B removed |
| place_of_supply | supply state (from `_customer.state_code`) |
| buyer_gstin | legacy field — blank (B2B removed) |
| buyer_legal_name | legacy field — blank (B2B removed) |
| buyer_state_code | legacy field — seller state code (B2B removed) |
| reverse_charge | legacy field — `"N"` (B2B removed) |
| invoice_type | `"Tax Invoice"` |

**Line-level fields** (one per unit):

| Field | Notes |
|---|---|
| item_description | product/service name |
| price | unit price |
| quantity | 1 (stored per unit; rolled up for display — Section 11) |
| amount | price (pre-tax) |
| sac_hsn_code | SAC / HSN |
| unit | PCS, KG, NOS… |

**Tracking fields:**

| Field | Notes |
|---|---|
| source_receipt_id | the receipt the unit came from |
| source_line_id | reference to `receipt_items.line_id` |

**Invariants:**
```
total          = taxable_amount + gst_total
taxable_amount = sub_total - discount
gst_total      = cgst + sgst + igst
bill total     = SUM(taxed_total of covered units) = credit_ledger INVOICE amount for that bill
```

### 4.5 `credit_ledger[]` — tax-inclusive money journal (aggregate events only)

Records money events, never per-unit rows.

| Field | Type | Notes |
|---|---|---|
| txn_id | int | sequential id (max existing + 1) |
| customer_id | string | the `phone::name` key |
| type | string | PAYMENT / INVOICE / ADVANCE_CREDIT / CREDIT_USED |
| amount | number | **tax-inclusive** rupees |
| ref_id | string | PAYMENT → current receipt_id; INVOICE → gst_seq as string; ADVANCE_CREDIT → current receipt_id; CREDIT_USED → current receipt_id |
| date | date | |

**Note on CREDIT_USED `ref_id`:** Always the **current receipt_id** — the receipt that triggered the allocation which consumed the credit. It does not point back to whichever earlier receipt(s) generated the advance credit. This remains unambiguous even when advance credit was accumulated across multiple prior receipts.

### 4.6 `counters` and `customer_series`

**`counters`** — only business sequences that require a persistent counter:

| key | meaning |
|---|---|
| gst_seq | next GST filing number (strictly +1, no gaps) |
| receipt_base | next base receipt number available for assignment (globally sequential across all customers) |

Read value → use → increment → write back, **within the same in-memory mutation** that the payment then commits with one write.

**`customer_series`** — active receipt base per customer:

| key | meaning |
|---|---|
| `<customer_id>` | the base receipt number currently active for this customer (e.g., `135`) |

Set when a customer's first receipt is created (or their first "Start new series" since that creation). All suffix receipts for a customer derive from their entry here.

### 4.7 `session.json` — existing file, extended (no separate customer store)

The customer master lives here. Keyed by `phone::name` (e.g. `"1111111111::ram"`), which **is** the customer id.

```json
"1111111111::ram": {
  "10 KG Reduction (25 Sessions)": { "total": 25, "completed": 1 },
  "5 KG Reduction (15 Sessions)":  { "total": 15, "completed": 3 },
  "_customer": { "address": "...", "state_code": "33" },
  "_billing":  { "outstanding": 885, "advance_credit": 156, "current_receipt_base": 135 }
}
```

Rules:
- **Reserved prefix `_`.** Any non-service field is `_`-prefixed. The existing service loop must **skip keys starting with `_`** (the only change to existing service code).
- **`name` and `phone` are derived** by splitting the key on `::` — never stored.
- **`_customer`** stores only `address` and `state_code`. `state_code` defaults to `"33"`. `address` must be captured at billing time or the invoice prints blank.
- **`_billing`** is a **cache**, not source of truth. `outstanding` and `advance_credit` are rewritten after each `billing.json` commit. `current_receipt_base` mirrors `customer_series[customer_id]` in `billing.json`. All three are rebuildable from `billing.json` at startup.

---

## 5. Derived Values (truth is computed from `billing.json`)

```
Outstanding(customer)          = SUM(taxed_total) of receipt_items
                                 WHERE status='PENDING' AND customer_id = key

Advance Credit(customer)       = SUM(amount WHERE type='ADVANCE_CREDIT' AND customer_id=key)
                               - SUM(amount WHERE type='CREDIT_USED'    AND customer_id=key)

Current Receipt Base(customer) = customer_series[customer_id]

Next Receipt ID(customer)      = apply suffix formula (Section 6) using count of existing
                                 receipts for (customer_id, current base)

Receipt status                 = derived from its units' mix of PENDING/INVOICED
                                 (all pending / partial / all invoiced / payment-only)

GST filing list                = tax_invoices grouped by gst_seq, ordered by gst_seq
```

`session.json` `_billing` mirrors the first three formulas. They are a fast-read cache; the formulas above are authoritative.

---

## 6. Numbering Logic

### GST invoice number (`gst_seq`)
- Drawn from `counters.gst_seq`, incremented by exactly 1 per invoice, never reused, no gaps.
- Used only for GST filing and internal invoice identity.

### Customer-facing receipt number

Every receipt_id for a customer is built from their **active base** (stored in `customer_series`) plus a suffix determined by how many receipts already exist for that base.

**Suffix sequence** — the space between base and suffix is mandatory:

| Count of existing receipts on this base | receipt_id |
|---|---|
| 0 | `"135"` (no suffix) |
| 1 | `"135 A"` |
| 2 | `"135 B"` |
| … | … |
| 26 | `"135 Z"` |
| 27 | `"135 A1"` |
| 28 | `"135 B1"` |
| … | … |
| 52 | `"135 Z1"` |
| 53 | `"135 A2"` |
| … | … |

**Formula** — given `n` = count of existing receipts for `(customer_id, base)`:
```
if n == 0:
    receipt_id = str(base)
else:
    letter = chr(65 + (n - 1) % 26)          # A=0, B=1, …, Z=25
    number = (n - 1) // 26                    # 0 → omit, 1 → "1", 2 → "2", …
    suffix = letter + (str(number) if number > 0 else "")
    receipt_id = str(base) + " " + suffix
```

To count existing receipts for a base: filter `billing.json receipts[]` by `customer_id` and `receipt_id` starting with `str(base)`.

**First receipt for a new customer** (not yet in `customer_series`):
1. `base = counters.receipt_base ; counters.receipt_base += 1`
2. `customer_series[customer_id] = base`
3. `receipt_id = str(base)` (n=0, no suffix)

**Subsequent receipts for an existing customer:**
1. `base = customer_series[customer_id]`
2. Count existing receipts for this customer+base → `n`
3. Apply formula above → `receipt_id`

**"Start new series"** — see Section 9B.

The two numbering systems are fully independent. A tax invoice carries both its `gst_seq` (filing) and the originating `receipt_id` (customer).

---

## 7. Tax Calculation Rule

Seller state is the shop's state (`33`). Buyer state comes from `_customer.state_code` (defaults `33`).

```
IF buyer_state_code == seller_state_code:     # the normal case
    cgst = gst_total / 2
    sgst = gst_total / 2
    igst = 0
ELSE:
    igst = gst_total
    cgst = 0
    sgst = 0
```

`gst_total` per line = `net_taxable * gst_rate / 100`. Bill-level `gst_total` is the sum across covered units.

---

## 8. Bill Receipt First Flag

Relevant only when a receipt has **both** items and payment (`ITEMS_PAYMENT`).

| Flag | Behaviour |
|---|---|
| ON | The current receipt's own units go to the **front** of the allocation queue, invoiced before older pending units. |
| OFF | The current receipt's units go to the **back**; global FIFO runs oldest pending units first. |

Queue priority only — no effect on GST logic or amounts. Stored as `false` on all non-ITEMS_PAYMENT receipts.

---

## 9. Core Operations

### 9A. Process a Payment (one atomic write)

The heart of the system. All steps mutate an in-memory copy of `billing.json`; nothing touches disk until the single commit at the end.

```
LOAD billing.json into memory

  1. Resolve/assign receipt_id via numbering logic (Section 6); add the receipt entry.
     If customer is new (not in customer_series): allocate base from counters.receipt_base,
     set customer_series[customer_id] = base.

  2. If items are present on this receipt:
        Expand quantity to one row per unit.
        For each unit:
            compute amount, net_taxable, taxed_total (lock rounding)
            assign line_id = receipt_id + "#" + running index
            append to receipt_items with status = PENDING

  3. If mode is ITEMS_PAYMENT or PAYMENT_ONLY:
        Append PAYMENT ledger entry:
            type=PAYMENT, amount=payment, ref_id=receipt_id, date=receipt_date

  4. advance_credit = derived advance credit for this customer (Section 5)
     allocatable    = advance_credit + fresh_payment
     If advance_credit > 0:
        Append CREDIT_USED ledger entry:
            type=CREDIT_USED, amount=advance_credit, ref_id=receipt_id
        (Entire existing credit is consumed into allocatable; any unconsumed portion
         re-enters as ADVANCE_CREDIT in step 7.)

  5. Build the allocation queue:
        IF bill_receipt_first:
            this receipt's PENDING units first (in line_id order),
            then all other PENDING units for the customer ordered by (receipt_date, line_id)
        ELSE:
            all PENDING units for the customer ordered by (receipt_date, line_id)

  6. Walk the queue in order:
        for each unit:
            IF allocatable >= unit.taxed_total:
                mark unit INVOICED
                set unit.invoiced_in_seq = (the gst_seq about to be created)
                add unit to the current bill
                allocatable -= unit.taxed_total
            ELSE:
                stop (unit stays PENDING — never split)

  7. If at least one unit was covered:
        gst_seq = counters.gst_seq ; counters.gst_seq += 1
        Append one tax_invoices entry per covered unit, all sharing this gst_seq.
        Compute bill-level totals:
            sub_total      = SUM(unit.amount)
            discount       = SUM(unit.discount)
            taxable_amount = sub_total - discount
            service_total / product_total  by unit.type
            gst_total      = SUM(unit.net_taxable * unit.gst_rate / 100)
            cgst/sgst/igst  per Section 7
            total          = taxable_amount + gst_total
            date           = today  (invoice date; drives GST month)
            gst_rate       = common rate if all units share one rate; null if mixed
            client_name/client_phone  from customer_id (split on "::")
            client_address/place_of_supply  from _customer in session.json
        Append INVOICE ledger entry:
            type=INVOICE, amount=total (tax-inclusive), ref_id=str(gst_seq)

  8. If allocatable > 0 after the queue is exhausted:
        Append ADVANCE_CREDIT ledger entry:
            type=ADVANCE_CREDIT, amount=allocatable, ref_id=receipt_id

COMMIT: write billing.json to a temp file, then atomic-rename over the original.

THEN (cache refresh, outside the commit):
  Recompute outstanding, advance_credit, current_receipt_base for this customer (Section 5)
  Write them into session.json _billing  (temp-then-rename)
```

**Behaviour by receipt mode:**
- `ITEMS_ONLY`: steps 1–2 only, then commit. Units appended PENDING. No ledger entries.
- `PAYMENT_ONLY`: steps 1, 3–8 against existing PENDING units.
- `ITEMS_PAYMENT`: full flow 1–8; queue order set by the flag.

If anything fails before the commit, the on-disk `billing.json` is untouched — the payment simply did not happen.

---

### 9B. Start New Series (own atomic write)

Triggered by the shopkeeper via a UI button (with cooldown to prevent accidental double-press). No payment or items involved. The form on-screen stays untouched after this operation.

```
LOAD billing.json into memory
  new_base = counters.receipt_base ; counters.receipt_base += 1
  customer_series[customer_id] = new_base
COMMIT: write billing.json to a temp file, then atomic-rename over the original.

THEN (cache refresh):
  Write session.json _billing.current_receipt_base = new_base  (temp-then-rename)
```

The next receipt created for this customer will use `new_base` with no suffix (n=0).

---

## 10. Validation Rules

- `mode` must match content: ITEMS_ONLY has items and null payment; PAYMENT_ONLY has payment and no items; ITEMS_PAYMENT has both.
- `payment` (when present) must be > 0.
- `gst_rate` ≥ 0; per-unit `discount` ≤ `amount`.
- `taxed_total` must be recomputed-and-checked equal to the stored value at write time (guards rounding bugs).
- `_customer.state_code` present (defaults `33`) for any customer who receives a GST invoice; capture `address` for the invoice.
- `gst_seq` must equal previous max + 1 (no gaps, no reuse).
- Every covered unit must have exactly one `tax_invoices` entry and become `INVOICED` with `invoiced_in_seq` set — no unit invoiced twice.
- `customer_series[customer_id]` must exist before any receipt is created for that customer.

---

## 11. CSV Export and Invoice Generation

### CSV Export (legacy GST report)
- Read the `tax_invoices` array from `billing.json` and write rows in the **exact legacy column order and names** — one entry maps to one CSV row, bill-level fields repeated per row.
- `billing.json` is the source of truth; the CSV is a generated artifact.
- **Production mode:** on-demand (a command/button produces the CSV when the GST report is needed).

### Invoice / Receipt Generation (deferred — build later)
To reconstruct a full printable invoice for a given `gst_seq`:
1. Filter `tax_invoices[]` where `gst_seq = X` → all rows for this invoice
2. Bill-level fields: read from `rows[0]` — identical on every row of the same `gst_seq`
3. Line items: group rows by `product_code` within the `gst_seq` for display rollup
   (`quantity = count`, `amount = sum`) — stored data stays one-row-per-unit
4. Seller details (shop name, address, GSTIN): from shop config file — the only external dependency

No joins to other tables needed. `tax_invoices[]` is intentionally denormalized so generation is a pure read with one filter.

---

## 12. Reliability Requirements (JSON crash safety)

- **Atomic write:** every write (`billing.json` and `session.json`) is temp-file → `fsync` → atomic rename over the original. A crash mid-write leaves the previous good file intact.
- **One-file commit:** the entire payment is committed by a single `billing.json` rename (Section 9A). There is no partial-commit window inside `billing.json`.
- **Fixed write order:** (1) commit `billing.json`, then (2) refresh `session.json` `_billing`. A crash between them leaves `billing.json` fully correct and only the cached balances stale.
- **Startup verify & rebuild (required):** on launch, for every customer recompute `outstanding`, `advance_credit`, and `current_receipt_base` from `billing.json` (Sections 5 & 6), overwrite `_billing` in `session.json`, and run the reconciliation checks (Section 13). This silently repairs a stale cache from any crash and confirms the books are consistent.
- **Backup:** copy `billing.json` (and `session.json`) on a schedule, e.g. a timestamped copy before each day's first write.
- All money math uses the **stored** `taxed_total` — never recompute during allocation.
- Single writer only — no locking needed (one billing program owns the files).

---

## 13. Reconciliation Guarantee (build as automated checks; run at startup)

For every customer at every point in time:

```
SUM(PAYMENT)  ==  SUM(INVOICE) + advance_credit_outstanding

  where advance_credit_outstanding = SUM(ADVANCE_CREDIT) - SUM(CREDIT_USED)

  equivalently:  cash_in  ==  invoiced_taxed_total  +  advance_credit_held

For each gst_seq:
    credit_ledger INVOICE amount  ==  SUM(taxed_total of units invoiced in that seq)  ==  bill total

session.json _billing  ==  recomputed outstanding / advance_credit / current_receipt_base
```

If the first formula fails, either the cache drifted (startup rebuild corrects it) or `billing.json` itself is corrupt (flag for investigation). The per-gst_seq check confirms every invoice's stored total ties back to the individual unit values.

---

## 14. Worked Examples

All examples intra-state Tamil Nadu (CGST+SGST, IGST = 0). A ₹200 item @18%: `amount` 200, GST 36, **`taxed_total` 236**. Customer key shown as `phone::name`.

### Case A — Items only (Receipt 135, customer `1111111111::ram`)
```
Items: Item A 200/236, Item B 200/236, Item C 200/236     Payment: none
customer_series["1111111111::ram"] = 135  (new customer, base allocated)
Result: receipt_items 135#1, 135#2, 135#3 all PENDING. No ledger entries.
```

### Case B — Payment only ₹500 (Receipt 135 A)
```
allocatable = 0 + 500 = 500
Queue (global FIFO): A 236 ✓ (264 left) | B 236 ✓ (28 left) | C 236 ✗ stop → PENDING
Covered A,B → sub_total 400, gst_total 72, total 472. Leftover 28 → advance.  gst_seq = 1

receipt_items: 135#1, 135#2 → INVOICED (invoiced_in_seq=1); 135#3 PENDING
tax_invoices: 2 entries, gst_seq 1 (Item A, Item B), date = today
credit_ledger:
   PAYMENT        500  ref 135 A
   INVOICE        472  ref 1
   ADVANCE_CREDIT  28  ref 135 A
```

### Case C — Items + Payment ₹600, Bill Receipt First ON (Receipt 135 B)
```
New items: D 400/472, E 250/295, F 300/354
advance_credit 28 + payment 600 = 628
Step 3: PAYMENT 600 ref 135 B
Step 4: CREDIT_USED 28 ref 135 B  (current receipt, not source)
Queue (this receipt first): D 472 ✓ (156 left) | E 295 ✗ PENDING | F 354 ✗ PENDING
Then older pending: C 236 ✗ (156<236) PENDING
Covered D → sub_total 400, gst_total 72, total 472. Leftover 156 → advance.  gst_seq = 2

tax_invoices: 1 entry, gst_seq 2 (Item D)
credit_ledger:
   PAYMENT        600  ref 135 B
   CREDIT_USED     28  ref 135 B
   INVOICE        472  ref 2
   ADVANCE_CREDIT 156  ref 135 B

Reconcile: SUM(PAYMENT) = 1100  ==  SUM(INVOICE) + advance_credit = 944 + 156 = 1100 ✓
Outstanding (taxed): C 236 + E 295 + F 354 = 885.
```

### Case D — One payment spans multiple receipts (customer `2222222222::kumar`, Receipt 200 B, ₹900, flag OFF)
```
Pending before: 200 → P 200/236, Q 200/236, R 200/236 ; 200 A → S 150/177, T 250/295
allocatable 900, global FIFO oldest first:
   P 236 ✓ | Q 236 ✓ | R 236 ✓ (192 left) | S 177 ✓ (15 left) | T 295 ✗ PENDING
Covered P,Q,R,S → sub_total 750, gst_total 135, total 885. Leftover 15 → advance.  gst_seq = 3

tax_invoices: 4 entries, gst_seq 3, source_receipt_id = 200 for P,Q,R and 200 A for S
credit_ledger:
   PAYMENT        900  ref 200 B
   INVOICE        885  ref 3
   ADVANCE_CREDIT  15  ref 200 B
```
One invoice (gst_seq 3) legitimately spans units from two source receipts — captured via `source_receipt_id` per entry.

### Case E — Discount + service line (customer `3333333333::meena`, Receipt 140, ₹1652, flag ON)
```
Service "Stitching" SAC 9988, 1000 @18%, no discount → taxed_total 1180
Product "Buttons"  HSN 9606, 500 @18%, discount 100   → net 400, taxed_total 472
allocatable 1652: Service 1180 ✓ (472 left) | Buttons 472 ✓ (0 left). Both covered.  gst_seq = 4

Bill-level: sub_total 1500, discount 100, taxable_amount 1400,
            service_total 1000, product_total 400,
            cgst 126, sgst 126, igst 0, gst_total 252, total 1652,
            billing_mode "b2c", place_of_supply Tamil Nadu, invoice_type "Tax Invoice"
tax_invoices: 2 entries, gst_seq 4 (Stitching, Buttons)
credit_ledger:
   PAYMENT 1652 ref 140
   INVOICE 1652 ref 4
```

### Quantity expansion example (one-row-per-unit)
```
Receipt line "3 × Product A @200 (taxed 236 each)", payment 500:
  135#1 Product A 236 ✓ INVOICED   (264 left)
  135#2 Product A 236 ✓ INVOICED   (28 left)
  135#3 Product A 236 ✗ PENDING
Stored: three rows. Printed bill / CSV: rolled up to "Product A  qty 2  amount 400" on the invoice,
        with one unit still pending for a later bill.
```

### Customer ledger view — `1111111111::ram` after A–C (derived, taxed rupees)
```
DATE        TYPE         REF      DEBIT   CREDIT   OUTSTANDING
2025-05-10  Items In     135      708              708
2025-06-10  Payment      135 A            500
2025-06-10  Invoice      1        472
2025-06-10  Adv Credit   —                 28      236
2025-06-20  Items In     135 B    1121             1357
2025-06-20  Payment      135 B            600
2025-06-20  Credit Used  135 B     28
2025-06-20  Invoice      2        472
2025-06-20  Adv Credit   —                156      885
```
Outstanding 885 = C 236 + E 295 + F 354 (all tax-inclusive). Credit held 156.
`session.json _billing` = `{ outstanding: 885, advance_credit: 156, current_receipt_base: 135 }`.

### GST filing view (derived)
```
gst_seq  date         taxable_amount  gst_total  total
1        2025-06-10   400             72         472
2        2025-06-20   400             72         472
3        2025-06-12   750             135        885
4        2025-07-05   1400            252        1652
```
Report sees 1, 2, 3, 4 — strictly sequential. Customers see 135 A, 135 B, 200 B, 140 on their bills.

---

## 15. Open Items for the Client's CA (flag before go-live)

1. **Receipt naming**: confirm the customer-facing 135 / 135 A / 135 B scheme is acceptable alongside the strictly sequential `gst_seq` used for filing.
2. **Discount apportionment**: when a single bill mixes lines at **different GST rates**, a bill-level discount must be apportioned per rate. The examples keep discount at the **unit/line level** to avoid this. Confirm which approach the business uses.

---

## 16. Build Order

1. Define `billing.json` shape; seed `counters` and empty `customer_series`. Implement load + atomic write (temp → fsync → rename).
2. `session.json` integration: read `_customer`/`_billing`, derive name/phone from key, add the `_`-skip guard to the existing service loop.
3. Receipt numbering: suffix formula, new-customer base allocation, existing-customer suffix derivation.
4. `receipt_items` insertion with quantity expansion and locked `amount`/`taxed_total`.
5. "Start new series" operation (Section 9B) — own atomic write + session.json cache refresh.
6. Derived balances — `outstanding`, `advance_credit`, `current_receipt_base` — computed from `billing.json` (Section 5).
7. Process-a-Payment (Section 9A) — the core; cover all three modes and the flag; PAYMENT/CREDIT_USED/INVOICE/ADVANCE_CREDIT ledger entries; atomic `billing.json` commit; then refresh `_billing`.
8. Tax split (Section 7) and bill-total computation (used inside step 7).
9. Startup verify & rebuild (Section 12) + reconciliation self-checks (Section 13).
10. Backup routine (timestamped file copy before each day's first write).
11. UI integration on Produce Billing tab: customer selection, items entry, payment field, `bill_receipt_first` toggle, "Start new series" button (UI cooldown), "Generate Invoice" button.
12. CSV export in legacy column order with per-product display rollup (on-demand) — **deferred**.
13. Invoice / receipt print generation — **deferred**.
14. Transaction ledger tab — **deferred**.

---

*End of specification.*
