const { app, BrowserWindow, ipcMain, shell } = require('electron');
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
        const raw = fs.readFileSync(filePath, 'utf8');
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
        const sessionsFile = path.join(dataDir, 'sessions.json');

        if (fs.existsSync(sessionsFile)) {
            const raw = fs.readFileSync(sessionsFile, 'utf8') || '{}';
            return { success: true, data: JSON.parse(raw) };
        }

        return { success: true, data: {} };
    } catch (error) {
        console.error('Failed to get sessions:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('save-sessions', async (event, data) => {
    try {
        const dataDir = resolveDataDir();
        const sessionsFile = path.join(dataDir, 'sessions.json');
        fs.writeFileSync(sessionsFile, JSON.stringify(data || {}, null, 2), 'utf8');
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
