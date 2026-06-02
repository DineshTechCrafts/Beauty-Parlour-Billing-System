const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Legacy CSV-based handlers (kept for backward compatibility)
    saveBill: (data) => ipcRenderer.invoke('save-bill', data),
    getInventory: () => ipcRenderer.invoke('get-inventory'),
    saveInventory: (data) => ipcRenderer.invoke('save-inventory', data),
    getBills: () => ipcRenderer.invoke('get-bills'),
    getNextBillId: () => ipcRenderer.invoke('get-next-bill-id'),
    savePdf: (filename) => ipcRenderer.invoke('save-pdf', filename),
    getSessions: () => ipcRenderer.invoke('get-sessions'),
    saveSessions: (data) => ipcRenderer.invoke('save-sessions', data),

    // SQLite DB handlers
    db: {
        listCustomers: () => ipcRenderer.invoke('db:list-customers'),
        getCustomer: (id) => ipcRenderer.invoke('db:get-customer', id),
        createCustomer: (data) => ipcRenderer.invoke('db:create-customer', data),
        updateCustomer: (id, data) => ipcRenderer.invoke('db:update-customer', id, data),

        processPayment: (opts) => ipcRenderer.invoke('db:process-payment', opts),
        listReceipts: (customerId) => ipcRenderer.invoke('db:list-receipts', customerId),
        getReceiptItems: (receiptId) => ipcRenderer.invoke('db:get-receipt-items', receiptId),

        getOutstanding: (customerId) => ipcRenderer.invoke('db:get-outstanding', customerId),
        getPendingItems: (customerId) => ipcRenderer.invoke('db:get-pending-items', customerId),
        getAdvanceCredit: (customerId) => ipcRenderer.invoke('db:get-advance-credit', customerId),
        getCustomerLedger: (customerId) => ipcRenderer.invoke('db:get-customer-ledger', customerId),

        getGstFiling: () => ipcRenderer.invoke('db:get-gst-filing'),
        getInvoiceLines: (gstSeq) => ipcRenderer.invoke('db:get-invoice-lines', gstSeq),

        exportCsv: () => ipcRenderer.invoke('db:export-csv'),
        reconcile: () => ipcRenderer.invoke('db:reconcile'),
        backup: () => ipcRenderer.invoke('db:backup'),
    },
});
