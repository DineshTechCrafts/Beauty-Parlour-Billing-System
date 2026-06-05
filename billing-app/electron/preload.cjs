const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveBill: (data) => ipcRenderer.invoke('save-bill', data),
    getInventory: () => ipcRenderer.invoke('get-inventory'),
    saveInventory: (data) => ipcRenderer.invoke('save-inventory', data),
    getBills: () => ipcRenderer.invoke('get-bills'),
    getNextBillId: () => ipcRenderer.invoke('get-next-bill-id'),
    savePdf: (filename) => ipcRenderer.invoke('save-pdf', filename),
    getSessions: () => ipcRenderer.invoke('get-sessions'),
    saveSessions: (data) => ipcRenderer.invoke('save-sessions', data),
    // Billing system (billing.json)
    billingInit: () => ipcRenderer.invoke('billing:init'),
    billingProcessPayment: (payload) => ipcRenderer.invoke('billing:process-payment', payload),
    billingStartNewSeries: (customerId) => ipcRenderer.invoke('billing:start-new-series', customerId),
    billingGetCustomerInfo: (customerId) => ipcRenderer.invoke('billing:get-customer-info', customerId),
});
