/**
 * End-to-end test of the credit system without Electron.
 * Runs directly in Node to verify db.cjs + processPayment work correctly.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const billingDb = require('./electron/db.cjs');

const dbPath = path.join(__dirname, 'data', 'billing-test.db');

// clean slate
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

console.log('=== Credit system end-to-end test ===\n');

let pass = 0, fail = 0;
const ok = l => { console.log('  ✓', l); pass++; };
const err = (l, d) => { console.log('  ✗', l, d || ''); fail++; };

// 1. findOrCreateCustomer
const custId = billingDb.findOrCreateCustomer(dbPath, {
  phone: '9876543210', name: 'Priya Test', address: '10 Main St', stateCode: '33'
});
custId === 'C001' ? ok(`Customer created: ${custId}`) : err('Customer ID wrong', custId);

// 2. Second call same phone → returns same ID, updates name
const custId2 = billingDb.findOrCreateCustomer(dbPath, {
  phone: '9876543210', name: 'Priya Updated', address: '10 Main St', stateCode: '33'
});
custId2 === 'C001' ? ok('Same phone → same customer ID') : err('Duplicate customer', custId2);

const cust = billingDb.getCustomer(dbPath, 'C001');
cust.name === 'Priya Updated' ? ok('Name updated on re-visit') : err('Name not updated', cust?.name);

// 3. processPayment — ITEMS_PAYMENT
const result = billingDb.processPayment(dbPath, {
  customerId: 'C001',
  receiptDate: '2025-06-10',
  payment: 1416,   // covers both items (1180 + 590 = 1770, only 1180 covered by 1416 → actually covers 1180, leaves 236)
  items: [
    { description: 'Facial (2/10)', type: 'SERVICE', price: 1000, quantity: 1, discount: 0, gstRate: 18 },
    { description: 'Haircut',       type: 'SERVICE', price: 500,  quantity: 1, discount: 0, gstRate: 18 },
  ],
  billReceiptFirst: true,
  invoiceDate: '2025-06-10',
  sellerStateCode: '33',
});
result.receiptId ? ok(`Receipt created: ${result.receiptId}`) : err('No receiptId');
result.mode === 'ITEMS_PAYMENT' ? ok(`Mode: ${result.mode}`) : err('Wrong mode', result.mode);
result.invoiceSeq === 1 ? ok(`Invoice seq: ${result.invoiceSeq}`) : err('Wrong invoiceSeq', result.invoiceSeq);
result.covered.length === 1 ? ok(`1 item covered (Facial 1180, payment 1416 left 236 for Haircut 590)`) : err('Wrong covered count', result.covered.length);

// 4. Outstanding
const outstanding = billingDb.getOutstanding(dbPath, 'C001');
outstanding === 590 ? ok(`Outstanding: ₹${outstanding} (Haircut pending)`) : err('Wrong outstanding', outstanding);

// 5. Advance credit
const credit = billingDb.getAdvanceCredit(dbPath, 'C001');
credit === 236 ? ok(`Advance credit: ₹${credit}`) : err('Wrong advance credit', credit);

// 6. Pending items
const pending = billingDb.getPendingItems(dbPath, 'C001');
pending.length === 1 && pending[0].item_description === 'Haircut'
  ? ok('Pending item: Haircut')
  : err('Wrong pending items', JSON.stringify(pending.map(p => p.item_description)));

// 7. Ledger
const { ledger } = billingDb.getCustomerLedger(dbPath, 'C001');
const types = ledger.map(e => e.type);
['PAYMENT','INVOICE','ADVANCE_CREDIT'].every(t => types.includes(t))
  ? ok(`Ledger has PAYMENT, INVOICE, ADVANCE_CREDIT`)
  : err('Ledger entries wrong', types.join(', '));

// 8. GST filing
const filing = billingDb.getGstFilingList(dbPath);
filing.length === 1 && filing[0].gst_seq === 1
  ? ok(`GST filing: 1 invoice, seq 1`)
  : err('GST filing wrong', filing.length);

// 9. Reconciliation
const errors = billingDb.reconcile(dbPath);
errors.length === 0 ? ok('Reconciliation: all checks pass') : err('Reconciliation errors', JSON.stringify(errors));

console.log(`\n${pass} passed  ${fail > 0 ? fail + ' FAILED' : '0 failed'}\n`);

// clean up
fs.unlinkSync(dbPath);
billingDb.closeDb();
