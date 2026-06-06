const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

const resolveBaseDir = () => {
    if (isDev) {
        return process.cwd();
    }
    try {
        return path.dirname(app.getPath('exe'));
    } catch (error) {
        return process.cwd();
    }
};

const resolveDataDir = () => {
    const dataDir = path.join(resolveBaseDir(), 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    return dataDir;
};

const safeReadJson = (filePath, fallback) => {
    try {
        if (!fs.existsSync(filePath)) {
            return fallback;
        }
        let raw = fs.readFileSync(filePath, 'utf8');
        // Strip UTF-8 BOM if present (added by some editors/tools like PowerShell)
        if (raw.charCodeAt(0) === 0xFEFF) {
            raw = raw.slice(1);
        }
        if (!raw.trim()) {
            return fallback;
        }
        return JSON.parse(raw);
    } catch (error) {
        console.error(`Failed to parse JSON file ${filePath}:`, error);
        return fallback;
    }
};

const toNumber = (value) => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeProductCatalog = (entries) => {
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry, idx) => {
            if (!entry || typeof entry !== 'object') return null;
            const name = normalizeString(entry['Product Name']);
            if (!name) return null;
            const active = entry.Active;
            if (active === false) return null;
            const price = toNumber(entry['Selling Price'] ?? entry['MRP']);
            if (!price) return null;
            const quantity = toNumber(entry['Stock'] ?? entry['Balance'] ?? entry['Sold']);
            return {
                id: normalizeString(entry['Product ID']) || `product-${idx + 1}`,
                type: 'Product',
                category: normalizeString(entry['Category']) || 'Retail',
                description: name,
                price,
                quantity,
                gst: toNumber(entry['GST %']) || 0,
                brand: normalizeString(entry['Brand']) || undefined,
                source: 'catalog-product'
            };
        })
        .filter(Boolean);
};

const normalizeServiceCatalog = (entries) => {
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry, idx) => {
            if (!entry || typeof entry !== 'object') return null;
            const name = normalizeString(entry['Service Name']);
            if (!name) return null;
            const active = entry.Active;
            if (active === false) return null;
            const basePrice = toNumber(entry['Base Price'] ?? entry['Final Price']);
            if (!basePrice) return null;
            const priceType = normalizeString(entry['Price Type']);
            return {
                id: normalizeString(entry.ID) || `service-${idx + 1}`,
                type: 'Service',
                category: normalizeString(entry['Subcategory']) || normalizeString(entry['Category']) || 'General',
                subcategory: normalizeString(entry['Subcategory']) || undefined,
                description: name,
                price: basePrice,
                gst: toNumber(entry['GST %']) || 0,
                totalSittings: toNumber(entry['Sessions']) || 1,
                priceType: priceType || undefined,
                notes: normalizeString(entry['Notes']) || undefined,
                source: 'catalog-service'
            };
        })
        .filter(Boolean);
};

const buildCatalogInventory = (dataDir) => {
    const productsPath = path.join(dataDir, 'products.json');
    const servicesPath = path.join(dataDir, 'services.json');
    const products = normalizeProductCatalog(safeReadJson(productsPath, []));
    const services = normalizeServiceCatalog(safeReadJson(servicesPath, []));
    return [...services, ...products];
};

const normalizeOverrides = (raw = {}) => {
    return Object.entries(raw).reduce((acc, [key, value]) => {
        if (!value || typeof value !== 'object') {
            return acc;
        }
        acc[key] = { ...value };
        return acc;
    }, {});
};

const loadInventoryPersistence = (dataDir) => {
    const filePath = path.join(dataDir, 'inventory.json');
    const legacy = safeReadJson(filePath, null);
    if (!legacy) {
        return { overrides: {}, manualItems: [] };
    }
    if (Array.isArray(legacy)) {
        const overrides = {};
        const manualItems = [];
        legacy.forEach(item => {
            if (!item || typeof item !== 'object') {
                return;
            }
            if (item.source === 'manual') {
                manualItems.push(item);
                return;
            }
            if (item.id) {
                overrides[item.id] = {
                    quantity: typeof item.quantity === 'number' ? item.quantity : undefined,
                    price: typeof item.price === 'number' ? item.price : undefined,
                    gst: typeof item.gst === 'number' ? item.gst : undefined
                };
            }
        });
        return { overrides, manualItems };
    }
    const overrides = normalizeOverrides(legacy.overrides || {});
    const manualItems = Array.isArray(legacy.manualItems) ? legacy.manualItems : [];
    return { overrides, manualItems };
};

const applyOverrides = (catalog, overrides) => {
    return catalog.map(item => {
        const override = overrides[item.id];
        if (!override) {
            return item;
        }
        return {
            ...item,
            price: typeof override.price === 'number' ? override.price : item.price,
            quantity: typeof override.quantity === 'number' ? override.quantity : item.quantity,
            gst: typeof override.gst === 'number' ? override.gst : item.gst
        };
    });
};

const combineInventoryState = (dataDir) => {
    const catalog = buildCatalogInventory(dataDir);
    const persistence = loadInventoryPersistence(dataDir);
    const catalogWithOverrides = applyOverrides(catalog, persistence.overrides || {});
    const manualItems = (persistence.manualItems || []).map(item => ({
        ...item,
        source: 'manual',
        type: item.type || 'Service',
        category: item.category || 'General',
        description: item.description || 'Manual Item',
        price: typeof item.price === 'number' ? item.price : 0
    }));
    return {
        combined: [...catalogWithOverrides, ...manualItems],
        persistence: {
            overrides: persistence.overrides || {},
            manualItems
        }
    };
};

const persistInventoryState = (dataDir, payload) => {
    const inventoryFile = path.join(dataDir, 'inventory.json');
    fs.writeFileSync(inventoryFile, JSON.stringify(payload, null, 2), 'utf8');
};

const derivePersistencePayload = (items = []) => {
    const overrides = {};
    const manualItems = [];
    items.forEach(item => {
        if (!item || typeof item !== 'object') {
            return;
        }
        if (item.source === 'manual') {
            manualItems.push(item);
            return;
        }
        if (item.id) {
            const override = {};
            if (typeof item.quantity === 'number') {
                override.quantity = item.quantity;
            }
            if (typeof item.price === 'number') {
                override.price = item.price;
            }
            if (typeof item.gst === 'number') {
                override.gst = item.gst;
            }
            if (Object.keys(override).length > 0) {
                overrides[item.id] = override;
            }
        }
    });
    return { overrides, manualItems };
};

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (isDev) {
        win.loadURL('http://localhost:5173');
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

function formatCSVDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

ipcMain.handle('save-bill', async (event, billData) => {
    try {
        const dataDir = resolveDataDir();

        const csvFile = path.join(dataDir, 'bills.csv');
        const isNew = !fs.existsSync(csvFile);
        const baseHeader = 'BillId,Date,ClientName,ClientPhone,ClientAddress,SubTotal,Discount,CGST,SGST,Total,ItemDescription,Price,Quantity,Amount';
        const extendedHeader = `${baseHeader},ServiceTotal,ProductTotal,TaxableAmount,GSTTotal,GstRate`;
        const fullHeader = `${extendedHeader},BillingMode,PlaceOfSupply,BuyerGstin,BuyerLegalName,BuyerStateCode,IGST,ReverseCharge,InvoiceType,SacHsnCode,Unit`;

        let existingLines = [];
        if (!isNew) {
            const data = fs.readFileSync(csvFile, 'utf8');
            const lines = data.split('\n');
            let header = lines[0] || fullHeader;
            const reqId = String(billData.id);
            const filteredLines = lines.slice(1).filter(line => {
                if (!line.trim()) return false;
                const firstCol = line.split(',')[0].replace(/"/g, '');
                return firstCol !== reqId; // Exclude if editing the same bill
            });

            const headerHasExtended = /ServiceTotal/i.test(header);
            const headerHasFull = /BillingMode/i.test(header);
            if (!headerHasExtended) {
                // Very old format: add all 15 new columns
                header = fullHeader;
                existingLines = [header, ...filteredLines.map(line => `${line}${','.repeat(15)}`)];
            } else if (!headerHasFull) {
                // Extended but missing new columns: add 10
                header = fullHeader;
                existingLines = [header, ...filteredLines.map(line => `${line}${','.repeat(10)}`)];
            } else {
                existingLines = [header, ...filteredLines];
            }
        } else {
            existingLines = [fullHeader];
        }

        let newRowsStr = '';
        const dateStr = formatCSVDate(billData.date);

        // Sanitize CSV strings
        const sanitize = (val) => {
            const str = String(val || '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const billId = sanitize(billData.id);
        const clientName = sanitize(billData.clientName);
        const clientPhone = sanitize(billData.clientPhone || '');
        const clientAddress = sanitize(billData.clientAddress);
        const subTotal = sanitize(billData.subTotal);
        const discount = sanitize(billData.discount);

        const cgst = sanitize(billData.cgst || 0);
        const sgst = sanitize(billData.sgst || 0);
        const total = sanitize(billData.total);
        const serviceTotal = sanitize(billData.serviceTotal || billData.subTotal || 0);
        const productTotal = sanitize(billData.productTotal || 0);
        const taxableAmount = sanitize(billData.taxableAmount || billData.subTotal || 0);
        const gstTotal = sanitize(billData.gstTotal || (Number(billData.cgst || 0) + Number(billData.sgst || 0)));
        const gstRateRecorded = sanitize(billData.gstRate || 0);
        const billingModeCol = sanitize(billData.billingMode || 'b2c');
        const placeOfSupplyCol = sanitize(billData.placeOfSupply || '');
        const buyerGstinCol = sanitize(billData.buyerGstin || '');
        const buyerLegalNameCol = sanitize(billData.buyerLegalName || '');
        const buyerStateCodeCol = sanitize(billData.buyerStateCode || '');
        const igstCol = sanitize(billData.igst || 0);
        const reverseChargeCol = sanitize(billData.reverseCharge || 'No');
        const invoiceTypeCol = sanitize(billData.invoiceType || 'Regular');

        const sharedColumns = [billId, dateStr, clientName, clientPhone, clientAddress, subTotal, discount, cgst, sgst, total];
        const sharedTailColumns = [serviceTotal, productTotal, taxableAmount, gstTotal, gstRateRecorded, billingModeCol, placeOfSupplyCol, buyerGstinCol, buyerLegalNameCol, buyerStateCodeCol, igstCol, reverseChargeCol, invoiceTypeCol];

        if (billData.items && billData.items.length > 0) {
            billData.items.forEach(item => {
                const itemDesc = sanitize(item.description);
                const itemPrice = sanitize(item.price);
                const itemQty = sanitize(item.quantity);
                const itemAmount = sanitize(item.amount);
                const sacHsnCode = sanitize(item.sacHsnCode || '');
                const unit = sanitize(item.unit || '');

                const row = [
                    ...sharedColumns,
                    itemDesc,
                    itemPrice,
                    itemQty,
                    itemAmount,
                    ...sharedTailColumns,
                    sacHsnCode,
                    unit
                ].join(',');
                newRowsStr += `${row}\n`;
            });
        } else {
            const row = [
                ...sharedColumns,
                '',
                '',
                '',
                '',
                ...sharedTailColumns,
                '',
                ''
            ].join(',');
            newRowsStr += `${row}\n`;
        }

        const finalCsvStr = existingLines.join('\n') + '\n' + newRowsStr;
        fs.writeFileSync(csvFile, finalCsvStr, 'utf8');

        // Update Inventory qty
        const inventoryState = combineInventoryState(dataDir);
        const overridesCopy = normalizeOverrides(inventoryState.persistence.overrides);
        const manualItemsCopy = (inventoryState.persistence.manualItems || []).map(item => ({ ...item }));
        let inventoryChanged = false;

        billData.items.forEach(billItem => {
            const soldQty = toNumber(billItem.quantity);
            if (!soldQty) {
                return;
            }
            const matched = inventoryState.combined.find(item => item.type === 'Product' && item.description === billItem.description);
            if (!matched) {
                return;
            }
            const currentQty = typeof matched.quantity === 'number' ? matched.quantity : 0;
            const nextQty = Math.max(0, currentQty - soldQty);
            if (matched.source === 'manual') {
                const manualIdx = manualItemsCopy.findIndex(entry => entry.id === matched.id);
                if (manualIdx >= 0) {
                    manualItemsCopy[manualIdx] = {
                        ...manualItemsCopy[manualIdx],
                        quantity: nextQty
                    };
                    inventoryChanged = true;
                }
                return;
            }
            if (matched.id) {
                overridesCopy[matched.id] = {
                    ...(overridesCopy[matched.id] || {}),
                    quantity: nextQty
                };
                inventoryChanged = true;
            }
        });

        if (inventoryChanged) {
            persistInventoryState(dataDir, {
                overrides: overridesCopy,
                manualItems: manualItemsCopy
            });
        }

        return { success: true };
    } catch (error) {
        console.error('Failed to save bill:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-sessions', async () => {
    try {
        const dataDir = resolveDataDir();
        const raw = loadSessionsRaw(dataDir);
        // Strip _-prefixed billing metadata — React only needs service session data
        const filtered = {};
        Object.keys(raw).forEach(clientKey => {
            filtered[clientKey] = {};
            Object.keys(raw[clientKey] || {}).forEach(key => {
                if (!key.startsWith('_')) {
                    filtered[clientKey][key] = raw[clientKey][key];
                }
            });
        });
        return { success: true, data: filtered };
    } catch (error) {
        console.error('Failed to get sessions:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-sessions', async (event, data) => {
    try {
        const dataDir = resolveDataDir();
        const existing = loadSessionsRaw(dataDir);
        // Merge: keep incoming service data, preserve all _-prefixed keys from disk
        const merged = JSON.parse(JSON.stringify(data || {}));
        Object.keys(existing).forEach(clientKey => {
            if (!merged[clientKey]) merged[clientKey] = {};
            Object.keys(existing[clientKey] || {}).forEach(key => {
                if (key.startsWith('_')) {
                    merged[clientKey][key] = existing[clientKey][key];
                }
            });
        });
        saveSessionsAtomic(dataDir, merged);
        return { success: true };
    } catch (error) {
        console.error('Failed to save sessions:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-inventory', async () => {
    try {
        const dataDir = resolveDataDir();
        const inventoryState = combineInventoryState(dataDir);
        return { success: true, data: inventoryState.combined };
    } catch (error) {
        console.error('Failed to get inventory:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-bills', async () => {
    try {
        const dataDir = resolveDataDir();
        const billsFile = path.join(dataDir, 'bills.csv');

        if (fs.existsSync(billsFile)) {
            const data = fs.readFileSync(billsFile, 'utf8');
            return { success: true, data: data };
        }
        return { success: true, data: null };
    } catch (error) {
        console.error('Failed to get bills:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-next-bill-id', async () => {
    try {
        const dataDir = resolveDataDir();
        const billsFile = path.join(dataDir, 'bills.csv');

        let maxId = 0;
        if (fs.existsSync(billsFile)) {
            const data = fs.readFileSync(billsFile, 'utf8');
            const lines = data.split('\n');
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const firstCol = lines[i].split(',')[0].replace(/"/g, '');
                const match = firstCol.match(/(\d+)$/);
                const num = match ? parseInt(match[1], 10) : parseInt(firstCol, 10);
                if (!isNaN(num) && num > maxId) {
                    maxId = num;
                }
            }
        }
        const nextId = maxId + 1;
        console.log('NEXT BILL ID:', nextId);
        return { success: true, data: nextId };
    } catch (error) {
        console.error('Failed to get next bill id:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-inventory', async (event, inventoryData) => {
    try {
        const dataDir = resolveDataDir();
        const payload = derivePersistencePayload(Array.isArray(inventoryData) ? inventoryData : []);
        persistInventoryState(dataDir, payload);
        return { success: true };
    } catch (error) {
        console.error('Failed to save inventory:', error);
        return { success: false, error: error.message };
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BILLING SYSTEM — billing.json engine (spec: billing_system_spec_json.md)
// ═══════════════════════════════════════════════════════════════════════════

const BILLING_SEED = {
    receipts: [],
    receipt_items: [],
    tax_invoices: [],
    credit_ledger: [],
    counters: { gst_seq: 1, receipt_base: 1 },
    customer_series: {}
};

const SELLER_STATE = '33';

// Atomic write: temp file → fsync → rename (Section 12)
const writeJsonAtomic = (filePath, data) => {
    const dir = path.dirname(filePath);
    const tmpPath = path.join(dir, `.tmp_${path.basename(filePath)}_${Date.now()}`);
    const jsonStr = JSON.stringify(data, null, 2);
    const fd = fs.openSync(tmpPath, 'w');
    try {
        fs.writeSync(fd, jsonStr, 0, 'utf8');
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, filePath);
};

const loadBilling = (dataDir) => {
    const billingPath = path.join(dataDir, 'billing.json');
    if (!fs.existsSync(billingPath)) {
        writeJsonAtomic(billingPath, BILLING_SEED);
        return JSON.parse(JSON.stringify(BILLING_SEED));
    }
    return safeReadJson(billingPath, JSON.parse(JSON.stringify(BILLING_SEED)));
};

const saveBilling = (dataDir, data) => {
    writeJsonAtomic(path.join(dataDir, 'billing.json'), data);
};

const loadSessionsRaw = (dataDir) => safeReadJson(path.join(dataDir, 'sessions.json'), {});

const saveSessionsAtomic = (dataDir, data) => {
    writeJsonAtomic(path.join(dataDir, 'sessions.json'), data);
};

// Round to 2 decimal places (all money values)
const roundMoney = (val) => Math.round((val + Number.EPSILON) * 100) / 100;

// Section 6 — next receipt_id for a customer
const getNextReceiptId = (billing, customerId) => {
    const base = billing.customer_series[customerId];
    if (base == null) throw new Error(`No active base for customer ${customerId}`);
    const baseStr = String(base);
    const n = billing.receipts.filter(r =>
        r.customer_id === customerId &&
        (r.receipt_id === baseStr || r.receipt_id.startsWith(baseStr + ' '))
    ).length;
    if (n === 0) return baseStr;
    const letter = String.fromCharCode(65 + (n - 1) % 26);
    const num = Math.floor((n - 1) / 26);
    return `${baseStr} ${letter}${num > 0 ? num : ''}`;
};

// Section 5 — derived balances
const getOutstanding = (billing, customerId) =>
    billing.receipt_items
        .filter(i => i.customer_id === customerId && i.status === 'PENDING')
        .reduce((s, i) => s + i.taxed_total, 0);

const getAdvanceCredit = (billing, customerId) => {
    const ledger = billing.credit_ledger.filter(e => e.customer_id === customerId);
    const advances = ledger.filter(e => e.type === 'ADVANCE_CREDIT').reduce((s, e) => s + e.amount, 0);
    const used = ledger.filter(e => e.type === 'CREDIT_USED').reduce((s, e) => s + e.amount, 0);
    const refunded = ledger.filter(e => e.type === 'REFUND').reduce((s, e) => s + e.amount, 0);
    return roundMoney(advances - used - refunded);
};

// Update _billing + _customer cache in sessions.json (Section 4.7)
const updateSessionCache = (dataDir, customerId, billing, customerInfo) => {
    const sessions = loadSessionsRaw(dataDir);
    if (!sessions[customerId]) sessions[customerId] = {};
    sessions[customerId]._billing = {
        outstanding: roundMoney(getOutstanding(billing, customerId)),
        advance_credit: getAdvanceCredit(billing, customerId),
        current_receipt_base: billing.customer_series[customerId] ?? null
    };
    if (customerInfo) {
        sessions[customerId]._customer = {
            address: customerInfo.address || sessions[customerId]._customer?.address || '',
            state_code: customerInfo.stateCode || sessions[customerId]._customer?.state_code || SELLER_STATE
        };
    }
    saveSessionsAtomic(dataDir, sessions);
};

// Write tax invoice rows to bills.csv for history-tab compatibility
const appendInvoiceToCsv = (dataDir, invoiceEntries) => {
    if (!invoiceEntries || invoiceEntries.length === 0) return;
    const csvFile = path.join(dataDir, 'bills.csv');
    const fullHeader = 'BillId,Date,ClientName,ClientPhone,ClientAddress,SubTotal,Discount,CGST,SGST,Total,ItemDescription,Price,Quantity,Amount,ServiceTotal,ProductTotal,TaxableAmount,GSTTotal,GstRate,BillingMode,PlaceOfSupply,BuyerGstin,BuyerLegalName,BuyerStateCode,IGST,ReverseCharge,InvoiceType,SacHsnCode,Unit';
    if (!fs.existsSync(csvFile)) {
        fs.writeFileSync(csvFile, fullHeader + '\n', 'utf8');
    }
    // Deduplication: skip if this receipt_id already exists in the file
    const receiptId = String(invoiceEntries[0].receipt_id);
    const existing = fs.readFileSync(csvFile, 'utf8');
    const alreadyExists = existing.split('\n').slice(1).some(line => {
        if (!line.trim()) return false;
        const firstCol = line.split(',')[0].replace(/"/g, '');
        return firstCol === receiptId;
    });
    if (alreadyExists) return;
    const sanitize = (val) => {
        const str = String(val ?? '');
        return (str.includes(',') || str.includes('"') || str.includes('\n'))
            ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const first = invoiceEntries[0];
    const dateStr = first.date ? formatCSVDate(new Date(first.date)) : formatCSVDate(new Date());
    let rows = '';
    invoiceEntries.forEach(entry => {
        rows += [
            sanitize(first.receipt_id),
            sanitize(dateStr),
            sanitize(first.client_name),
            sanitize(first.client_phone),
            sanitize(first.client_address),
            sanitize(first.sub_total),
            sanitize(first.discount),
            sanitize(first.cgst),
            sanitize(first.sgst),
            sanitize(first.total),
            sanitize(entry.item_description),
            sanitize(entry.price),
            sanitize(entry.quantity),
            sanitize(entry.amount),
            sanitize(first.service_total),
            sanitize(first.product_total),
            sanitize(first.taxable_amount),
            sanitize(first.gst_total),
            sanitize(first.gst_rate ?? ''),
            sanitize('b2c'),
            sanitize(first.place_of_supply),
            '', '', sanitize(SELLER_STATE), sanitize(first.igst), 'N',
            sanitize(first.invoice_type),
            sanitize(entry.sac_hsn_code),
            sanitize(entry.unit)
        ].join(',') + '\n';
    });
    fs.appendFileSync(csvFile, rows, 'utf8');
};

// Section 9A — Process a Payment (one atomic write)
const processPayment = (dataDir, payload) => {
    const billing = loadBilling(dataDir);
    const today = new Date().toISOString().split('T')[0];
    const customerId = payload.customerId;

    const hasItems = Array.isArray(payload.items) && payload.items.length > 0;
    const hasPayment = payload.payment != null && Number(payload.payment) > 0;
    if (!hasItems && !hasPayment) throw new Error('Receipt must have items, payment, or both');

    const mode = hasItems && hasPayment ? 'ITEMS_PAYMENT'
        : hasItems ? 'ITEMS_ONLY'
        : 'PAYMENT_ONLY';

    // Step 1 — assign receipt_id; allocate base for new customer
    if (billing.customer_series[customerId] == null) {
        billing.customer_series[customerId] = billing.counters.receipt_base;
        billing.counters.receipt_base += 1;
    }
    const receiptId = getNextReceiptId(billing, customerId);
    billing.receipts.push({
        receipt_id: receiptId,
        customer_id: customerId,
        receipt_date: today,
        payment: hasPayment ? roundMoney(Number(payload.payment)) : null,
        mode,
        bill_receipt_first: mode === 'ITEMS_PAYMENT' ? (payload.billReceiptFirst || false) : false,
        created_at: new Date().toISOString()
    });

    // Step 2 — expand items to one row per unit
    let lineIdx = 1;
    if (hasItems) {
        for (const item of payload.items) {
            const qty = Math.max(1, Math.floor(Number(item.qty || 1)));
            const price = roundMoney(Number(item.price));
            const discount = roundMoney(Number(item.discount || 0));
            const netTaxable = roundMoney(price - discount);
            const gstRate = Number(item.gstRate || 0);
            const taxedTotal = roundMoney(netTaxable * (1 + gstRate / 100));
            for (let u = 0; u < qty; u++) {
                billing.receipt_items.push({
                    line_id: `${receiptId}#${lineIdx}`,
                    receipt_id: receiptId,
                    customer_id: customerId,
                    product_code: item.catalogId || '',
                    item_description: item.description,
                    type: item.type || 'SERVICE',
                    price,
                    amount: price,
                    discount,
                    gst_rate: gstRate,
                    taxed_total: taxedTotal,
                    sac_hsn_code: item.sacHsnCode || '',
                    unit: item.unit || 'NOS',
                    status: 'PENDING',
                    invoiced_in_seq: null
                });
                lineIdx++;
            }
        }
    }

    let nextTxnId = billing.credit_ledger.length > 0
        ? Math.max(...billing.credit_ledger.map(e => e.txn_id)) + 1 : 1;

    // ITEMS_ONLY: skip allocation unless existing advance credit can cover new items
    if (mode === 'ITEMS_ONLY') {
        const creditAvailable = getAdvanceCredit(billing, customerId);
        if (creditAvailable <= 0) {
            saveBilling(dataDir, billing);
            updateSessionCache(dataDir, customerId, billing, { address: payload.address, stateCode: payload.stateCode });
            return { success: true, receiptId, mode, gstSeq: null };
        }
        // fall through to Steps 4-8 using only the existing credit (no new payment)
    }

    // Step 3 — PAYMENT ledger entry (only when payment is provided)
    if (hasPayment) {
        billing.credit_ledger.push({
            txn_id: nextTxnId++,
            customer_id: customerId,
            type: 'PAYMENT',
            amount: roundMoney(Number(payload.payment)),
            ref_id: receiptId,
            date: today
        });
    }

    // Step 4 — consume existing advance credit
    const existingCredit = getAdvanceCredit(billing, customerId);
    let allocatable = roundMoney(existingCredit + (hasPayment ? Number(payload.payment) : 0));
    if (existingCredit > 0) {
        billing.credit_ledger.push({
            txn_id: nextTxnId++,
            customer_id: customerId,
            type: 'CREDIT_USED',
            amount: roundMoney(existingCredit),
            ref_id: receiptId,
            date: today
        });
    }

    // Step 5 — build allocation queue
    const receiptDateMap = {};
    billing.receipts.forEach(r => { receiptDateMap[r.receipt_id] = r.receipt_date; });
    const pendingItems = billing.receipt_items.filter(
        i => i.customer_id === customerId && i.status === 'PENDING'
    );
    const sortByFifo = (a, b) => {
        const da = receiptDateMap[a.receipt_id] || '';
        const db = receiptDateMap[b.receipt_id] || '';
        return da !== db ? da.localeCompare(db) : a.line_id.localeCompare(b.line_id);
    };
    let queue;
    if (mode === 'ITEMS_PAYMENT' && payload.billReceiptFirst) {
        const thisReceipt = pendingItems.filter(i => i.receipt_id === receiptId)
            .sort((a, b) => a.line_id.localeCompare(b.line_id));
        const others = pendingItems.filter(i => i.receipt_id !== receiptId).sort(sortByFifo);
        queue = [...thisReceipt, ...others];
    } else {
        queue = [...pendingItems].sort(sortByFifo);
    }

    // Step 6 — walk queue
    const covered = [];
    for (const unit of queue) {
        if (roundMoney(allocatable) >= unit.taxed_total) {
            unit.status = 'INVOICED';
            covered.push(unit);
            allocatable = roundMoney(allocatable - unit.taxed_total);
        } else {
            continue; // skip items that can't be fully covered; try smaller ones after
        }
    }

    // Step 7 — create tax invoice if units covered
    let gstSeq = null;
    if (covered.length > 0) {
        gstSeq = billing.counters.gst_seq;
        billing.counters.gst_seq += 1;
        covered.forEach(u => { u.invoiced_in_seq = gstSeq; });

        // Bill-level totals
        const subTotal = roundMoney(covered.reduce((s, u) => s + u.amount, 0));
        const discountTotal = roundMoney(covered.reduce((s, u) => s + u.discount, 0));
        const taxableAmount = roundMoney(subTotal - discountTotal);
        const serviceTotal = roundMoney(covered.filter(u => u.type === 'SERVICE').reduce((s, u) => s + (u.amount - u.discount), 0));
        const productTotal = roundMoney(covered.filter(u => u.type === 'PRODUCT').reduce((s, u) => s + (u.amount - u.discount), 0));
        const gstTotalCalc = roundMoney(covered.reduce((s, u) => s + roundMoney((u.amount - u.discount) * u.gst_rate / 100), 0));

        const buyerState = payload.stateCode || SELLER_STATE;
        let cgst = 0, sgst = 0, igst = 0;
        if (buyerState === SELLER_STATE) {
            cgst = roundMoney(gstTotalCalc / 2);
            sgst = roundMoney(gstTotalCalc - cgst); // avoid floating rounding drift
        } else {
            igst = gstTotalCalc;
        }
        const total = roundMoney(taxableAmount + gstTotalCalc);

        const rates = [...new Set(covered.map(u => u.gst_rate))];
        const billGstRate = rates.length === 1 ? rates[0] : null;

        const [clientPhone, ...nameParts] = customerId.split('::');
        const clientName = nameParts.join('::');

        const billLevelFields = {
            gst_seq: gstSeq,
            receipt_id: receiptId,
            date: today,
            client_name: clientName,
            client_phone: clientPhone,
            client_address: payload.address || '',
            sub_total: subTotal,
            discount: discountTotal,
            cgst, sgst, igst,
            gst_total: gstTotalCalc,
            taxable_amount: taxableAmount,
            service_total: serviceTotal,
            product_total: productTotal,
            total,
            gst_rate: billGstRate,
            billing_mode: 'b2c',
            place_of_supply: buyerState,
            buyer_gstin: '',
            buyer_legal_name: '',
            buyer_state_code: SELLER_STATE,
            reverse_charge: 'N',
            invoice_type: 'Tax Invoice'
        };

        covered.forEach(u => {
            billing.tax_invoices.push({
                ...billLevelFields,
                item_description: u.item_description,
                price: u.price,
                quantity: 1,
                amount: u.amount,
                sac_hsn_code: u.sac_hsn_code,
                unit: u.unit,
                source_receipt_id: u.receipt_id,
                source_line_id: u.line_id
            });
        });

        billing.credit_ledger.push({
            txn_id: nextTxnId++,
            customer_id: customerId,
            type: 'INVOICE',
            amount: total,
            ref_id: String(gstSeq),
            date: today
        });

        // Write to bills.csv for history-tab compatibility
        appendInvoiceToCsv(dataDir, billing.tax_invoices.filter(e => e.gst_seq === gstSeq));
    }

    // Step 8 — remaining becomes advance credit
    if (roundMoney(allocatable) > 0) {
        billing.credit_ledger.push({
            txn_id: nextTxnId++,
            customer_id: customerId,
            type: 'ADVANCE_CREDIT',
            amount: roundMoney(allocatable),
            ref_id: receiptId,
            date: today
        });
    }

    // Commit
    saveBilling(dataDir, billing);
    updateSessionCache(dataDir, customerId, billing, { address: payload.address, stateCode: payload.stateCode });

    return {
        success: true,
        receiptId,
        mode,
        gstSeq,
        outstanding: roundMoney(getOutstanding(billing, customerId)),
        advanceCredit: getAdvanceCredit(billing, customerId)
    };
};

// Section 9B — Start New Series
const startNewSeries = (dataDir, customerId) => {
    const billing = loadBilling(dataDir);
    const newBase = billing.counters.receipt_base;
    billing.counters.receipt_base += 1;
    billing.customer_series[customerId] = newBase;
    saveBilling(dataDir, billing);
    updateSessionCache(dataDir, customerId, billing, null);
    return { success: true, newBase };
};

// Section 12 — Startup rebuild of all _billing caches
const rebuildAllCaches = (dataDir) => {
    const billing = loadBilling(dataDir);
    const sessions = loadSessionsRaw(dataDir);
    const customerIds = [...new Set([
        ...billing.receipts.map(r => r.customer_id),
        ...Object.keys(billing.customer_series)
    ])];
    customerIds.forEach(cid => {
        if (!sessions[cid]) sessions[cid] = {};
        sessions[cid]._billing = {
            outstanding: roundMoney(getOutstanding(billing, cid)),
            advance_credit: getAdvanceCredit(billing, cid),
            current_receipt_base: billing.customer_series[cid] ?? null
        };
    });
    saveSessionsAtomic(dataDir, sessions);
    return { customersRebuilt: customerIds.length };
};

// Section 13 — Reconciliation checks
const runReconciliation = (billing) => {
    const errors = [];
    const customerIds = [...new Set([
        ...billing.receipts.map(r => r.customer_id),
        ...billing.credit_ledger.map(e => e.customer_id)
    ])];
    customerIds.forEach(cid => {
        const ledger = billing.credit_ledger.filter(e => e.customer_id === cid);
        const payments = ledger.filter(e => e.type === 'PAYMENT').reduce((s, e) => s + e.amount, 0);
        const invoices = ledger.filter(e => e.type === 'INVOICE').reduce((s, e) => s + e.amount, 0);
        const advCredit = getAdvanceCredit(billing, cid);
        const diff = roundMoney(Math.abs(payments - (invoices + advCredit)));
        if (diff > 0.01) errors.push({ customerId: cid, payments, invoices, advCredit, diff });
    });
    const seqs = [...new Set(billing.tax_invoices.map(e => e.gst_seq))];
    seqs.forEach(seq => {
        const entries = billing.tax_invoices.filter(e => e.gst_seq === seq);
        const ledgerTotal = billing.credit_ledger
            .filter(e => e.type === 'INVOICE' && e.ref_id === String(seq))
            .reduce((s, e) => s + e.amount, 0);
        const billTotal = entries[0]?.total || 0;
        if (Math.abs(ledgerTotal - billTotal) > 0.01)
            errors.push({ gstSeq: seq, ledgerTotal, billTotal });
    });
    return errors;
};

// ── Billing IPC handlers ────────────────────────────────────────────────────

ipcMain.handle('billing:init', async () => {
    try {
        const dataDir = resolveDataDir();
        const rebuild = rebuildAllCaches(dataDir);
        const billing = loadBilling(dataDir);
        const reconErrors = runReconciliation(billing);
        if (reconErrors.length > 0) {
            console.warn('Reconciliation errors on startup:', JSON.stringify(reconErrors));
        }
        return { success: true, rebuild, reconErrors };
    } catch (error) {
        console.error('billing:init failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('billing:process-payment', async (event, payload) => {
    try {
        const dataDir = resolveDataDir();
        return processPayment(dataDir, payload);
    } catch (error) {
        console.error('billing:process-payment failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('billing:start-new-series', async (event, customerId) => {
    try {
        const dataDir = resolveDataDir();
        return startNewSeries(dataDir, customerId);
    } catch (error) {
        console.error('billing:start-new-series failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('billing:cancel-pending-items', async (event, { customerId, lineIds }) => {
    try {
        const dataDir = resolveDataDir();
        const billing = loadBilling(dataDir);
        if (!Array.isArray(lineIds) || lineIds.length === 0) {
            return { success: false, error: 'No line IDs provided' };
        }
        const idSet = new Set(lineIds.map(String));
        let cancelled = 0;
        for (const item of billing.receipt_items) {
            if (item.customer_id === customerId && idSet.has(String(item.line_id)) && item.status === 'PENDING') {
                item.status = 'CANCELLED';
                cancelled++;
            }
        }
        saveBilling(dataDir, billing);
        updateSessionCache(dataDir, customerId, billing, null);
        return {
            success: true,
            cancelled,
            outstanding: roundMoney(getOutstanding(billing, customerId)),
            advance_credit: getAdvanceCredit(billing, customerId)
        };
    } catch (error) {
        console.error('billing:cancel-pending-items failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('billing:refund-credit', async (event, { customerId, amount, note }) => {
    try {
        const dataDir = resolveDataDir();
        const billing = loadBilling(dataDir);
        const refundAmt = roundMoney(Number(amount));
        if (!refundAmt || refundAmt <= 0) {
            return { success: false, error: 'Refund amount must be greater than zero' };
        }
        const available = getAdvanceCredit(billing, customerId);
        if (refundAmt > available) {
            return { success: false, error: `Cannot refund ₹${refundAmt} — only ₹${available} available` };
        }
        const nextTxnId = billing.credit_ledger.length > 0
            ? Math.max(...billing.credit_ledger.map(e => e.txn_id)) + 1 : 1;
        const today = new Date().toISOString().slice(0, 10);
        billing.credit_ledger.push({
            txn_id: nextTxnId,
            customer_id: customerId,
            type: 'REFUND',
            amount: refundAmt,
            ref_id: note || 'manual-refund',
            date: today
        });
        saveBilling(dataDir, billing);
        updateSessionCache(dataDir, customerId, billing, null);
        return {
            success: true,
            refunded: refundAmt,
            advance_credit: getAdvanceCredit(billing, customerId)
        };
    } catch (error) {
        console.error('billing:refund-credit failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('billing:get-customer-queue', async (event, customerId) => {
    try {
        const dataDir = resolveDataDir();
        const billing = loadBilling(dataDir);
        const items = billing.receipt_items
            .filter(item => item.customer_id === customerId)
            .map(item => ({
                line_id: item.line_id,
                receipt_id: item.receipt_id,
                product_code: item.product_code,
                item_description: item.item_description,
                taxed_total: item.taxed_total,
                status: item.status,
                date: item.date
            }))
            .sort((a, b) => String(a.line_id).localeCompare(String(b.line_id)));
        return {
            success: true,
            items,
            outstanding: roundMoney(getOutstanding(billing, customerId)),
            advance_credit: getAdvanceCredit(billing, customerId)
        };
    } catch (error) {
        console.error('billing:get-customer-queue failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('billing:get-customer-ledger', async (event, customerId) => {
    try {
        const dataDir = resolveDataDir();
        const billing = loadBilling(dataDir);
        const entries = billing.credit_ledger
            .filter(e => e.customer_id === customerId)
            .sort((a, b) => a.txn_id - b.txn_id);
        return { success: true, entries };
    } catch (error) {
        console.error('billing:get-customer-ledger failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('billing:get-customer-info', async (event, customerId) => {
    try {
        const dataDir = resolveDataDir();
        const billing = loadBilling(dataDir);
        const sessions = loadSessionsRaw(dataDir);
        const cust = sessions[customerId] || {};
        const customerReceipts = billing.receipts.filter(r => r.customer_id === customerId);
        const latestReceipt = customerReceipts.length > 0
            ? customerReceipts.reduce((prev, r) => r.created_at > prev.created_at ? r : prev, customerReceipts[0])
            : null;
        const data = {
            outstanding: roundMoney(getOutstanding(billing, customerId)),
            advance_credit: getAdvanceCredit(billing, customerId),
            current_receipt_base: billing.customer_series[customerId] ?? null,
            next_receipt_id: billing.customer_series[customerId] != null
                ? getNextReceiptId(billing, customerId) : null,
            address: cust._customer?.address || '',
            state_code: cust._customer?.state_code || SELLER_STATE,
            last_receipt: latestReceipt ? { id: latestReceipt.receipt_id, date: latestReceipt.receipt_date } : null
        };
        return { success: true, data };
    } catch (error) {
        console.error('billing:get-customer-info failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('billing:get-customer-list', async () => {
    try {
        const dataDir = resolveDataDir();
        const billing = loadBilling(dataDir);
        const customers = Object.keys(billing.customer_series).map(customerId => {
            const sepIdx = customerId.indexOf('::');
            const phone = sepIdx >= 0 ? customerId.slice(0, sepIdx) : customerId;
            const name = sepIdx >= 0 ? customerId.slice(sepIdx + 2) : '';
            const receipts = billing.receipts.filter(r => r.customer_id === customerId);
            const invoicedItems = billing.receipt_items.filter(i => i.customer_id === customerId && i.status === 'INVOICED');
            const lastReceipt = receipts.length > 0
                ? receipts.reduce((latest, r) => r.receipt_date > latest ? r.receipt_date : latest, receipts[0].receipt_date)
                : null;
            return {
                customerId,
                phone,
                name,
                visitCount: receipts.length,
                totalSpent: roundMoney(invoicedItems.reduce((s, i) => s + i.taxed_total, 0)),
                lastReceiptDate: lastReceipt
            };
        });
        return { success: true, customers };
    } catch (error) {
        console.error('billing:get-customer-list failed:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('billing:get-tax-invoices', async () => {
    try {
        const dataDir = resolveDataDir();
        const billing = loadBilling(dataDir);
        return { success: true, data: billing.tax_invoices || [] };
    } catch (error) {
        console.error('billing:get-tax-invoices failed:', error);
        return { success: false, error: error.message };
    }
});

// ── Modify existing sessions handlers to preserve _-prefixed keys ───────────

// Save PDF
ipcMain.handle('save-pdf', async (event, filename) => {
    try {
        const dataDir = resolveDataDir();

        const win = BrowserWindow.fromWebContents(event.sender);

        const pdfData = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            marginsType: 1
        });

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const monthFolder = path.join(dataDir, `${year}-${month}`);
        if (!fs.existsSync(monthFolder)) {
            fs.mkdirSync(monthFolder, { recursive: true });
        }
        const day = now.getDate();
        const weekNumber = Math.ceil(day / 7);
        const weekFolder = path.join(monthFolder, `week${weekNumber}`);
        if (!fs.existsSync(weekFolder)) {
            fs.mkdirSync(weekFolder);
        }

        const pdfPath = path.join(weekFolder, `${filename}.pdf`);
        fs.writeFileSync(pdfPath, pdfData);

        return { success: true, path: pdfPath };
    } catch (error) {
        console.error('Failed to save PDF:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-receipt-pdf', async (event, filename) => {
    try {
        const win = BrowserWindow.fromWebContents(event.sender);
        const { filePath, canceled } = await dialog.showSaveDialog(win, {
            title: 'Save Receipt PDF',
            defaultPath: `${filename}.pdf`,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });
        if (canceled || !filePath) {
            return { success: false, cancelled: true };
        }
        const pdfData = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            marginsType: 0
        });
        fs.writeFileSync(filePath, pdfData);
        return { success: true, path: filePath };
    } catch (error) {
        console.error('Failed to save receipt PDF:', error);
        return { success: false, error: error.message };
    }
});
