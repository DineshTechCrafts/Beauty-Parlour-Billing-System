import { useState, useEffect } from 'react';
import { GstFilingRow, DbTaxInvoice } from '../types';

export function GstFilingTab() {
  const [rows, setRows] = useState<GstFilingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<DbTaxInvoice[]>([]);
  const [exportMsg, setExportMsg] = useState('');
  const [reconcileErrors, setReconcileErrors] = useState<any[] | null>(null);
  const [backupMsg, setBackupMsg] = useState('');

  useEffect(() => {
    loadFiling();
  }, []);

  async function loadFiling() {
    setLoading(true);
    try {
      const resp = await window.electronAPI.db.getGstFiling();
      if (resp.success) setRows(resp.data);
    } finally {
      setLoading(false);
    }
  }

  async function loadLines(seq: number) {
    if (selectedSeq === seq) { setSelectedSeq(null); setInvoiceLines([]); return; }
    const resp = await window.electronAPI.db.getInvoiceLines(seq);
    if (resp.success) { setInvoiceLines(resp.data); setSelectedSeq(seq); }
  }

  async function handleExport() {
    setExportMsg('');
    const resp = await window.electronAPI.db.exportCsv();
    if (resp.success) setExportMsg(`Exported to: ${resp.data}`);
    else setExportMsg('Export failed: ' + (resp as any).error);
  }

  async function handleReconcile() {
    setReconcileErrors(null);
    const resp = await window.electronAPI.db.reconcile();
    if (resp.success) setReconcileErrors(resp.data);
    else setReconcileErrors([{ error: (resp as any).error }]);
  }

  async function handleBackup() {
    setBackupMsg('');
    const resp = await window.electronAPI.db.backup();
    if (resp.success) setBackupMsg(`Backup saved to: ${resp.data}`);
    else setBackupMsg('Backup failed: ' + (resp as any).error);
  }

  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalTaxable = rows.reduce((s, r) => s + r.taxable_amount, 0);
  const totalGst = rows.reduce((s, r) => s + r.gst_total, 0);
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="gst-filing-tab">
      {/* Toolbar */}
      <div className="card" style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-secondary" onClick={loadFiling}>Refresh</button>
        <button className="btn btn-secondary" onClick={handleExport}>Export CSV (Legacy)</button>
        <button className="btn btn-secondary" onClick={handleReconcile}>Run Reconciliation</button>
        <button className="btn btn-secondary" onClick={handleBackup}>Backup DB</button>
      </div>

      {exportMsg && <div className="card" style={{ marginBottom: '0.75rem', color: '#2e7d32', fontSize: '0.875rem' }}>{exportMsg}</div>}
      {backupMsg && <div className="card" style={{ marginBottom: '0.75rem', color: '#1565c0', fontSize: '0.875rem' }}>{backupMsg}</div>}

      {reconcileErrors !== null && (
        <div className="card" style={{ marginBottom: '1rem', borderLeft: `3px solid ${reconcileErrors.length === 0 ? '#38a169' : '#e53e3e'}` }}>
          {reconcileErrors.length === 0 ? (
            <p style={{ color: '#2e7d32', fontWeight: 600 }}>All reconciliation checks passed.</p>
          ) : (
            <>
              <p style={{ color: '#e53e3e', fontWeight: 600, marginBottom: '0.5rem' }}>{reconcileErrors.length} error(s) found:</p>
              {reconcileErrors.map((e, i) => (
                <p key={i} style={{ fontSize: '0.875rem', color: '#e53e3e' }}>
                  {e.customer_id && <strong>[{e.customer_id}]</strong>}
                  {e.gst_seq && <strong>[Seq {e.gst_seq}]</strong>}
                  {' '}{e.error}
                </p>
              ))}
            </>
          )}
        </div>
      )}

      {/* Summary */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Taxable</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>₹{fmt(totalTaxable)}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total GST</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>₹{fmt(totalGst)}</div>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Grand Total</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>₹{fmt(grandTotal)}</div>
          </div>
        </div>
      )}

      {/* Filing table */}
      <div className="card">
        <h3 style={{ marginBottom: '0.75rem' }}>GST Invoice Register ({rows.length} invoices)</h3>
        {loading && <p style={{ color: 'var(--text-secondary)' }}>Loading…</p>}
        {!loading && rows.length === 0 && <p style={{ color: 'var(--text-secondary)' }}>No invoices yet.</p>}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Seq#</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Date</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Receipt</th>
                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Customer</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Taxable</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>CGST</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>SGST</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>IGST</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Total</th>
                  <th style={{ padding: '0.5rem' }}>Mode</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <>
                    <tr
                      key={row.gst_seq}
                      onClick={() => loadLines(row.gst_seq)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedSeq === row.gst_seq ? 'var(--bg-secondary)' : undefined }}
                    >
                      <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--accent)' }}>{row.gst_seq}</td>
                      <td style={{ padding: '0.5rem' }}>{row.date}</td>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{row.receipt_id}</td>
                      <td style={{ padding: '0.5rem' }}>{row.client_name}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(row.taxable_amount)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(row.cgst)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(row.sgst)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(row.igst)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>₹{fmt(row.total)}</td>
                      <td style={{ padding: '0.5rem', fontSize: '0.75rem' }}>{row.billing_mode}</td>
                    </tr>
                    {selectedSeq === row.gst_seq && invoiceLines.length > 0 && (
                      <tr key={`lines-${row.gst_seq}`}>
                        <td colSpan={10} style={{ padding: 0, background: '#f9fafb' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                              <tr style={{ background: '#e8eaf6' }}>
                                <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left' }}>Item</th>
                                <th style={{ padding: '0.4rem', textAlign: 'left' }}>Type</th>
                                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Price</th>
                                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Qty</th>
                                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Amount</th>
                                <th style={{ padding: '0.4rem', textAlign: 'left' }}>Source Receipt</th>
                              </tr>
                            </thead>
                            <tbody>
                              {invoiceLines.map(line => (
                                <tr key={line.row_id} style={{ borderBottom: '1px solid #e8eaf6' }}>
                                  <td style={{ padding: '0.4rem 0.75rem' }}>{line.item_description}</td>
                                  <td style={{ padding: '0.4rem' }}>{line.billing_mode}</td>
                                  <td style={{ padding: '0.4rem', textAlign: 'right' }}>₹{fmt(line.price)}</td>
                                  <td style={{ padding: '0.4rem', textAlign: 'right' }}>{line.quantity}</td>
                                  <td style={{ padding: '0.4rem', textAlign: 'right' }}>₹{fmt(line.amount)}</td>
                                  <td style={{ padding: '0.4rem', fontFamily: 'monospace' }}>{line.source_receipt_id}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                <tr style={{ fontWeight: 700, background: 'var(--bg-secondary)' }}>
                  <td colSpan={4} style={{ padding: '0.5rem', textAlign: 'right' }}>Totals</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(totalTaxable)}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(rows.reduce((s, r) => s + r.cgst, 0))}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(rows.reduce((s, r) => s + r.sgst, 0))}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(rows.reduce((s, r) => s + r.igst, 0))}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{fmt(grandTotal)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
