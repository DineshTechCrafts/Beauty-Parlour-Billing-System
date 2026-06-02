'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let _db = null;

function openDb(dbPath) {
    if (_db) return _db;
    _db = new Database(dbPath);
    _db.pragma('foreign_keys = ON');
    _db.pragma('journal_mode = WAL');
    initSchema(_db);
    return _db;
}

function closeDb() {
    if (_db) { _db.close(); _db = null; }
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function initSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS customers (
            customer_id  TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            phone        TEXT,
            gstin        TEXT,
            address      TEXT,
            state_code   TEXT NOT NULL DEFAULT '33'
        );

        CREATE TABLE IF NOT EXISTS receipts (
            receipt_id          TEXT PRIMARY KEY,
            customer_id         TEXT NOT NULL REFERENCES customers(customer_id),
            receipt_date        DATE NOT NULL,
            payment             REAL,
            mode                TEXT NOT NULL,
            bill_receipt_first  INTEGER NOT NULL DEFAULT 0,
            created_at          DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS receipt_items (
            item_id           TEXT PRIMARY KEY,
            receipt_id        TEXT NOT NULL REFERENCES receipts(receipt_id),
            customer_id       TEXT NOT NULL REFERENCES customers(customer_id),
            item_description  TEXT NOT NULL,
            type              TEXT NOT NULL,
            price             REAL NOT NULL,
            quantity          REAL NOT NULL,
            amount            REAL NOT NULL,
            discount          REAL NOT NULL DEFAULT 0,
            gst_rate          REAL NOT NULL,
            taxed_total       REAL NOT NULL,
            sac_hsn_code      TEXT,
            unit              TEXT,
            status            TEXT NOT NULL DEFAULT 'PENDING',
            invoiced_in_seq   INTEGER REFERENCES tax_invoices(gst_seq)
        );

        CREATE INDEX IF NOT EXISTS idx_receipt_items_customer_status
            ON receipt_items(customer_id, status);

        CREATE TABLE IF NOT EXISTS tax_invoices (
            row_id            INTEGER PRIMARY KEY AUTOINCREMENT,
            gst_seq           INTEGER NOT NULL,
            receipt_id        TEXT NOT NULL,
            date              DATE NOT NULL,
            client_name       TEXT NOT NULL,
            client_phone      TEXT,
            client_address    TEXT,
            sub_total         REAL NOT NULL,
            discount          REAL NOT NULL DEFAULT 0,
            cgst              REAL NOT NULL DEFAULT 0,
            sgst              REAL NOT NULL DEFAULT 0,
            igst              REAL NOT NULL DEFAULT 0,
            gst_total         REAL NOT NULL DEFAULT 0,
            taxable_amount    REAL NOT NULL,
            service_total     REAL NOT NULL DEFAULT 0,
            product_total     REAL NOT NULL DEFAULT 0,
            total             REAL NOT NULL,
            gst_rate          REAL NOT NULL DEFAULT 0,
            billing_mode      TEXT NOT NULL DEFAULT 'SERVICE',
            place_of_supply   TEXT,
            buyer_gstin       TEXT,
            buyer_legal_name  TEXT,
            buyer_state_code  TEXT,
            reverse_charge    TEXT NOT NULL DEFAULT 'N',
            invoice_type      TEXT NOT NULL DEFAULT 'Tax Invoice',
            item_description  TEXT NOT NULL,
            price             REAL NOT NULL,
            quantity          REAL NOT NULL,
            amount            REAL NOT NULL,
            sac_hsn_code      TEXT,
            unit              TEXT,
            source_receipt_id TEXT,
            source_item_id    TEXT
        );

        CREATE TABLE IF NOT EXISTS credit_ledger (
            txn_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id TEXT NOT NULL REFERENCES customers(customer_id),
            type        TEXT NOT NULL,
            amount      REAL NOT NULL,
            ref_id      TEXT,
            date        DATE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS counters (
            key   TEXT PRIMARY KEY,
            value INTEGER NOT NULL
        );
    `);

    // Seed counters if missing
    const seedCounter = db.prepare(
        `INSERT OR IGNORE INTO counters(key, value) VALUES (?, ?)`
    );
    seedCounter.run('gst_seq', 1);
    seedCounter.run('receipt_base', 100);
}

// ─── Counters ─────────────────────────────────────────────────────────────────

function readCounter(db, key) {
    return db.prepare('SELECT value FROM counters WHERE key = ?').get(key).value;
}

function incrementCounter(db, key) {
    db.prepare('UPDATE counters SET value = value + 1 WHERE key = ?').run(key);
}

// ─── Customer ID generation ───────────────────────────────────────────────────

function nextCustomerId(db) {
    const row = db.prepare(
        `SELECT customer_id FROM customers ORDER BY customer_id DESC LIMIT 1`
    ).get();
    if (!row) return 'C001';
    const num = parseInt(row.customer_id.slice(1), 10) + 1;
    return `C${String(num).padStart(3, '0')}`;
}

// ─── Receipt numbering ────────────────────────────────────────────────────────

/**
 * Returns the next receipt_id for a customer.
 * First receipt for a base gets the plain number (e.g. "135").
 * Subsequent ones get suffix A, B, C, ... (e.g. "135(A)").
 */
function nextReceiptId(db, customerId) {
    // Find if this customer already has receipts under the current base
    const base = readCounter(db, 'receipt_base');
    const existing = db.prepare(
        `SELECT receipt_id FROM receipts
         WHERE customer_id = ? AND (receipt_id = ? OR receipt_id LIKE ?)
         ORDER BY receipt_id`
    ).all(customerId, String(base), `${base}(%)`);

    if (existing.length === 0) {
        // First receipt for this base — consume the base counter
        incrementCounter(db, 'receipt_base');
        return String(base);
    }

    // Subsequent receipt — add next letter suffix
    const letter = String.fromCharCode(64 + existing.length); // A=65, so 1 existing → A
    return `${base}(${letter})`;
}

// ─── Item ID generation ───────────────────────────────────────────────────────

function nextItemId(db) {
    const row = db.prepare(
        `SELECT item_id FROM receipt_items ORDER BY item_id DESC LIMIT 1`
    ).get();
    if (!row) return 'I001';
    const num = parseInt(row.item_id.slice(1), 10) + 1;
    return `I${String(num).padStart(3, '0')}`;
}

function nextItemIds(db, count) {
    const ids = [];
    const row = db.prepare(
        `SELECT item_id FROM receipt_items ORDER BY item_id DESC LIMIT 1`
    ).get();
    let start = row ? parseInt(row.item_id.slice(1), 10) + 1 : 1;
    for (let i = 0; i < count; i++) {
        ids.push(`I${String(start + i).padStart(3, '0')}`);
    }
    return ids;
}

// ─── Tax calculation ──────────────────────────────────────────────────────────

function splitGst(gstTotal, buyerStateCode, sellerStateCode = '33') {
    if (buyerStateCode === sellerStateCode) {
        const half = Math.round((gstTotal / 2) * 100) / 100;
        return { cgst: half, sgst: gstTotal - half, igst: 0 };
    }
    return { cgst: 0, sgst: 0, igst: gstTotal };
}

// ─── Advance credit balance ───────────────────────────────────────────────────

function getAdvanceCredit(db, customerId) {
    const row = db.prepare(`
        SELECT
            COALESCE(SUM(CASE WHEN type = 'ADVANCE_CREDIT' THEN amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN type = 'CREDIT_USED'    THEN amount ELSE 0 END), 0)
          AS balance
        FROM credit_ledger
        WHERE customer_id = ?
    `).get(customerId);
    return row ? row.balance : 0;
}

// ─── processPayment (Section 9) ───────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {string} opts.customerId
 * @param {string} opts.receiptDate      ISO date string "YYYY-MM-DD"
 * @param {number|null} opts.payment     null for ITEMS_ONLY
 * @param {object[]} opts.items          [] for PAYMENT_ONLY
 * @param {boolean} opts.billReceiptFirst
 * @param {string} opts.invoiceDate      defaults to receiptDate
 * @param {string} opts.sellerStateCode  default '33'
 */
function processPayment(db, opts) {
    const {
        customerId,
        receiptDate,
        payment = null,
        items = [],
        billReceiptFirst = false,
        invoiceDate,
        sellerStateCode = '33',
    } = opts;

    const hasItems = items.length > 0;
    const hasPayment = payment !== null && payment > 0;

    let mode;
    if (hasItems && hasPayment) mode = 'ITEMS_PAYMENT';
    else if (hasItems) mode = 'ITEMS_ONLY';
    else if (hasPayment) mode = 'PAYMENT_ONLY';
    else throw new Error('Receipt must have items, payment, or both');

    const txn = db.transaction(() => {
        const now = new Date().toISOString();
        const invDate = invoiceDate || receiptDate;

        // Step 1: assign receipt_id
        const receiptId = nextReceiptId(db, customerId);

        db.prepare(`
            INSERT INTO receipts(receipt_id, customer_id, receipt_date, payment, mode, bill_receipt_first, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(receiptId, customerId, receiptDate, hasPayment ? payment : null, mode, billReceiptFirst ? 1 : 0, now);

        // Step 2: insert items
        const itemIds = [];
        if (hasItems) {
            const ids = nextItemIds(db, items.length);
            items.forEach((item, idx) => {
                const itemId = ids[idx];
                const amount = Math.round(item.price * item.quantity * 100) / 100;
                const discount = item.discount || 0;
                const netTaxable = amount - discount;
                const taxedTotal = Math.round(netTaxable * (1 + item.gstRate / 100));

                db.prepare(`
                    INSERT INTO receipt_items(
                        item_id, receipt_id, customer_id,
                        item_description, type, price, quantity, amount,
                        discount, gst_rate, taxed_total,
                        sac_hsn_code, unit, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
                `).run(
                    itemId, receiptId, customerId,
                    item.description, item.type || 'SERVICE',
                    item.price, item.quantity, amount,
                    discount, item.gstRate, taxedTotal,
                    item.sacHsnCode || null, item.unit || null
                );
                itemIds.push(itemId);
            });
        }

        if (!hasPayment) {
            return { receiptId, mode, invoiceSeq: null, covered: [] };
        }

        // Step 3: advance credit
        const advanceCredit = getAdvanceCredit(db, customerId);
        let allocatable = Math.round((advanceCredit + payment) * 100) / 100;

        if (advanceCredit > 0) {
            const creditToUse = Math.min(advanceCredit, allocatable);
            db.prepare(`
                INSERT INTO credit_ledger(customer_id, type, amount, ref_id, date)
                VALUES (?, 'CREDIT_USED', ?, ?, ?)
            `).run(customerId, creditToUse, receiptId, receiptDate);
        }

        // Record the fresh payment
        db.prepare(`
            INSERT INTO credit_ledger(customer_id, type, amount, ref_id, date)
            VALUES (?, 'PAYMENT', ?, ?, ?)
        `).run(customerId, payment, receiptId, receiptDate);

        // Step 4: build allocation queue
        let pendingItems;
        if (billReceiptFirst && hasItems) {
            const thisReceipt = db.prepare(`
                SELECT * FROM receipt_items
                WHERE receipt_id = ? AND status = 'PENDING'
                ORDER BY item_id
            `).all(receiptId);

            const otherPending = db.prepare(`
                SELECT ri.* FROM receipt_items ri
                JOIN receipts r ON ri.receipt_id = r.receipt_id
                WHERE ri.customer_id = ? AND ri.status = 'PENDING'
                  AND ri.receipt_id != ?
                ORDER BY r.receipt_date, ri.item_id
            `).all(customerId, receiptId);

            pendingItems = [...thisReceipt, ...otherPending];
        } else {
            pendingItems = db.prepare(`
                SELECT ri.* FROM receipt_items ri
                JOIN receipts r ON ri.receipt_id = r.receipt_id
                WHERE ri.customer_id = ? AND ri.status = 'PENDING'
                ORDER BY r.receipt_date, ri.item_id
            `).all(customerId);
        }

        // Step 5: walk the queue
        const covered = [];
        for (const item of pendingItems) {
            if (allocatable >= item.taxed_total) {
                covered.push(item);
                allocatable = Math.round((allocatable - item.taxed_total) * 100) / 100;
            } else {
                break; // never split an item
            }
        }

        let invoiceSeq = null;

        // Step 6: create invoice if items were covered
        if (covered.length > 0) {
            invoiceSeq = readCounter(db, 'gst_seq');
            incrementCounter(db, 'gst_seq');

            // Get customer info for invoice header
            const customer = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);

            // Compute bill-level totals
            let subTotal = 0, discountTotal = 0, serviceTotal = 0, productTotal = 0;
            let gstByRate = {};

            covered.forEach(item => {
                subTotal += item.amount;
                discountTotal += item.discount;
                const netTaxable = item.amount - item.discount;
                if (item.type === 'SERVICE') serviceTotal += netTaxable;
                else productTotal += netTaxable;

                const rate = item.gst_rate;
                if (!gstByRate[rate]) gstByRate[rate] = 0;
                gstByRate[rate] += netTaxable * rate / 100;
            });

            subTotal = Math.round(subTotal * 100) / 100;
            discountTotal = Math.round(discountTotal * 100) / 100;
            const taxableAmount = Math.round((subTotal - discountTotal) * 100) / 100;

            let gstTotal = 0;
            Object.values(gstByRate).forEach(v => { gstTotal += v; });
            gstTotal = Math.round(gstTotal * 100) / 100;

            const buyerStateCode = customer.state_code || '33';
            const { cgst, sgst, igst } = splitGst(gstTotal, buyerStateCode, sellerStateCode);
            const total = Math.round((taxableAmount + gstTotal) * 100) / 100;

            const types = [...new Set(covered.map(i => i.type))];
            const billingMode = types.length > 1 ? 'MIXED' : types[0] === 'SERVICE' ? 'SERVICE' : 'PRODUCT';

            const gstRates = [...new Set(covered.map(i => i.gst_rate))];
            const gstRateDisplay = gstRates.length === 1 ? gstRates[0] : 0;

            // Mark items INVOICED
            const markStmt = db.prepare(`
                UPDATE receipt_items SET status = 'INVOICED', invoiced_in_seq = ?
                WHERE item_id = ?
            `);
            covered.forEach(item => markStmt.run(invoiceSeq, item.item_id));

            // Insert tax_invoices rows
            const insertInvoice = db.prepare(`
                INSERT INTO tax_invoices(
                    gst_seq, receipt_id, date,
                    client_name, client_phone, client_address,
                    sub_total, discount, cgst, sgst, igst, gst_total,
                    taxable_amount, service_total, product_total, total,
                    gst_rate, billing_mode, place_of_supply,
                    buyer_gstin, buyer_legal_name, buyer_state_code,
                    reverse_charge, invoice_type,
                    item_description, price, quantity, amount,
                    sac_hsn_code, unit,
                    source_receipt_id, source_item_id
                ) VALUES (
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?,
                    ?, ?, ?, ?,
                    ?, ?,
                    ?, ?
                )
            `);

            covered.forEach(item => {
                insertInvoice.run(
                    invoiceSeq, receiptId, invDate,
                    customer.name, customer.phone || '', customer.address || '',
                    subTotal, discountTotal, cgst, sgst, igst, gstTotal,
                    taxableAmount, serviceTotal, productTotal, total,
                    gstRateDisplay, billingMode, buyerStateCode,
                    customer.gstin || '', customer.name, buyerStateCode,
                    'N', customer.gstin ? 'Tax Invoice' : 'Tax Invoice',
                    item.item_description, item.price, item.quantity, item.amount,
                    item.sac_hsn_code || null, item.unit || null,
                    item.receipt_id, item.item_id
                );
            });

            // INVOICE ledger entry (tax-inclusive = bill total)
            db.prepare(`
                INSERT INTO credit_ledger(customer_id, type, amount, ref_id, date)
                VALUES (?, 'INVOICE', ?, ?, ?)
            `).run(customerId, total, String(invoiceSeq), receiptDate);
        }

        // Step 7: advance credit for remainder
        if (allocatable > 0) {
            db.prepare(`
                INSERT INTO credit_ledger(customer_id, type, amount, ref_id, date)
                VALUES (?, 'ADVANCE_CREDIT', ?, ?, ?)
            `).run(customerId, allocatable, receiptId, receiptDate);
        }

        return { receiptId, mode, invoiceSeq, covered: covered.map(i => i.item_id) };
    });

    return txn();
}

// ─── Customer operations ──────────────────────────────────────────────────────

function createCustomer(db, data) {
    const id = data.customer_id || nextCustomerId(db);
    db.prepare(`
        INSERT INTO customers(customer_id, name, phone, gstin, address, state_code)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, data.name, data.phone || null, data.gstin || null, data.address || null, data.state_code || '33');
    return id;
}

function getCustomer(db, customerId) {
    return db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
}

function listCustomers(db) {
    return db.prepare('SELECT * FROM customers ORDER BY name').all();
}

function updateCustomer(db, customerId, data) {
    db.prepare(`
        UPDATE customers SET name=?, phone=?, gstin=?, address=?, state_code=?
        WHERE customer_id=?
    `).run(data.name, data.phone || null, data.gstin || null, data.address || null, data.state_code || '33', customerId);
}

// ─── Derived queries ──────────────────────────────────────────────────────────

function getOutstanding(db, customerId) {
    const row = db.prepare(`
        SELECT COALESCE(SUM(taxed_total), 0) AS outstanding
        FROM receipt_items
        WHERE customer_id = ? AND status = 'PENDING'
    `).get(customerId);
    return row ? row.outstanding : 0;
}

function getPendingItems(db, customerId) {
    return db.prepare(`
        SELECT ri.*, r.receipt_date
        FROM receipt_items ri
        JOIN receipts r ON ri.receipt_id = r.receipt_id
        WHERE ri.customer_id = ? AND ri.status = 'PENDING'
        ORDER BY r.receipt_date, ri.item_id
    `).all(customerId);
}

function getCustomerLedger(db, customerId) {
    // Returns receipts and ledger entries merged, sorted by date
    const receipts = db.prepare(`
        SELECT receipt_id AS ref, receipt_date AS date, mode, payment
        FROM receipts WHERE customer_id = ? ORDER BY receipt_date, receipt_id
    `).all(customerId);

    const ledger = db.prepare(`
        SELECT * FROM credit_ledger
        WHERE customer_id = ? ORDER BY date, txn_id
    `).all(customerId);

    return { receipts, ledger };
}

function getGstFilingList(db) {
    return db.prepare(`
        SELECT
            gst_seq, date, client_name, receipt_id,
            taxable_amount, gst_total, total,
            cgst, sgst, igst, billing_mode, invoice_type,
            buyer_gstin
        FROM tax_invoices
        GROUP BY gst_seq
        ORDER BY gst_seq
    `).all();
}

function getInvoiceLines(db, gstSeq) {
    return db.prepare(`
        SELECT * FROM tax_invoices WHERE gst_seq = ? ORDER BY row_id
    `).all(gstSeq);
}

function getReceiptItems(db, receiptId) {
    return db.prepare(
        'SELECT * FROM receipt_items WHERE receipt_id = ? ORDER BY item_id'
    ).all(receiptId);
}

function listReceipts(db, customerId) {
    const clause = customerId ? 'WHERE customer_id = ?' : '';
    const args = customerId ? [customerId] : [];
    return db.prepare(
        `SELECT * FROM receipts ${clause} ORDER BY receipt_date DESC, receipt_id DESC`
    ).all(...args);
}

// ─── CSV export (legacy format, on-demand) ────────────────────────────────────

const CSV_HEADER = [
    'gst_seq','receipt_id','date','client_name','client_phone','client_address',
    'sub_total','discount','cgst','sgst','igst','gst_total',
    'taxable_amount','service_total','product_total','total',
    'gst_rate','billing_mode','place_of_supply',
    'buyer_gstin','buyer_legal_name','buyer_state_code',
    'reverse_charge','invoice_type',
    'item_description','price','quantity','amount',
    'sac_hsn_code','unit',
    'source_receipt_id','source_item_id'
].join(',');

function escapeCsv(val) {
    const s = String(val == null ? '' : val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function exportCsv(db) {
    const rows = db.prepare(
        `SELECT * FROM tax_invoices ORDER BY gst_seq, row_id`
    ).all();

    const lines = [CSV_HEADER];
    rows.forEach(r => {
        const cols = [
            r.gst_seq, r.receipt_id, r.date, r.client_name, r.client_phone, r.client_address,
            r.sub_total, r.discount, r.cgst, r.sgst, r.igst, r.gst_total,
            r.taxable_amount, r.service_total, r.product_total, r.total,
            r.gst_rate, r.billing_mode, r.place_of_supply,
            r.buyer_gstin, r.buyer_legal_name, r.buyer_state_code,
            r.reverse_charge, r.invoice_type,
            r.item_description, r.price, r.quantity, r.amount,
            r.sac_hsn_code, r.unit,
            r.source_receipt_id, r.source_item_id
        ];
        lines.push(cols.map(escapeCsv).join(','));
    });
    return lines.join('\n');
}

// ─── Reconciliation self-check (Section 13) ───────────────────────────────────

function reconcile(db) {
    const errors = [];

    // Per customer: SUM(PAYMENT) + SUM(CREDIT_USED) == SUM(INVOICE) + advance_credit
    const customers = db.prepare('SELECT customer_id FROM customers').all();
    for (const { customer_id } of customers) {
        const rows = db.prepare(
            `SELECT type, SUM(amount) AS total FROM credit_ledger
             WHERE customer_id = ? GROUP BY type`
        ).all(customer_id);

        const byType = {};
        rows.forEach(r => { byType[r.type] = r.total; });

        const payment = byType['PAYMENT'] || 0;
        const creditUsed = byType['CREDIT_USED'] || 0;
        const invoice = byType['INVOICE'] || 0;
        const advance = (byType['ADVANCE_CREDIT'] || 0) - creditUsed;

        const lhs = Math.round((payment + creditUsed) * 100);
        const rhs = Math.round((invoice + advance) * 100);

        if (lhs !== rhs) {
            errors.push({
                customer_id,
                error: `Cash balance mismatch: in=${(payment + creditUsed).toFixed(2)} out=${invoice.toFixed(2)} advance=${advance.toFixed(2)}`
            });
        }
    }

    // Per gst_seq: INVOICE ledger == SUM(taxed_total of covered items)
    const seqs = db.prepare(
        `SELECT DISTINCT gst_seq FROM tax_invoices`
    ).all();

    for (const { gst_seq } of seqs) {
        const invoiceRow = db.prepare(
            `SELECT amount FROM credit_ledger WHERE type='INVOICE' AND ref_id=?`
        ).get(String(gst_seq));

        const itemsRow = db.prepare(
            `SELECT COALESCE(SUM(taxed_total),0) AS total
             FROM receipt_items WHERE invoiced_in_seq = ?`
        ).get(gst_seq);

        const billRow = db.prepare(
            `SELECT total FROM tax_invoices WHERE gst_seq = ? LIMIT 1`
        ).get(gst_seq);

        const ledgerAmt = invoiceRow ? Math.round(invoiceRow.amount * 100) : null;
        const itemsAmt = Math.round((itemsRow ? itemsRow.total : 0) * 100);
        const billAmt = billRow ? Math.round(billRow.total * 100) : null;

        if (ledgerAmt !== null && ledgerAmt !== itemsAmt) {
            errors.push({
                gst_seq,
                error: `Ledger INVOICE ${invoiceRow.amount} != items taxed_total ${itemsRow.total}`
            });
        }
        if (billAmt !== null && billAmt !== itemsAmt) {
            errors.push({
                gst_seq,
                error: `Bill total ${billRow.total} != items taxed_total ${itemsRow.total}`
            });
        }
    }

    // gst_seq must be strictly sequential
    const allSeqs = db.prepare(
        `SELECT DISTINCT gst_seq FROM tax_invoices ORDER BY gst_seq`
    ).all().map(r => r.gst_seq);
    for (let i = 1; i < allSeqs.length; i++) {
        if (allSeqs[i] !== allSeqs[i - 1] + 1) {
            errors.push({ error: `gst_seq gap between ${allSeqs[i - 1]} and ${allSeqs[i]}` });
        }
    }

    return errors;
}

// ─── Backup ───────────────────────────────────────────────────────────────────

function backup(db, destPath) {
    db.exec(`VACUUM INTO '${destPath.replace(/'/g, "''")}'`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

module.exports = {
    openDb,
    closeDb,

    // Customer
    createCustomer: (dbPath, data) => { const db = openDb(dbPath); return createCustomer(db, data); },
    getCustomer: (dbPath, id) => { const db = openDb(dbPath); return getCustomer(db, id); },
    listCustomers: (dbPath) => { const db = openDb(dbPath); return listCustomers(db); },
    updateCustomer: (dbPath, id, data) => { const db = openDb(dbPath); return updateCustomer(db, id, data); },

    // Receipts
    processPayment: (dbPath, opts) => { const db = openDb(dbPath); return processPayment(db, opts); },
    listReceipts: (dbPath, customerId) => { const db = openDb(dbPath); return listReceipts(db, customerId); },
    getReceiptItems: (dbPath, receiptId) => { const db = openDb(dbPath); return getReceiptItems(db, receiptId); },

    // Derived
    getOutstanding: (dbPath, customerId) => { const db = openDb(dbPath); return getOutstanding(db, customerId); },
    getPendingItems: (dbPath, customerId) => { const db = openDb(dbPath); return getPendingItems(db, customerId); },
    getAdvanceCredit: (dbPath, customerId) => { const db = openDb(dbPath); return getAdvanceCredit(db, customerId); },
    getCustomerLedger: (dbPath, customerId) => { const db = openDb(dbPath); return getCustomerLedger(db, customerId); },
    getGstFilingList: (dbPath) => { const db = openDb(dbPath); return getGstFilingList(db); },
    getInvoiceLines: (dbPath, gstSeq) => { const db = openDb(dbPath); return getInvoiceLines(db, gstSeq); },

    // Export / admin
    exportCsv: (dbPath) => { const db = openDb(dbPath); return exportCsv(db); },
    reconcile: (dbPath) => { const db = openDb(dbPath); return reconcile(db); },
    backup: (dbPath, destPath) => { const db = openDb(dbPath); return backup(db, destPath); },
};
