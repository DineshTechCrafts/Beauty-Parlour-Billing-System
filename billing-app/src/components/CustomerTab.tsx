import { useCallback, useEffect, useMemo, useState } from 'react';
import { Customer, ReceiptQueueItem } from '../types';
import { Icons } from './Icons';

interface CustomerTabProps {
  customers: Customer[];
  sessions: Record<string, Record<string, { total: number; completed: number }>>;
  isActive: boolean;
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return currencyFormatter.format(0);
  return currencyFormatter.format(Math.max(0, Math.round(value)));
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Unknown date';
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

type QueueFilter = 'ALL' | 'PENDING' | 'INVOICED' | 'CANCELLED';

const statusBadge = (status: string): React.CSSProperties => {
  if (status === 'INVOICED') return { background: '#dcfce7', color: '#16a34a' };
  if (status === 'CANCELLED') return { background: '#fee2e2', color: '#dc2626' };
  return { background: '#fef9c3', color: '#a16207' };
};

export const CustomerTab = ({ customers, sessions: _sessions, isActive }: CustomerTabProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Queue state
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('ALL');
  const [queueItems, setQueueItems] = useState<ReceiptQueueItem[]>([]);
  const [queueOutstanding, setQueueOutstanding] = useState(0);
  const [queueCredit, setQueueCredit] = useState(0);
  const [queueLoading, setQueueLoading] = useState(false);

  // Cancel state
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // Refund state
  const [refundAmount, setRefundAmount] = useState('');
  const [refundNote, setRefundNote] = useState('');
  const [refundBusy, setRefundBusy] = useState(false);
  const [refundError, setRefundError] = useState('');

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return customers.filter((customer) => {
      const nameMatch = customer.name.toLowerCase().includes(q);
      const phoneMatch = qDigits.length > 0 && customer.phone === qDigits;
      return nameMatch || phoneMatch;
    });
  }, [customers, searchQuery]);

  useEffect(() => {
    if (filteredCustomers.length === 0) {
      setSelectedCustomer(null);
      return;
    }
    if (!selectedCustomer || !filteredCustomers.some((c) => c.key === selectedCustomer.key)) {
      setSelectedCustomer(filteredCustomers[0]);
    }
  }, [filteredCustomers, selectedCustomer]);

  const loadQueue = useCallback(async (customerId: string) => {
    setQueueLoading(true);
    try {
      const result = await window.electronAPI.billingGetCustomerQueue(customerId);
      if (result.success) {
        setQueueItems(result.items ?? []);
        setQueueOutstanding(result.outstanding ?? 0);
        setQueueCredit(result.advance_credit ?? 0);
      } else {
        setQueueItems([]);
        setQueueOutstanding(0);
        setQueueCredit(0);
      }
    } catch {
      setQueueItems([]);
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomer?.key) {
      setQueueFilter('ALL');
      setSelectedLineIds(new Set());
      setCancelError('');
      setRefundAmount('');
      setRefundNote('');
      setRefundError('');
      loadQueue(selectedCustomer.key);
    } else {
      setQueueItems([]);
      setQueueOutstanding(0);
      setQueueCredit(0);
    }
  }, [selectedCustomer, loadQueue]);

  // Reload queue whenever the tab becomes active so outstanding stays fresh
  useEffect(() => {
    if (isActive && selectedCustomer?.key) {
      loadQueue(selectedCustomer.key);
    }
  }, [isActive, selectedCustomer?.key, loadQueue]);

  const orderedBills = useMemo(() => {
    if (!selectedCustomer) return [];
    return [...selectedCustomer.bills].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [selectedCustomer]);

  const sessionProgress = useMemo(() => {
    if (queueItems.length === 0) return [];
    const groups = new Map<string, ReceiptQueueItem[]>();
    for (const item of queueItems) {
      const key = `${item.receipt_id}||${item.item_description}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries())
      .filter(([, items]) => items.length > 1)
      .map(([groupKey, items]) => {
        const [receiptId, description] = groupKey.split('||');
        return {
          key: groupKey,
          receiptId,
          description,
          total: items.length,
          completed: items.filter(i => i.status === 'INVOICED').length,
          cancelled: items.filter(i => i.status === 'CANCELLED').length,
          pending: items.filter(i => i.status === 'PENDING').length,
        };
      })
      .sort((a, b) => a.receiptId.localeCompare(b.receiptId));
  }, [queueItems]);

  const visibleQueue = useMemo(() => {
    if (queueFilter === 'ALL') return queueItems;
    return queueItems.filter(item => item.status === queueFilter);
  }, [queueItems, queueFilter]);

  const pendingCount = useMemo(() => queueItems.filter(i => i.status === 'PENDING').length, [queueItems]);
  const invoicedCount = useMemo(() => queueItems.filter(i => i.status === 'INVOICED').length, [queueItems]);
  const cancelledCount = useMemo(() => queueItems.filter(i => i.status === 'CANCELLED').length, [queueItems]);

  const toggleLineId = (lineId: string) => {
    setSelectedLineIds(prev => {
      const next = new Set<string>(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
    setCancelError('');
  };

  const handleCancelSelected = async () => {
    if (!selectedCustomer?.key || selectedLineIds.size === 0) return;
    setCancelBusy(true);
    setCancelError('');
    try {
      const result = await window.electronAPI.billingCancelPendingItems({
        customerId: selectedCustomer.key,
        lineIds: Array.from(selectedLineIds)
      });
      if (result.success) {
        setSelectedLineIds(new Set());
        setQueueOutstanding(result.outstanding ?? 0);
        setQueueCredit(result.advance_credit ?? 0);
        await loadQueue(selectedCustomer.key);
      } else {
        setCancelError(result.error ?? 'Cancel failed');
      }
    } catch (e: any) {
      setCancelError(e.message ?? 'Cancel failed');
    } finally {
      setCancelBusy(false);
    }
  };

  const handleRefund = async () => {
    if (!selectedCustomer?.key) return;
    const amt = parseFloat(refundAmount);
    if (!amt || amt <= 0) {
      setRefundError('Enter a valid amount');
      return;
    }
    setRefundBusy(true);
    setRefundError('');
    try {
      const result = await window.electronAPI.billingRefundCredit({
        customerId: selectedCustomer.key,
        amount: amt,
        note: refundNote.trim() || undefined
      });
      if (result.success) {
        setRefundAmount('');
        setRefundNote('');
        setQueueCredit(result.advance_credit ?? 0);
        await loadQueue(selectedCustomer.key);
      } else {
        setRefundError(result.error ?? 'Refund failed');
      }
    } catch (e: any) {
      setRefundError(e.message ?? 'Refund failed');
    } finally {
      setRefundBusy(false);
    }
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.35rem 0.85rem',
    fontSize: '0.8rem',
    fontWeight: active ? 600 : 400,
    border: '1px solid',
    borderColor: active ? 'var(--primary)' : 'var(--border)',
    borderRadius: 'var(--radius-sm)',
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
    cursor: 'pointer'
  });

  return (
    <div className="no-print" style={{ display: 'flex', gap: '1.5rem', flex: 1 }}>
      <section className="card" style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column', maxHeight: '80vh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
              <Icons.Search />
            </span>
            <input
              type="text"
              placeholder="Search by name or phone"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="form-control"
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
        </div>

        <div style={{ overflowY: 'auto', paddingRight: '0.5rem', flex: 1 }}>
          {filteredCustomers.map((customer) => (
            <button
              type="button"
              key={customer.key}
              onClick={() => setSelectedCustomer(customer)}
              className="btn"
              style={{
                width: '100%',
                textAlign: 'left',
                marginBottom: '0.5rem',
                background: selectedCustomer?.key === customer.key ? 'var(--primary)' : 'rgba(255,255,255,0.04)',
                color: selectedCustomer?.key === customer.key ? '#fff' : 'inherit',
                border: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start'
              }}
            >
              <strong>{customer.name}</strong>
              <span style={{ fontSize: '0.85rem', color: selectedCustomer?.key === customer.key ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)' }}>
                {customer.phone || 'No phone on file'}
              </span>
              <span style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                {customer.visitCount} visits · {formatCurrency(customer.totalSpent)}
              </span>
            </button>
          ))}

          {filteredCustomers.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No customers match that search.</div>
          )}
        </div>
      </section>

      <section className="card" style={{ flex: 1, minHeight: '60vh', overflowY: 'auto' }}>
        {selectedCustomer ? (
          <div>
            <header style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ marginBottom: '0.25rem' }}>{selectedCustomer.name}</h2>
              <div style={{ color: 'var(--text-muted)' }}>{selectedCustomer.phone || 'No phone captured'}</div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ padding: '1rem', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Visits</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{selectedCustomer.visitCount}</div>
              </div>
              <div style={{ padding: '1rem', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Lifetime Value</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{formatCurrency(selectedCustomer.totalSpent)}</div>
              </div>
              <div style={{ padding: '1rem', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Last Visit</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{orderedBills[0] ? formatDate(orderedBills[0].date) : '—'}</div>
              </div>
            </div>

            <section style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0 }}>Previous Bills</h3>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{orderedBills.length} records</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {orderedBills.map((bill) => (
                  <div key={bill.id} style={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <strong>{bill.id}</strong>
                      <span>{formatDate(bill.date)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Total</span>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(parseFloat(bill.total || '0') || 0)}</span>
                    </div>
                    {bill.items.length > 0 && (
                      <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.35rem' }}>
                        {bill.items.slice(0, 4).map((item, idx) => (
                          <div key={`${bill.id}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <span>{item.description}</span>
                            <span>{formatCurrency(parseFloat(item.amount || '0') || 0)}</span>
                          </div>
                        ))}
                        {bill.items.length > 4 && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>+ {bill.items.length - 4} more line items</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                {orderedBills.length === 0 && (
                  <div style={{ color: 'var(--text-muted)' }}>No invoices recorded yet.</div>
                )}
              </div>
            </section>

            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '0.75rem' }}>Session Progress</h3>
              {queueLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</div>
              ) : sessionProgress.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {sessionProgress.map((entry) => {
                    const activePct = Math.min(100, (entry.completed / entry.total) * 100);
                    const cancelPct = Math.min(100 - activePct, (entry.cancelled / entry.total) * 100);
                    return (
                      <div key={entry.key} style={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <div>
                            <strong>{entry.description}</strong>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Receipt {entry.receiptId}</div>
                          </div>
                          <div style={{ fontSize: '0.82rem', textAlign: 'right' }}>
                            <span style={{ color: '#16a34a' }}>{entry.completed} done</span>
                            {entry.cancelled > 0 && <span style={{ color: '#dc2626', marginLeft: '0.6rem' }}>{entry.cancelled} cancelled</span>}
                            <span style={{ color: 'var(--text-muted)', marginLeft: '0.6rem' }}>{entry.pending} pending</span>
                          </div>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(0,0,0,0.08)', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                          <div style={{ width: `${activePct}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s' }} />
                          <div style={{ width: `${cancelPct}%`, height: '100%', background: '#fca5a5', transition: 'width 0.3s' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                  {queueItems.length === 0 ? 'No billing data yet.' : 'No multi-session packages found.'}
                </div>
              )}
            </section>

            {/* Billing Queue */}
            <section style={{ marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>Billing Queue</h3>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button type="button" style={tabStyle(queueFilter === 'ALL')} onClick={() => setQueueFilter('ALL')}>
                    All ({queueItems.length})
                  </button>
                  <button type="button" style={tabStyle(queueFilter === 'PENDING')} onClick={() => setQueueFilter('PENDING')}>
                    Pending ({pendingCount})
                  </button>
                  <button type="button" style={tabStyle(queueFilter === 'INVOICED')} onClick={() => setQueueFilter('INVOICED')}>
                    Invoiced ({invoicedCount})
                  </button>
                  {cancelledCount > 0 && (
                    <button type="button" style={tabStyle(queueFilter === 'CANCELLED')} onClick={() => setQueueFilter('CANCELLED')}>
                      Cancelled ({cancelledCount})
                    </button>
                  )}
                </div>
              </div>

              {(queueOutstanding > 0 || queueCredit > 0) && (
                <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem', padding: '0.6rem 0.9rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  {queueOutstanding > 0 && (
                    <span style={{ fontSize: '0.82rem', color: '#ef4444' }}>
                      Outstanding: <strong>{formatCurrency(queueOutstanding)}</strong>
                    </span>
                  )}
                  {queueCredit > 0 && (
                    <span style={{ fontSize: '0.82rem', color: '#16a34a' }}>
                      Advance Credit: <strong>{formatCurrency(queueCredit)}</strong>
                    </span>
                  )}
                </div>
              )}

              {selectedLineIds.size > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', padding: '0.6rem 0.9rem', background: '#fef3c7', borderRadius: 'var(--radius-md)', border: '1px solid #fcd34d' }}>
                  <span style={{ fontSize: '0.85rem', flex: 1, color: '#92400e' }}>
                    {selectedLineIds.size} session{selectedLineIds.size > 1 ? 's' : ''} selected for cancellation
                  </span>
                  <button
                    type="button"
                    onClick={handleCancelSelected}
                    disabled={cancelBusy}
                    style={{ padding: '0.3rem 0.9rem', fontSize: '0.8rem', fontWeight: 600, border: 'none', borderRadius: 'var(--radius-sm)', background: '#dc2626', color: '#fff', cursor: cancelBusy ? 'not-allowed' : 'pointer', opacity: cancelBusy ? 0.6 : 1 }}
                  >
                    {cancelBusy ? 'Cancelling…' : 'Cancel Sessions'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSelectedLineIds(new Set()); setCancelError(''); }}
                    style={{ padding: '0.3rem 0.7rem', fontSize: '0.8rem', border: '1px solid #fcd34d', borderRadius: 'var(--radius-sm)', background: 'transparent', cursor: 'pointer', color: '#92400e' }}
                  >
                    Clear
                  </button>
                </div>
              )}
              {cancelError && (
                <div style={{ marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: '#fee2e2', borderRadius: 'var(--radius-sm)', fontSize: '0.83rem', color: '#dc2626' }}>
                  {cancelError}
                </div>
              )}

              {queueLoading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</div>
              ) : visibleQueue.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  {queueItems.length === 0
                    ? 'No billing entries found for this customer.'
                    : `No ${queueFilter.toLowerCase()} items.`}
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '0.4rem 0.6rem', width: '2rem' }} />
                        <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
                        <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Receipt</th>
                        <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Code</th>
                        <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>Description</th>
                        <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Date</th>
                        <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Amount</th>
                        <th style={{ padding: '0.4rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleQueue.map((item) => (
                        <tr
                          key={item.line_id}
                          style={{ borderBottom: '1px solid rgba(0,0,0,0.04)', opacity: item.status === 'CANCELLED' ? 0.55 : 1 }}
                        >
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                            {item.status === 'PENDING' && (
                              <input
                                type="checkbox"
                                checked={selectedLineIds.has(item.line_id)}
                                onChange={() => toggleLineId(item.line_id)}
                                style={{ cursor: 'pointer' }}
                              />
                            )}
                          </td>
                          <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-muted)' }}>{item.line_id}</td>
                          <td style={{ padding: '0.45rem 0.6rem', fontFamily: 'monospace' }}>{item.receipt_id}</td>
                          <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.product_code || '—'}</td>
                          <td style={{ padding: '0.45rem 0.6rem' }}>{item.item_description}</td>
                          <td style={{ padding: '0.45rem 0.6rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(item.date)}</td>
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(item.taxed_total)}</td>
                          <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, ...statusBadge(item.status) }}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Manual Refund from Credit */}
            {queueCredit > 0 && (
              <section>
                <h3 style={{ marginBottom: '0.75rem' }}>Refund from Credit</h3>
                <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: '#f8fafc' }}>
                  <div style={{ fontSize: '0.83rem', color: '#16a34a', marginBottom: '0.75rem' }}>
                    Available credit: <strong>{formatCurrency(queueCredit)}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '0 0 140px' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Amount (₹)</label>
                      <input
                        type="number"
                        className="form-control"
                        placeholder="0"
                        min={1}
                        max={queueCredit}
                        value={refundAmount}
                        onChange={e => { setRefundAmount(e.target.value); setRefundError(''); }}
                        style={{ margin: 0 }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '160px' }}>
                      <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Note (optional)</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. cash returned to customer"
                        value={refundNote}
                        onChange={e => setRefundNote(e.target.value)}
                        style={{ margin: 0 }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleRefund}
                      disabled={refundBusy || !refundAmount}
                      className="btn btn-primary"
                      style={{ whiteSpace: 'nowrap', opacity: refundBusy || !refundAmount ? 0.6 : 1 }}
                    >
                      {refundBusy ? 'Processing…' : 'Issue Refund'}
                    </button>
                  </div>
                  {refundError && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.83rem', color: '#dc2626' }}>{refundError}</div>
                  )}
                </div>
              </section>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>Select a customer to view their history.</div>
        )}
      </section>
    </div>
  );
};
