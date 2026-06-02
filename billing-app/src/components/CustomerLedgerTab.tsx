import { useState, useEffect } from 'react';
import { DbCustomer, DbReceiptItem, DbLedgerEntry, DbReceipt } from '../types';

export function CustomerLedgerTab() {
  const [customers, setCustomers] = useState<DbCustomer[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [customer, setCustomer] = useState<DbCustomer | null>(null);
  const [outstanding, setOutstanding] = useState(0);
  const [advanceCredit, setAdvanceCredit] = useState(0);
  const [pendingItems, setPendingItems] = useState<DbReceiptItem[]>([]);
  const [ledger, setLedger] = useState<DbLedgerEntry[]>([]);
  const [_receipts, setReceipts] = useState<DbReceipt[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (selectedId) loadCustomerData(selectedId);
  }, [selectedId]);

  async function loadCustomers() {
    const resp = await window.electronAPI.db.listCustomers();
    if (resp.success) setCustomers(resp.data);
  }

  async function loadCustomerData(id: string) {
    setLoading(true);
    try {
      const [custResp, outResp, pendResp, advResp, ledgerResp] = await Promise.all([
        window.electronAPI.db.getCustomer(id),
        window.electronAPI.db.getOutstanding(id),
        window.electronAPI.db.getPendingItems(id),
        window.electronAPI.db.getAdvanceCredit(id),
        window.electronAPI.db.getCustomerLedger(id),
      ]);
      if (custResp.success) setCustomer(custResp.data);
      if (outResp.success) setOutstanding(outResp.data);
      if (pendResp.success) setPendingItems(pendResp.data);
      if (advResp.success) setAdvanceCredit(advResp.data);
      if (ledgerResp.success) { setLedger(ledgerResp.data.ledger); setReceipts(ledgerResp.data.receipts); }
    } finally {
      setLoading(false);
    }
  }

  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const ledgerTypeLabel: Record<string, string> = {
    PAYMENT: 'Payment',
    INVOICE: 'Invoice',
    ADVANCE_CREDIT: 'Advance Credit',
    CREDIT_USED: 'Credit Used',
  };

  return (
    <div className="customer-ledger-tab">
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ flex: 1 }}>
            <option value="">— Select customer —</option>
            {customers.map(c => (
              <option key={c.customer_id} value={c.customer_id}>
                {c.name} {c.phone ? `(${c.phone})` : ''} [{c.customer_id}]
              </option>
            ))}
          </select>
          {selectedId && (
            <button className="btn btn-secondary" onClick={() => loadCustomerData(selectedId)}>
              Refresh
            </button>
          )}
        </div>
      </div>

      {loading && <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading…</p>}

      {!loading && customer && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Outstanding (pending)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#e53e3e' }}>₹{fmt(outstanding)}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Advance Credit</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#38a169' }}>₹{fmt(advanceCredit)}</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Pending Items</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{pendingItems.length}</div>
            </div>
          </div>

          {/* Pending items */}
          {pendingItems.length > 0 && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>Pending (Unbilled) Items</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Item ID</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Receipt</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Taxed Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingItems.map(item => (
                    <tr key={item.item_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem' }}>{item.item_id}</td>
                      <td style={{ padding: '0.5rem' }}>{item.receipt_id}</td>
                      <td style={{ padding: '0.5rem' }}>{item.receipt_date}</td>
                      <td style={{ padding: '0.5rem' }}>{item.item_description}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>₹{fmt(item.taxed_total)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                    <td colSpan={4} style={{ padding: '0.5rem', textAlign: 'right' }}>Total</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(pendingItems.reduce((s, i) => s + i.taxed_total, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Ledger */}
          <div className="card">
            <h3 style={{ marginBottom: '0.75rem' }}>Ledger (tax-inclusive ₹)</h3>
            {ledger.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No transactions yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Type</th>
                    <th style={{ padding: '0.5rem', textAlign: 'left' }}>Ref</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map(entry => (
                    <tr key={entry.txn_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem' }}>{entry.date}</td>
                      <td style={{ padding: '0.5rem' }}>
                        <span style={{
                          display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600,
                          background: entry.type === 'PAYMENT' ? '#e6f7ee' : entry.type === 'INVOICE' ? '#fff3e0' : entry.type === 'ADVANCE_CREDIT' ? '#e3f2fd' : '#fce4ec',
                          color: entry.type === 'PAYMENT' ? '#2e7d32' : entry.type === 'INVOICE' ? '#e65100' : entry.type === 'ADVANCE_CREDIT' ? '#1565c0' : '#880e4f',
                        }}>
                          {ledgerTypeLabel[entry.type] || entry.type}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{entry.ref_id}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>₹{fmt(entry.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!loading && !selectedId && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
          Select a customer to view their ledger and outstanding balance.
        </div>
      )}
    </div>
  );
}
