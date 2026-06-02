import { useState, useEffect } from 'react';
import {
  DbCustomer, NewReceiptItem, ProcessPaymentOpts, ProcessPaymentResult, DbReceiptItem,
  InventoryItem,
} from '../types';

interface Props {
  inventory: InventoryItem[];
  onSuccess: (result: ProcessPaymentResult, customerId: string) => void;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

const EMPTY_ITEM = (): NewReceiptItem => ({
  description: '',
  type: 'SERVICE',
  price: 0,
  quantity: 1,
  discount: 0,
  gstRate: 18,
  sacHsnCode: '',
  unit: '',
});

const today = () => new Date().toISOString().slice(0, 10);

export function ReceiptTab({ inventory, onSuccess, showToast }: Props) {
  const [customers, setCustomers] = useState<DbCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);

  // New customer form
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newGstin, setNewGstin] = useState('');
  const [newStateCode, setNewStateCode] = useState('33');

  const [receiptDate, setReceiptDate] = useState(today());
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [mode, setMode] = useState<'ITEMS_ONLY' | 'PAYMENT_ONLY' | 'ITEMS_PAYMENT'>('ITEMS_PAYMENT');
  const [billReceiptFirst, setBillReceiptFirst] = useState(false);
  const [payment, setPayment] = useState('');
  const [items, setItems] = useState<NewReceiptItem[]>([EMPTY_ITEM()]);

  // Pending items for selected customer (for payment-only preview)
  const [pendingItems, setPendingItems] = useState<DbReceiptItem[]>([]);
  const [advanceCredit, setAdvanceCredit] = useState(0);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (selectedCustomerId) {
      loadPendingItems(selectedCustomerId);
    } else {
      setPendingItems([]);
      setAdvanceCredit(0);
    }
  }, [selectedCustomerId]);

  async function loadCustomers() {
    const resp = await window.electronAPI.db.listCustomers();
    if (resp.success) setCustomers(resp.data);
  }

  async function loadPendingItems(customerId: string) {
    const [pendResp, advResp] = await Promise.all([
      window.electronAPI.db.getPendingItems(customerId),
      window.electronAPI.db.getAdvanceCredit(customerId),
    ]);
    if (pendResp.success) setPendingItems(pendResp.data);
    if (advResp.success) setAdvanceCredit(advResp.data);
  }

  async function handleCreateCustomer() {
    if (!newName.trim()) { showToast('Name is required', 'error'); return; }
    const resp = await window.electronAPI.db.createCustomer({
      name: newName.trim(),
      phone: newPhone.trim() || undefined,
      address: newAddress.trim() || undefined,
      gstin: newGstin.trim() || undefined,
      state_code: newStateCode || '33',
    } as any);
    if (!resp.success) { showToast('Failed: ' + (resp as any).error, 'error'); return; }
    showToast('Customer created', 'success');
    await loadCustomers();
    setSelectedCustomerId(resp.data);
    setShowNewCustomer(false);
    setNewName(''); setNewPhone(''); setNewAddress(''); setNewGstin(''); setNewStateCode('33');
  }

  function addItem() { setItems(prev => [...prev, EMPTY_ITEM()]); }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  function updateItem(idx: number, field: keyof NewReceiptItem, value: string | number) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function fillFromInventory(idx: number, description: string) {
    const inv = inventory.find(i => i.description === description);
    if (!inv) { updateItem(idx, 'description', description); return; }
    setItems(prev => prev.map((item, i) => i !== idx ? item : {
      ...item,
      description: inv.description,
      type: inv.type === 'Product' ? 'PRODUCT' : 'SERVICE',
      price: inv.price,
      gstRate: inv.gst || 18,
      sacHsnCode: inv.sacHsnCode || '',
      unit: inv.unit || '',
    }));
  }

  const hasItems = mode !== 'PAYMENT_ONLY';
  const hasPayment = mode !== 'ITEMS_ONLY';

  async function handleSubmit() {
    if (!selectedCustomerId) { showToast('Select a customer', 'error'); return; }

    const validItems = items.filter(i => i.description.trim() && i.price > 0);
    if (hasItems && validItems.length === 0) {
      showToast('Add at least one valid item', 'error');
      return;
    }

    const paymentAmount = parseFloat(payment);
    if (hasPayment && (isNaN(paymentAmount) || paymentAmount <= 0)) {
      showToast('Enter a valid payment amount', 'error');
      return;
    }

    const opts: ProcessPaymentOpts = {
      customerId: selectedCustomerId,
      receiptDate,
      invoiceDate: hasPayment ? invoiceDate : undefined,
      payment: hasPayment ? paymentAmount : null,
      items: hasItems ? validItems : [],
      billReceiptFirst,
      sellerStateCode: '33',
    };

    setSubmitting(true);
    try {
      const resp = await window.electronAPI.db.processPayment(opts);
      if (!resp.success) { showToast('Error: ' + (resp as any).error, 'error'); return; }
      showToast(`Receipt ${resp.data.receiptId} saved${resp.data.invoiceSeq ? ` • Invoice #${resp.data.invoiceSeq}` : ''}`, 'success');
      onSuccess(resp.data, selectedCustomerId);
      // Reset form
      setItems([EMPTY_ITEM()]);
      setPayment('');
      await loadPendingItems(selectedCustomerId);
    } finally {
      setSubmitting(false);
    }
  }

  const allocatable = advanceCredit + (parseFloat(payment) || 0);
  const estimatedCovered = hasPayment ? pendingItems.reduce((acc, item) => {
    if (acc.remaining >= item.taxed_total) {
      acc.count++;
      acc.remaining = Math.round((acc.remaining - item.taxed_total) * 100) / 100;
    }
    return acc;
  }, { remaining: allocatable, count: 0 }).count : 0;

  return (
    <div className="receipt-tab">
      {/* Customer selector */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Customer</h3>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedCustomerId}
            onChange={e => setSelectedCustomerId(e.target.value)}
            style={{ flex: 1, minWidth: '200px' }}
          >
            <option value="">— Select customer —</option>
            {customers.map(c => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.name} {c.phone ? `(${c.phone})` : ''} [{c.customer_id}]
              </option>
            ))}
          </select>
          <button className="btn btn-secondary" onClick={() => setShowNewCustomer(v => !v)}>
            + New Customer
          </button>
        </div>

        {showNewCustomer && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
            <h4 style={{ marginBottom: '0.75rem' }}>New Customer</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <input placeholder="Name *" value={newName} onChange={e => setNewName(e.target.value)} />
              <input placeholder="Phone" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
              <input placeholder="Address" value={newAddress} onChange={e => setNewAddress(e.target.value)} />
              <input placeholder="GSTIN (B2B only)" value={newGstin} onChange={e => setNewGstin(e.target.value)} />
              <input placeholder="State code (e.g. 33)" value={newStateCode} onChange={e => setNewStateCode(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button className="btn btn-primary" onClick={handleCreateCustomer}>Create</button>
              <button className="btn btn-secondary" onClick={() => setShowNewCustomer(false)}>Cancel</button>
            </div>
          </div>
        )}

        {selectedCustomerId && (
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '1.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            <span>Pending: <strong>₹{pendingItems.reduce((s, i) => s + i.taxed_total, 0).toLocaleString('en-IN')}</strong> ({pendingItems.length} items)</span>
            <span>Advance credit: <strong>₹{advanceCredit.toLocaleString('en-IN')}</strong></span>
          </div>
        )}
      </div>

      {/* Receipt config */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Receipt Details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
          <label>
            Mode
            <select value={mode} onChange={e => setMode(e.target.value as any)} style={{ marginTop: '0.25rem' }}>
              <option value="ITEMS_PAYMENT">Items + Payment</option>
              <option value="ITEMS_ONLY">Items Only (no payment)</option>
              <option value="PAYMENT_ONLY">Payment Only</option>
            </select>
          </label>
          <label>
            Receipt Date
            <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} style={{ marginTop: '0.25rem' }} />
          </label>
          {hasPayment && (
            <label>
              Invoice Date
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={{ marginTop: '0.25rem' }} />
            </label>
          )}
          {hasPayment && (
            <label>
              Payment (₹)
              <input type="number" min="0" step="0.01" placeholder="0.00" value={payment}
                onChange={e => setPayment(e.target.value)} style={{ marginTop: '0.25rem' }} />
            </label>
          )}
        </div>
        {mode === 'ITEMS_PAYMENT' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', fontSize: '0.875rem' }}>
            <input type="checkbox" checked={billReceiptFirst} onChange={e => setBillReceiptFirst(e.target.checked)} />
            Bill this receipt's items first (before older pending items)
          </label>
        )}
      </div>

      {/* Items */}
      {hasItems && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Items</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', fontSize: '0.8rem' }}>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Description</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Type</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Price</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Qty</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Discount</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>GST%</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Taxed Total</th>
                  <th style={{ padding: '0.5rem' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const amount = item.price * item.quantity;
                  const net = amount - (item.discount || 0);
                  const taxedTotal = Math.round(net * (1 + item.gstRate / 100));
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.4rem' }}>
                        <input
                          list="inventory-list"
                          value={item.description}
                          onChange={e => fillFromInventory(idx, e.target.value)}
                          placeholder="Description"
                          style={{ width: '100%', minWidth: '160px' }}
                        />
                        <datalist id="inventory-list">
                          {inventory.map(i => <option key={i.id} value={i.description} />)}
                        </datalist>
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <select value={item.type} onChange={e => updateItem(idx, 'type', e.target.value)}>
                          <option value="SERVICE">Service</option>
                          <option value="PRODUCT">Product</option>
                        </select>
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <input type="number" min="0" step="0.01" value={item.price || ''}
                          onChange={e => updateItem(idx, 'price', parseFloat(e.target.value) || 0)}
                          style={{ width: '80px', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <input type="number" min="0.01" step="0.01" value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 1)}
                          style={{ width: '60px', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <input type="number" min="0" step="0.01" value={item.discount || ''}
                          onChange={e => updateItem(idx, 'discount', parseFloat(e.target.value) || 0)}
                          style={{ width: '70px', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <input type="number" min="0" step="1" value={item.gstRate}
                          onChange={e => updateItem(idx, 'gstRate', parseFloat(e.target.value) || 0)}
                          style={{ width: '50px', textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        ₹{taxedTotal.toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        <button onClick={() => removeItem(idx)} title="Remove"
                          style={{ background: 'none', border: 'none', color: '#e53e3e', cursor: 'pointer', fontSize: '1.1rem' }}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button className="btn btn-secondary" onClick={addItem} style={{ marginTop: '0.75rem' }}>
            + Add Item
          </button>
        </div>
      )}

      {/* Payment preview */}
      {hasPayment && selectedCustomerId && pendingItems.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
          <h3 style={{ marginBottom: '0.75rem' }}>Allocation Preview</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Allocatable: ₹{allocatable.toLocaleString('en-IN')} (advance ₹{advanceCredit.toLocaleString('en-IN')} + payment ₹{(parseFloat(payment) || 0).toLocaleString('en-IN')})
          </p>
          <p>~{estimatedCovered} of {pendingItems.length} pending items will be invoiced.</p>
        </div>
      )}

      {/* Submit */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Processing…' : mode === 'ITEMS_ONLY' ? 'Save Receipt' : mode === 'PAYMENT_ONLY' ? 'Process Payment' : 'Save & Invoice'}
        </button>
      </div>
    </div>
  );
}
