const fs = require('fs');
const path = require('path');

// --- Mock Electron ---
const mockIpcHandlers = {};
const testDataDir = path.join(__dirname, 'test-data');

// Override process.cwd to point to testDataDir so main.cjs uses it
const originalCwd = process.cwd;
process.cwd = () => testDataDir;

const mockApp = {
    getPath: (name) => name === 'exe' ? path.join(testDataDir, 'mock.exe') : '',
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    on: () => {}
};

require('electron'); // Ensure package is resolved if it exists
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
        app: mockApp,
        ipcMain: { handle: (channel, listener) => { mockIpcHandlers[channel] = listener; } },
        BrowserWindow: class { 
            static fromWebContents() { return { webContents: { printToPDF: async () => Buffer.from('') } }; }
            loadFile() {}
            once() {}
        },
        dialog: { showSaveDialog: async () => ({ canceled: true }) }
    }
};

// Clean start before requiring main.cjs
if (fs.existsSync(testDataDir)) fs.rmSync(testDataDir, { recursive: true, force: true });
fs.mkdirSync(testDataDir, { recursive: true });

// Load main.cjs to register IPC handlers
require('./electron/main.cjs');

// --- Testing Framework ---
let passed = 0, failed = 0;
const assert = (condition, message) => {
    if (condition) { passed++; console.log(`  ✓ ${message}`); }
    else { failed++; console.log(`  ✗ ${message}`); }
};

const invoke = async (channel, payload) => {
    if (!mockIpcHandlers[channel]) throw new Error(`Handler not found for ${channel}`);
    return await mockIpcHandlers[channel]({}, payload);
};

const loadDb = () => JSON.parse(fs.readFileSync(path.join(testDataDir, 'data', 'billing.json'), 'utf8'));

// --- Tests ---
async function runTests() {
    console.log('\n=== Backend Re-edit Tests ===\n');

    // Wait for mockApp.whenReady() handlers to run
    await new Promise(r => setTimeout(r, 100));

    // Initialize DB
    await invoke('billing:init');

    // TC1: Edit ITEMS_PAYMENT receipt with pending items
    const r1 = await invoke('billing:process-payment', {
        customerId: '1111111111::Client A',
        items: [{ qty: 1, price: 1000, description: 'Service A' }], // taxed_total = 1000
        payment: 100, // payment is less than total, so item remains PENDING
        billReceiptFirst: false
    });
    
    assert(r1.success, 'TC1 Setup: Receipt created successfully');
    let db = loadDb();
    let r1Items = db.receipt_items.filter(i => i.receipt_id === r1.receiptId);
    assert(r1Items.length === 1 && r1Items[0].status === 'PENDING', 'TC1 Setup: Item is PENDING because payment (100) < item (1000)');

    const reeditR1 = await invoke('billing:reedit-receipt', {
        customerId: '1111111111::Client A',
        receiptId: r1.receiptId,
        items: [{ qty: 2, price: 500, description: 'Service A Edited' }] // Changing to 2 items of 500
    });
    
    assert(reeditR1.success, 'TC1: Re-edit successful on ITEMS_PAYMENT receipt with pending items');
    db = loadDb();
    r1Items = db.receipt_items.filter(i => i.receipt_id === r1.receiptId);
    assert(r1Items.length === 2 && r1Items[0].status === 'PENDING', 'TC1: Re-edit replaced items correctly');
    assert(r1Items[0].item_description === 'Service A Edited', 'TC1: Re-edit description matches');

    // TC2: Reject edit if items are invoiced
    const r2 = await invoke('billing:process-payment', {
        customerId: '2222222222::Client B',
        items: [{ qty: 1, price: 500, description: 'Service B' }],
        payment: 500, // exact payment covers it, item becomes INVOICED
        billReceiptFirst: true
    });

    const reeditR2 = await invoke('billing:reedit-receipt', {
        customerId: '2222222222::Client B',
        receiptId: r2.receiptId,
        items: [{ qty: 1, price: 600, description: 'Service B Edited' }]
    });

    assert(!reeditR2.success && reeditR2.error.includes('invoiced'), 'TC2: Rejected edit on receipt with INVOICED items');

    // TC3: FIFO Queue Preservation
    const qa = await invoke('billing:process-payment', { customerId: '3333333333::Client C', items: [{ qty: 1, price: 10, description: 'A' }], payment: 0 });
    const qb = await invoke('billing:process-payment', { customerId: '3333333333::Client C', items: [{ qty: 1, price: 20, description: 'B' }], payment: 0 });
    const qc = await invoke('billing:process-payment', { customerId: '3333333333::Client C', items: [{ qty: 1, price: 30, description: 'C' }], payment: 0 });

    await invoke('billing:reedit-receipt', {
        customerId: '3333333333::Client C',
        receiptId: qb.receiptId,
        items: [{ qty: 1, price: 25, description: 'B-New' }, { qty: 1, price: 25, description: 'B-New-2' }]
    });

    db = loadDb();
    const cItems = db.receipt_items.filter(i => i.customer_id === '3333333333::Client C');
    const order = cItems.map(i => i.item_description).join(',');
    assert(order === 'A,B-New,B-New-2,C', 'TC3: FIFO array sequence preserved when splicing');

    // TC4: Reject edit if item is attended
    const r4 = await invoke('billing:process-payment', {
        customerId: '4444444444::Client D',
        items: [{ qty: 1, price: 500, description: 'Service D' }],
        payment: 0
    });
    
    // Mark as attended using IPC
    db = loadDb();
    const itemToAttend = db.receipt_items.find(i => i.receipt_id === r4.receiptId);
    await invoke('billing:toggle-item-attendance', {
        customerId: '4444444444::Client D',
        lineId: itemToAttend.line_id
    });

    const reeditR4 = await invoke('billing:reedit-receipt', {
        customerId: '4444444444::Client D',
        receiptId: r4.receiptId,
        items: [{ qty: 1, price: 600, description: 'Service D Edited' }]
    });
    assert(!reeditR4.success && reeditR4.error.includes('attended'), 'TC4: Rejected edit on receipt with attended items');

    // Print summary
    console.log(`\n${'─'.repeat(44)}`);
    console.log(`  ${passed} passed  ${failed > 0 ? failed + ' FAILED' : '0 failed'}`);
    console.log('─'.repeat(44) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
