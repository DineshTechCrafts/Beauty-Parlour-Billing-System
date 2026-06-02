/**
 * Billing App UI Test Suite
 * Drives the React app via Vite dev server in Chromium.
 * Tests: B2B removed, CGST/SGST display, tab navigation, form flow.
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

// ── Start Vite ─────────────────────────────────────────────────────────────
console.log('\n=== Billing App UI Test Suite ===\n');
log('Starting Vite dev server on :5173...');

const vite = spawn('npx', ['vite', '--port', '5173'], {
  cwd: __dirname, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
});

let vitePort = null;
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('Vite did not start within 25s')), 25000);
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

// ── Launch browser ─────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// The React app uses window.electronAPI which won't exist in browser —
// stub it so the app renders without crashing on IPC calls.
await page.addInitScript(() => {
  window.electronAPI = {
    getInventory:   () => Promise.resolve({ success: true, data: [] }),
    saveInventory:  () => Promise.resolve({ success: true }),
    getBills:       () => Promise.resolve({ success: true, data: 'BillId,Date,ClientName,ClientPhone,ClientAddress,SubTotal,Discount,CGST,SGST,Total,ItemDescription,Price,Quantity,Amount\n' }),
    saveBill:       () => Promise.resolve({ success: true }),
    getNextBillId:  () => Promise.resolve({ success: true, data: 1 }),
    savePdf:        () => Promise.resolve({ success: true }),
    getSessions:    () => Promise.resolve({ success: true, data: {} }),
    saveSessions:   () => Promise.resolve({ success: true }),
  };
});

await page.goto(`http://localhost:${vitePort}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await ss(page, '01-launch');

// ── TEST 1: Billing tab default ────────────────────────────────────────────
console.log('\n[1] Default tab is Billing');
const h1 = await ev(page, `document.querySelector('h1')?.textContent`);
h1?.includes('Billing') ? ok(`Active tab: "${h1}"`) : fail('Billing tab not default', h1);

// ── TEST 2: No B2B / B2C toggle ───────────────────────────────────────────
console.log('\n[2] B2B/B2C toggle removed');
const btns = await ev(page, `[...document.querySelectorAll('button')].map(b => b.textContent.trim())`);
!btns?.includes('B2B') ? ok('B2B button absent') : fail('B2B button still present');
!btns?.includes('B2C') ? ok('B2C button absent') : fail('B2C button still present');

// ── TEST 3: Place of Supply always visible ────────────────────────────────
console.log('\n[3] Place of Supply always shown (B2C-only field)');
const allLabels = await ev(page, `[...document.querySelectorAll('label')].map(l => l.textContent.trim())`);
allLabels?.some(l => l.includes('Place of Supply'))
  ? ok('Place of Supply field visible')
  : fail('Place of Supply missing');

// No B2B-only fields visible
const hasGstin = await ev(page, `[...document.querySelectorAll('label')].some(l => l.textContent.includes('GSTIN'))`);
!hasGstin ? ok('GSTIN field absent (B2B removed)') : fail('GSTIN field still visible');
const hasLegalName = await ev(page, `[...document.querySelectorAll('label')].some(l => l.textContent.includes('Buyer Legal Name'))`);
!hasLegalName ? ok('Buyer Legal Name absent') : fail('Buyer Legal Name still visible');

// ── TEST 4: Phone entry unlocks form ──────────────────────────────────────
console.log('\n[4] Phone entry unlocks form');
const phoneInput = await page.locator('input[placeholder="Enter 10-digit number"]');
await reactFill(page, 'input[placeholder="Enter 10-digit number"]', '9876543210');
await page.waitForTimeout(500);

const nameDisabled = await ev(page, `document.querySelector('input[placeholder="Full Name"]')?.disabled`);
nameDisabled === false ? ok('Name field unlocked') : fail('Name field still disabled');

await reactFill(page, 'input[placeholder="Full Name"]', 'Priya Sharma');
await page.waitForTimeout(300);
const nameVal = await ev(page, `document.querySelector('input[placeholder="Full Name"]')?.value`);
nameVal === 'Priya Sharma' ? ok(`Name set: "${nameVal}"`) : fail('Name not set', nameVal);

// ── TEST 5: Service section with empty row ────────────────────────────────
console.log('\n[5] Service section');
const svcCard = await ev(page, `document.querySelector('.service-section-card') !== null`);
svcCard ? ok('Service section present') : fail('Service section missing');
const svcRows = await ev(page, `document.querySelectorAll('.service-section-card tbody tr').length`);
svcRows >= 1 ? ok(`${svcRows} service row(s) ready`) : fail('No service rows');

// ── TEST 6: Product section ───────────────────────────────────────────────
console.log('\n[6] Product section');
const prodCard = await ev(page, `document.querySelector('.product-section-card') !== null`);
prodCard ? ok('Product section present') : fail('Product section missing');

// ── TEST 7: Summary — CGST + SGST, no IGST ───────────────────────────────
console.log('\n[7] Tax summary — CGST + SGST, no IGST');
const summary = await ev(page, `document.querySelector('.summary-card')?.innerText`);
summary?.includes('CGST') ? ok('CGST in summary') : fail('CGST missing from summary');
summary?.includes('SGST') ? ok('SGST in summary') : fail('SGST missing from summary');
!summary?.includes('IGST') ? ok('No IGST in summary') : fail('IGST unexpectedly present');

// ── TEST 8: Tax controls — CGST + SGST inputs only ───────────────────────
console.log('\n[8] Tax control inputs — CGST + SGST only');
const taxLabels = await ev(page, `[...document.querySelectorAll('.tax-field span:first-child')].map(s => s.textContent)`);
taxLabels?.includes('CGST') ? ok('CGST input present') : fail('CGST input missing');
taxLabels?.includes('SGST') ? ok('SGST input present') : fail('SGST input missing');
!taxLabels?.includes('IGST') ? ok('No IGST input') : fail('IGST input found');

// ── TEST 9: Generate Invoice button ──────────────────────────────────────
console.log('\n[9] Generate Invoice button');
const genBtn = await ev(page, `document.querySelector('.btn-checkout')?.textContent?.trim()`);
genBtn?.includes('Generate') ? ok(`Button: "${genBtn}"`) : fail('Generate Invoice button missing', genBtn);

await ss(page, '02-billing-filled');

// ── TEST 10: Session tracking — add service, check sitting controls ────────
console.log('\n[10] Session / sitting controls in service row');
const sittingInputs = await ev(page, `document.querySelectorAll('.session-mini-input').length`);
sittingInputs >= 2 ? ok(`Sitting inputs present (${sittingInputs} found)`) : fail('Sitting inputs missing');
const paymentToggle = await ev(page, `document.querySelector('.payment-toggle') !== null`);
paymentToggle ? ok('Payment mode toggle (Sitting/Full) present') : fail('Payment toggle missing');

// ── TEST 11: Simulate Generate Invoice (stubbed IPC) ─────────────────────
console.log('\n[11] Generate Invoice flow (IPC stubbed)');
// Click generate — should call the stubbed saveBill and show success
await page.evaluate(() => document.querySelector('.btn-checkout')?.click());
await page.waitForTimeout(1500);
const producedPane = await ev(page, `document.querySelector('.produced-bill-pane') !== null`);
const successText = await ev(page, `document.querySelector('.produced-bill-pane')?.innerText`);
producedPane ? ok('Produced bill pane shown after generate') : fail('No produced bill pane');
successText?.includes('Bill Produced') ? ok('Success message shown') : fail('Success message missing', successText?.slice(0, 80));

await ss(page, '03-invoice-generated');

// ── TEST 12: "Create Another Bill" starts fresh (no B2B state) ────────────
console.log('\n[12] New bill starts clean');
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Create Another'));
  btn?.click();
});
await page.waitForTimeout(800);
const phoneAfterReset = await ev(page, `document.querySelector('input[placeholder="Enter 10-digit number"]')?.value`);
phoneAfterReset === '' ? ok('Phone cleared for new bill') : fail('Phone not cleared', phoneAfterReset);
const billingH1Again = await ev(page, `document.querySelector('h1')?.textContent`);
billingH1Again?.includes('Billing') ? ok('Back on Billing tab') : fail('Wrong tab after reset', billingH1Again);

// Nav helper — clicks a .nav-item by its label text
async function navClick(labelText) {
  await page.evaluate(t => {
    [...document.querySelectorAll('.nav-item')].find(el => el.textContent?.includes(t))?.click();
  }, labelText);
  await page.waitForTimeout(900);
}

// ── TEST 13: History tab (label: "Invoice Archive") ───────────────────────
console.log('\n[13] History tab');
await navClick('Invoice Archive');
const histH1 = await ev(page, `document.querySelector('h1')?.textContent`);
histH1?.includes('Invoice') ? ok(`History tab: "${histH1}"`) : fail('History tab heading wrong', histH1);
await ss(page, '04-history');

// ── TEST 14: Customers tab ────────────────────────────────────────────────
console.log('\n[14] Customers tab');
await navClick('Customers');
const custH1 = await ev(page, `document.querySelector('h1')?.textContent`);
custH1?.includes('Customer') ? ok(`Customers tab: "${custH1}"`) : fail('Customers tab', custH1);
await ss(page, '05-customers');

// ── TEST 15: Inventory tab (label: "Catalog Records") ────────────────────
console.log('\n[15] Inventory tab');
await navClick('Catalog Records');
const invH1 = await ev(page, `document.querySelector('h1')?.textContent`);
invH1?.includes('Inventory') ? ok(`Inventory tab: "${invH1}"`) : fail('Inventory tab', invH1);
await ss(page, '06-inventory');

// ── TEST 16: Catalog tab (label: "Services Menu") ─────────────────────────
console.log('\n[16] Catalog tab');
await navClick('Services Menu');
const catH1 = await ev(page, `document.querySelector('h1')?.textContent`);
catH1?.includes('Catalog') ? ok(`Catalog tab: "${catH1}"`) : fail('Catalog tab', catH1);
await ss(page, '07-catalog');

// ── RESULTS ───────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(44)}`);
console.log(`  ${passed} passed  ${failed > 0 ? failed + ' FAILED' : '0 failed'}`);
console.log(`  Screenshots saved to billing-app/test-shots/`);
console.log('─'.repeat(44) + '\n');

await browser.close();
vite.kill();
process.exit(failed > 0 ? 1 : 0);
