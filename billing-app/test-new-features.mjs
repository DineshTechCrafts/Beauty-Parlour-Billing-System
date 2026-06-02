/**
 * New-feature test suite — SQLite billing system
 * Tests: ReceiptTab, CustomerLedgerTab, GstFilingTab
 * Boilerplate mirrors test-app.mjs: Playwright Chromium + Vite dev server,
 * window.electronAPI stubbed (both legacy + new db namespace).
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(__dirname, 'test-shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let passed = 0, failed = 0;
const ok   = label        => { console.log(`  ✓ ${label}`); passed++; };
const fail = (label, det) => { console.log(`  ✗ ${label}${det ? ' — ' + det : ''}`); failed++; };
const log  = msg          => console.log(`  ${msg}`);
const stripAnsi = s => s.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');

async function ss(page, name) {
  const f = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: f, fullPage: false });
  log(`screenshot → test-shots/${name}.png`);
}

async function ev(page, expr) {
  try { return await page.evaluate(expr); } catch { return null; }
}

/** Fills a React-controlled text input by dispatching native events. */
async function reactFill(page, selector, value) {
  await page.evaluate(({ s, v }) => {
    const el = document.querySelector(s);
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { s: selector, v: value });
}

/** Changes a React-controlled select by value. */
async function reactSelect(page, selectFinder, value) {
  await page.evaluate(({ finder, v }) => {
    // finder is JS code that returns the <select> element
    const el = eval(finder); // eslint-disable-line no-eval
    if (!el) return;
    el.value = v;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { finder: selectFinder, v: value });
}

/** Clicks a .nav-item by label text. */
async function navClick(page, labelText) {
  await page.evaluate(t => {
    [...document.querySelectorAll('.nav-item')]
      .find(el => el.textContent?.includes(t))?.click();
  }, labelText);
  await page.waitForTimeout(1000);
}

// ── Stub data ─────────────────────────────────────────────────────────────────

const CUSTOMERS = [
  { customer_id: 'C001', name: 'Rajan Kumar',   phone: '9876543210', gstin: null,                address: '10 Main St', state_code: '33' },
  { customer_id: 'C002', name: 'Priya Sharma',  phone: '9123456789', gstin: '33ABCDE1234F1Z5', address: '20 Park Ave', state_code: '33' },
];

const PENDING_ITEMS = [
  { item_id: 'I001', receipt_id: '135',  customer_id: 'C001', item_description: 'Facial',  type: 'SERVICE', price: 1000, quantity: 1, amount: 1000, discount: 0, gst_rate: 18, taxed_total: 1180, sac_hsn_code: null, unit: null, status: 'PENDING', invoiced_in_seq: null, receipt_date: '2025-05-10' },
  { item_id: 'I002', receipt_id: '135',  customer_id: 'C001', item_description: 'Haircut', type: 'SERVICE', price: 500,  quantity: 1, amount: 500,  discount: 0, gst_rate: 18, taxed_total: 590,  sac_hsn_code: null, unit: null, status: 'PENDING', invoiced_in_seq: null, receipt_date: '2025-05-10' },
];

const LEDGER = [
  { txn_id: 1, customer_id: 'C001', type: 'PAYMENT',        amount: 500, ref_id: '135(A)', date: '2025-06-10' },
  { txn_id: 2, customer_id: 'C001', type: 'INVOICE',        amount: 472, ref_id: '1',      date: '2025-06-10' },
  { txn_id: 3, customer_id: 'C001', type: 'ADVANCE_CREDIT', amount:  28, ref_id: '135(A)', date: '2025-06-10' },
];

const GST_FILING = [
  { gst_seq: 1, date: '2025-06-10', client_name: 'Rajan Kumar', receipt_id: '135(A)', taxable_amount: 400, gst_total: 72,  total: 472, cgst: 36, sgst: 36, igst: 0, billing_mode: 'SERVICE', invoice_type: 'Tax Invoice', buyer_gstin: '' },
  { gst_seq: 2, date: '2025-06-20', client_name: 'Rajan Kumar', receipt_id: '135(B)', taxable_amount: 400, gst_total: 72,  total: 472, cgst: 36, sgst: 36, igst: 0, billing_mode: 'SERVICE', invoice_type: 'Tax Invoice', buyer_gstin: '' },
];

const INVOICE_LINES = [
  { row_id: 1, gst_seq: 1, receipt_id: '135(A)', date: '2025-06-10', client_name: 'Rajan Kumar', client_phone: '9876543210', client_address: '10 Main St', sub_total: 400, discount: 0, cgst: 36, sgst: 36, igst: 0, gst_total: 72, taxable_amount: 400, service_total: 400, product_total: 0, total: 472, gst_rate: 18, billing_mode: 'SERVICE', place_of_supply: '33', buyer_gstin: '', buyer_legal_name: 'Rajan Kumar', buyer_state_code: '33', reverse_charge: 'N', invoice_type: 'Tax Invoice', item_description: 'Facial',  price: 1000, quantity: 1, amount: 1000, sac_hsn_code: null, unit: null, source_receipt_id: '135', source_item_id: 'I001' },
  { row_id: 2, gst_seq: 1, receipt_id: '135(A)', date: '2025-06-10', client_name: 'Rajan Kumar', client_phone: '9876543210', client_address: '10 Main St', sub_total: 400, discount: 0, cgst: 36, sgst: 36, igst: 0, gst_total: 72, taxable_amount: 400, service_total: 400, product_total: 0, total: 472, gst_rate: 18, billing_mode: 'SERVICE', place_of_supply: '33', buyer_gstin: '', buyer_legal_name: 'Rajan Kumar', buyer_state_code: '33', reverse_charge: 'N', invoice_type: 'Tax Invoice', item_description: 'Haircut', price:  500, quantity: 1, amount:  500, sac_hsn_code: null, unit: null, source_receipt_id: '135', source_item_id: 'I002' },
];

// ── Start Vite ─────────────────────────────────────────────────────────────────
console.log('\n=== New Features Test Suite (SQLite billing) ===\n');
log('Starting Vite dev server on :5173...');

const vite = spawn('npx', ['vite', '--port', '5173'], {
  cwd: __dirname, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
});

let vitePort = null;
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('Vite did not start within 30s')), 30000);
  vite.stdout.on('data', d => {
    const clean = stripAnsi(d.toString());
    const m = clean.match(/localhost:(\d+)/);
    if (m) { vitePort = m[1]; clearTimeout(t); resolve(); }
  });
  vite.stderr.on('data', d => {
    const c = stripAnsi(d.toString());
    if (c.includes('address already in use')) { clearTimeout(t); reject(new Error('Port 5173 in use')); }
  });
});
log(`Vite ready at http://localhost:${vitePort}`);

// ── Browser + stub ────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.addInitScript(({ customers, pendingItems, ledger, gstFiling, invoiceLines }) => {
  window.electronAPI = {
    // Legacy handlers — keep app from crashing when other tabs load
    getInventory:  () => Promise.resolve({ success: true, data: [] }),
    saveInventory: () => Promise.resolve({ success: true }),
    getBills:      () => Promise.resolve({ success: true, data: 'BillId,Date,ClientName,ClientPhone,ClientAddress,SubTotal,Discount,CGST,SGST,Total,ItemDescription,Price,Quantity,Amount\n' }),
    saveBill:      () => Promise.resolve({ success: true }),
    getNextBillId: () => Promise.resolve({ success: true, data: 1 }),
    savePdf:       () => Promise.resolve({ success: true }),
    getSessions:   () => Promise.resolve({ success: true, data: {} }),
    saveSessions:  () => Promise.resolve({ success: true }),

    // New SQLite DB handlers
    db: {
      listCustomers:   ()      => Promise.resolve({ success: true, data: customers }),
      getCustomer:     (id)    => Promise.resolve({ success: true, data: customers.find(c => c.customer_id === id) || null }),
      createCustomer:  ()      => Promise.resolve({ success: true, data: 'C003' }),
      updateCustomer:  ()      => Promise.resolve({ success: true }),

      processPayment:  (opts)  => Promise.resolve({ success: true, data: { receiptId: '135(A)', mode: opts.items?.length > 0 ? 'ITEMS_PAYMENT' : 'PAYMENT_ONLY', invoiceSeq: 1, covered: ['I001', 'I002'] } }),
      listReceipts:    ()      => Promise.resolve({ success: true, data: [] }),
      getReceiptItems: ()      => Promise.resolve({ success: true, data: [] }),

      getOutstanding:    ()    => Promise.resolve({ success: true, data: 1770 }),
      getPendingItems:   (id)  => Promise.resolve({ success: true, data: id === 'C001' ? pendingItems : [] }),
      getAdvanceCredit:  ()    => Promise.resolve({ success: true, data: 100 }),
      getCustomerLedger: (id)  => Promise.resolve({ success: true, data: { receipts: [], ledger: id === 'C001' ? ledger : [] } }),

      getGstFiling:  ()        => Promise.resolve({ success: true, data: gstFiling }),
      getInvoiceLines: (seq)   => Promise.resolve({ success: true, data: seq === 1 ? invoiceLines : [] }),

      exportCsv:  () => Promise.resolve({ success: true, data: 'C:\\data\\bills_export.csv' }),
      reconcile:  () => Promise.resolve({ success: true, data: [] }),
      backup:     () => Promise.resolve({ success: true, data: 'C:\\data\\billing_backup_20250603_1200.db' }),
    },
  };
}, { customers: CUSTOMERS, pendingItems: PENDING_ITEMS, ledger: LEDGER, gstFiling: GST_FILING, invoiceLines: INVOICE_LINES });

await page.goto(`http://localhost:${vitePort}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Helper — finds the mode select (has 'ITEMS_ONLY' as an option value)
const MODE_SELECT_FINDER = `[...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'ITEMS_ONLY'))`;
// Helper — finds the customer select (has option value 'C001')
const CUST_SELECT_FINDER = `[...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'C001'))`;

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — ReceiptTab
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── ReceiptTab ──────────────────────────────────────────────────────────\n');

// [1] Tab renders
console.log('[1] Receipt tab renders');
await navClick(page, 'New Receipt');
const receiptH1 = await ev(page, `document.querySelector('h1')?.textContent`);
receiptH1?.includes('New Receipt')
  ? ok(`Tab title: "${receiptH1}"`)
  : fail('Receipt tab title wrong', receiptH1);
await ss(page, 'db-01-receipt-tab');

// [2] Customer dropdown populated from stub
console.log('\n[2] Customer dropdown populated');
const allOptions = await ev(page, `[...document.querySelectorAll('select option')].map(o => o.value)`);
allOptions?.includes('C001') ? ok('C001 in dropdown') : fail('C001 missing', JSON.stringify(allOptions));
allOptions?.includes('C002') ? ok('C002 in dropdown') : fail('C002 missing');
const custNames  = await ev(page, `[...document.querySelectorAll('select option')].map(o => o.textContent)`);
custNames?.some(n => n.includes('Rajan Kumar'))  ? ok('"Rajan Kumar" rendered')  : fail('"Rajan Kumar" missing');
custNames?.some(n => n.includes('Priya Sharma')) ? ok('"Priya Sharma" rendered') : fail('"Priya Sharma" missing');

// [3] New Customer form expands / collapses
console.log('\n[3] New Customer form toggle');
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('New Customer'))?.click();
});
await page.waitForTimeout(400);
const formExpanded = await ev(page, `document.querySelector('input[placeholder="Name *"]') !== null`);
formExpanded ? ok('New Customer form expands') : fail('Form did not expand');
await ss(page, 'db-02-new-customer-form');

await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel')?.click();
});
await page.waitForTimeout(300);
const formCollapsed = await ev(page, `document.querySelector('input[placeholder="Name *"]') === null`);
formCollapsed ? ok('Form collapses on Cancel') : fail('Form did not collapse');

// [4] Mode selector has all 3 options
console.log('\n[4] Mode selector options');
const modeOpts = await ev(page, `
  const s = ${MODE_SELECT_FINDER};
  s ? [...s.options].map(o => o.value) : null
`);
modeOpts?.length === 3        ? ok('Mode selector has 3 options')       : fail('Mode option count wrong', modeOpts?.length);
modeOpts?.includes('ITEMS_PAYMENT') ? ok('ITEMS_PAYMENT option present') : fail('ITEMS_PAYMENT missing');
modeOpts?.includes('ITEMS_ONLY')    ? ok('ITEMS_ONLY option present')    : fail('ITEMS_ONLY missing');
modeOpts?.includes('PAYMENT_ONLY')  ? ok('PAYMENT_ONLY option present')  : fail('PAYMENT_ONLY missing');

// [5] Items table has at least one empty row in default (ITEMS_PAYMENT) mode
console.log('\n[5] Items table default row');
const itemRows = await ev(page, `document.querySelectorAll('tbody tr').length`);
itemRows >= 1 ? ok(`Items table has ${itemRows} row(s)`) : fail('No item rows in table');

// [6] Payment field visible in ITEMS_PAYMENT (default)
console.log('\n[6] Payment field visible by default');
const payInput = await ev(page, `document.querySelector('input[placeholder="0.00"]') !== null`);
payInput ? ok('Payment field present in ITEMS_PAYMENT mode') : fail('Payment field missing');

// [7] Bill Receipt First checkbox present in ITEMS_PAYMENT
console.log('\n[7] Bill Receipt First checkbox');
const brf = await ev(page, `[...document.querySelectorAll('input[type="checkbox"]')].length`);
brf >= 1 ? ok('Bill Receipt First checkbox present') : fail('BRF checkbox missing');

// [8] Add Item adds a row
console.log('\n[8] Add Item button');
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Add Item'))?.click();
});
await page.waitForTimeout(300);
const rowsAfterAdd = await ev(page, `document.querySelectorAll('tbody tr').length`);
rowsAfterAdd === 2 ? ok('Add Item inserts a row') : fail(`Expected 2 rows, got ${rowsAfterAdd}`);

// [9] Remove button removes a row
console.log('\n[9] Remove item button');
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '×');
  btns[btns.length - 1]?.click();
});
await page.waitForTimeout(300);
const rowsAfterRemove = await ev(page, `document.querySelectorAll('tbody tr').length`);
rowsAfterRemove === 1 ? ok('Remove button removes a row') : fail(`Expected 1 row, got ${rowsAfterRemove}`);

// [10] ITEMS_ONLY hides payment field and invoice date
console.log('\n[10] ITEMS_ONLY mode');
await reactSelect(page, MODE_SELECT_FINDER, 'ITEMS_ONLY');
await page.waitForTimeout(400);
const payGone = await ev(page, `document.querySelector('input[placeholder="0.00"]') === null`);
payGone ? ok('Payment field hidden in ITEMS_ONLY') : fail('Payment field still visible in ITEMS_ONLY');
const itemsStillShown = await ev(page, `document.querySelector('table') !== null`);
itemsStillShown ? ok('Items table still shown in ITEMS_ONLY') : fail('Items table disappeared in ITEMS_ONLY');
await ss(page, 'db-03-items-only-mode');

// [11] PAYMENT_ONLY hides items table, shows payment field
console.log('\n[11] PAYMENT_ONLY mode');
await reactSelect(page, MODE_SELECT_FINDER, 'PAYMENT_ONLY');
await page.waitForTimeout(400);
const tableGone = await ev(page, `document.querySelector('table') === null`);
tableGone ? ok('Items table hidden in PAYMENT_ONLY') : fail('Items table still visible in PAYMENT_ONLY');
const payBack = await ev(page, `document.querySelector('input[placeholder="0.00"]') !== null`);
payBack ? ok('Payment field shown in PAYMENT_ONLY') : fail('Payment field missing in PAYMENT_ONLY');
await ss(page, 'db-04-payment-only-mode');

// [12] Select customer → pending summary appears
console.log('\n[12] Customer selection shows pending summary');
await reactSelect(page, CUST_SELECT_FINDER, 'C001');
await page.waitForTimeout(700);
const bodyAfterSelect = await ev(page, `document.body.innerText`);
bodyAfterSelect?.includes('1,770') ? ok('Pending ₹1,770 shown') : fail('Pending total missing', bodyAfterSelect?.slice(0, 200));
bodyAfterSelect?.includes('100')   ? ok('Advance credit ₹100 shown') : fail('Advance credit missing');
bodyAfterSelect?.includes('2 items') ? ok('Pending item count (2) shown') : fail('Pending item count missing');

// [13] Allocation preview appears with payment amount
console.log('\n[13] Allocation preview');
await reactFill(page, 'input[placeholder="0.00"]', '2000');
await page.waitForTimeout(400);
const previewText = await ev(page, `document.body.innerText`);
previewText?.includes('Allocation Preview') ? ok('Allocation Preview section shown') : fail('Allocation Preview missing');
previewText?.includes('2,100')              ? ok('Allocatable ₹2,100 shown (advance 100 + payment 2000)') : fail('Allocatable amount wrong', previewText?.slice(0, 300));
previewText?.includes('2 of 2')             ? ok('~2 of 2 items will be covered') : fail('Coverage estimate wrong', previewText?.slice(0, 400));
await ss(page, 'db-05-allocation-preview');

// [14] Submit → success toast with receipt ID and invoice seq
console.log('\n[14] Submit PAYMENT_ONLY → success toast');
await page.evaluate(() => {
  [...document.querySelectorAll('button')]
    .find(b => b.textContent.includes('Process Payment') || b.textContent.includes('Save & Invoice') || b.textContent.includes('Save Receipt'))
    ?.click();
});
await page.waitForTimeout(1000);
const toastText = await ev(page, `document.body.innerText`);
(toastText?.includes('135(A)') || toastText?.includes('Receipt')) ? ok('Receipt ID in success toast') : fail('Toast missing receipt ID', toastText?.slice(0, 200));
toastText?.includes('Invoice') ? ok('Invoice seq in success toast') : fail('Invoice seq missing from toast');
await ss(page, 'db-06-receipt-submitted');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — CustomerLedgerTab
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── CustomerLedgerTab ───────────────────────────────────────────────────\n');

// [15] Tab renders
console.log('[15] Customer Ledger tab renders');
await navClick(page, 'Customer Ledger');
const ledgerH1 = await ev(page, `document.querySelector('h1')?.textContent`);
ledgerH1?.includes('Ledger') ? ok(`Tab title: "${ledgerH1}"`) : fail('Ledger tab title wrong', ledgerH1);
await ss(page, 'db-07-ledger-tab');

// [16] Placeholder shown before customer selected
console.log('\n[16] Placeholder with no customer');
const placeholder = await ev(page, `document.body.innerText`);
placeholder?.includes('Select a customer') ? ok('Placeholder text shown') : fail('Placeholder missing');

// [17–21] Select C001 → data loads
console.log('\n[17] Select C001');
await reactSelect(page, CUST_SELECT_FINDER, 'C001');
await page.waitForTimeout(800);

const ledgerBody = await ev(page, `document.body.innerText`);

console.log('\n[18] Summary cards');
ledgerBody?.includes('1,770') ? ok('Outstanding ₹1,770 displayed') : fail('Outstanding ₹1,770 missing', ledgerBody?.slice(0, 300));
ledgerBody?.includes('100')   ? ok('Advance credit ₹100 displayed') : fail('Advance credit missing');
await ss(page, 'db-08-ledger-customer-selected');

console.log('\n[19] Pending items table');
ledgerBody?.includes('Facial')  ? ok('"Facial" in pending items table')  : fail('"Facial" not found');
ledgerBody?.includes('Haircut') ? ok('"Haircut" in pending items table') : fail('"Haircut" not found');
ledgerBody?.includes('1,180')   ? ok('taxed_total ₹1,180 shown')         : fail('₹1,180 missing');
ledgerBody?.includes('590')     ? ok('taxed_total ₹590 shown')           : fail('₹590 missing');
await ss(page, 'db-09-ledger-pending-items');

console.log('\n[20] Ledger entries with type badges');
ledgerBody?.includes('Payment')       ? ok('PAYMENT entry shown')        : fail('PAYMENT entry missing');
ledgerBody?.includes('Invoice')       ? ok('INVOICE entry shown')        : fail('INVOICE entry missing');
ledgerBody?.includes('Advance Credit') ? ok('ADVANCE_CREDIT entry shown') : fail('ADVANCE_CREDIT entry missing');
ledgerBody?.includes('135(A)')        ? ok('ref_id "135(A)" shown')       : fail('ref_id missing');
await ss(page, 'db-10-ledger-entries');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — GstFilingTab
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── GstFilingTab ────────────────────────────────────────────────────────\n');

// [21] Tab renders
console.log('[21] GST Filing tab renders');
await navClick(page, 'GST Filing');
const gstH1 = await ev(page, `document.querySelector('h1')?.textContent`);
gstH1?.includes('GST') ? ok(`Tab title: "${gstH1}"`) : fail('GST tab title wrong', gstH1);
await ss(page, 'db-11-gst-filing-tab');

// [22] Toolbar buttons present
console.log('\n[22] Toolbar buttons');
const toolBtns = await ev(page, `[...document.querySelectorAll('button')].map(b => b.textContent.trim())`);
toolBtns?.some(t => t.includes('Export CSV'))      ? ok('Export CSV button present')       : fail('Export CSV missing');
toolBtns?.some(t => t.includes('Reconciliation'))  ? ok('Reconciliation button present')   : fail('Reconciliation button missing');
toolBtns?.some(t => t.includes('Backup'))          ? ok('Backup DB button present')        : fail('Backup DB missing');

// [23] Invoice register table (2 rows from stub)
console.log('\n[23] Invoice register');
const gstBody = await ev(page, `document.body.innerText`);
gstBody?.includes('135(A)') ? ok('Receipt "135(A)" in register') : fail('"135(A)" missing', gstBody?.slice(0, 300));
gstBody?.includes('135(B)') ? ok('Receipt "135(B)" in register') : fail('"135(B)" missing');

// [24] Summary totals (2 × 472 = 944 total; 2 × 400 = 800 taxable; 2 × 72 = 144 GST)
console.log('\n[24] Summary totals');
gstBody?.includes('944') ? ok('Grand total ₹944 shown')      : fail('₹944 missing');
gstBody?.includes('800') ? ok('Taxable ₹800 shown')          : fail('₹800 missing');
gstBody?.includes('144') ? ok('GST total ₹144 shown')        : fail('₹144 missing');
gstBody?.includes('72')  ? ok('Per-invoice GST ₹72 shown')   : fail('₹72 missing');

// [25] Click row 1 → expands line items
console.log('\n[25] Row expand shows line items');
await page.evaluate(() => {
  // Click the first data row in the invoice register (skip total row)
  const rows = [...document.querySelectorAll('tbody tr')];
  rows[0]?.click();
});
await page.waitForTimeout(700);
const expandedText = await ev(page, `document.body.innerText`);
expandedText?.includes('Facial')  ? ok('"Facial" line visible after row expand')  : fail('"Facial" not visible', expandedText?.slice(0, 300));
expandedText?.includes('Haircut') ? ok('"Haircut" line visible after row expand') : fail('"Haircut" not visible');
await ss(page, 'db-12-gst-invoice-expanded');

// [26] Reconciliation → all checks passed
console.log('\n[26] Reconcile');
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Reconciliation'))?.click();
});
await page.waitForTimeout(600);
const reconcileText = await ev(page, `document.body.innerText`);
reconcileText?.includes('passed') ? ok('Reconciliation: all checks passed') : fail('Reconciliation result missing', reconcileText?.slice(0, 200));
await ss(page, 'db-13-gst-reconcile');

// [27] Export CSV → shows path
console.log('\n[27] Export CSV');
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Export CSV'))?.click();
});
await page.waitForTimeout(500);
const exportText = await ev(page, `document.body.innerText`);
exportText?.includes('bills_export.csv') ? ok('Export path shown') : fail('Export path missing', exportText?.slice(0, 200));
await ss(page, 'db-14-gst-export');

// [28] Backup → shows path
console.log('\n[28] Backup DB');
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => b.textContent.includes('Backup'))?.click();
});
await page.waitForTimeout(500);
const backupText = await ev(page, `document.body.innerText`);
backupText?.includes('billing_backup') ? ok('Backup path shown') : fail('Backup path missing', backupText?.slice(0, 200));
await ss(page, 'db-15-gst-backup');

// ── Results ────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passed} passed  ${failed > 0 ? failed + ' FAILED' : '0 failed'}`);
console.log(`  Screenshots saved to billing-app/test-shots/db-*.png`);
console.log('─'.repeat(50) + '\n');

await browser.close();
vite.kill();
process.exit(failed > 0 ? 1 : 0);
