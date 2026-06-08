import { useCallback, useEffect, useMemo, useState } from 'react';
import { Customer, CreditLedgerEntry } from '../types';
import { Icons } from './Icons';

interface CustomerLedgerTabProps {
  customers: Customer[];
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
  return currencyFormatter.format(Math.round(value));
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

type LedgerEntryType = CreditLedgerEntry['type'];

const typeLabel: Record<LedgerEntryType, string> = {
  PAYMENT: 'Payment Received',
  INVOICE: 'Invoice Applied',
  ADVANCE_CREDIT: 'Advance Credit',
  CREDIT_USED: 'Credit Used',
  REFUND: 'Refund Issued',
};

const typeBadge = (type: LedgerEntryType): React.CSSProperties => {
  switch (type) {
    case 'PAYMENT':       return { background: '#dcfce7', color: '#15803d' };
    case 'INVOICE':       return { background: '#dbeafe', color: '#1d4ed8' };
    case 'ADVANCE_CREDIT': return { background: '#f3e8ff', color: '#7e22ce' };
    case 'CREDIT_USED':   return { background: '#ffedd5', color: '#c2410c' };
    case 'REFUND':        return { background: '#fee2e2', color: '#dc2626' };
  }
};

// Balance delta for running balance: PAYMENT +, INVOICE -, REFUND -, rest are informational
const balanceDelta = (entry: CreditLedgerEntry): number => {
  switch (entry.type) {
    case 'PAYMENT': return entry.amount;
    case 'INVOICE': return -entry.amount;
    case 'REFUND':  return -entry.amount;
    default:        return 0;
  }
};

export const CustomerLedgerTab = ({ customers, isActive }: CustomerLedgerTabProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [entries, setEntries] = useState<CreditLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showInternal, setShowInternal] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');
    return customers.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(q);
      const phoneMatch = qDigits.length > 0 && c.phone === qDigits;
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

  const loadLedger = useCallback(async (customerId: string) => {
    setLoading(true);
    try {
      const result = await window.electronAPI.billingGetCustomerLedger(customerId);
      setEntries(result.success ? (result.entries ?? []) : []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomer?.key) {
      loadLedger(selectedCustomer.key);
    } else {
      setEntries([]);
    }
  }, [selectedCustomer, loadLedger]);

  useEffect(() => {
    if (isActive && selectedCustomer?.key) {
      loadLedger(selectedCustomer.key);
    }
  }, [isActive, selectedCustomer?.key, loadLedger]);

  const { entriesWithBalance, totalIn, totalOut, netBalance } = useMemo(() => {
    let running = 0;
    let totalIn = 0;
    let totalOut = 0;
    const allEntries = entries.map((e) => {
      const delta = balanceDelta(e);
      running = Math.round((running + delta) * 100) / 100;
      if (e.type === 'PAYMENT') totalIn += e.amount;
      if (e.type === 'INVOICE' || e.type === 'REFUND') totalOut += e.amount;
      return { ...e, runningBalance: running };
    });

    const filteredEntries = showInternal
      ? allEntries
      : allEntries.filter(e => e.type !== 'ADVANCE_CREDIT' && e.type !== 'CREDIT_USED');

    return { entriesWithBalance: filteredEntries, totalIn, totalOut, netBalance: running };
  }, [entries, showInternal]);

  return (
    <div className="no-print" style={{ display: 'flex', gap: '1.5rem', flex: 1 }}>
      {/* Left panel — customer list */}
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
                {customer.visitCount} visits
              </span>
            </button>
          ))}
          {filteredCustomers.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No customers match that search.</div>
          )}
        </div>
      </section>

      {/* Right panel — ledger */}
      <section className="card" style={{ flex: 1, minHeight: '60vh', overflowY: 'auto' }}>
        {selectedCustomer ? (
          <div>
            <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ marginBottom: '0.25rem' }}>{selectedCustomer.name}</h2>
                <div style={{ color: 'var(--text-muted)' }}>{selectedCustomer.phone || 'No phone captured'}</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={showInternal}
                  onChange={(e) => setShowInternal(e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                Show internal credit allocations
              </label>
            </header>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ padding: '1rem', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Received</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, color: '#15803d' }}>{formatCurrency(totalIn)}</div>
              </div>
              <div style={{ padding: '1rem', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Total Applied</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, color: '#1d4ed8' }}>{formatCurrency(totalOut)}</div>
              </div>
              <div style={{ padding: '1rem', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Net Balance</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600, color: netBalance >= 0 ? '#15803d' : '#dc2626' }}>
                  {formatCurrency(Math.abs(netBalance))}
                  <span style={{ fontSize: '0.8rem', fontWeight: 400, marginLeft: '0.4rem' }}>
                    {netBalance >= 0 ? 'CR' : 'DR'}
                  </span>
                </div>
              </div>
              <div style={{ padding: '1rem', border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Transactions</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{entriesWithBalance.length}</div>
              </div>
            </div>

            {/* Ledger table */}
            {loading ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</div>
            ) : entriesWithBalance.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No ledger entries found for this customer.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>#</th>
                      <th style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Date</th>
                      <th style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600 }}>Type</th>
                      <th style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Reference</th>
                      <th style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Money In</th>
                      <th style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Money Out</th>
                      <th style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entriesWithBalance.map((entry) => {
                      const isInformational = entry.type === 'ADVANCE_CREDIT' || entry.type === 'CREDIT_USED';
                      const moneyIn = entry.type === 'PAYMENT' ? entry.amount : (entry.type === 'ADVANCE_CREDIT' ? entry.amount : null);
                      const moneyOut = (entry.type === 'INVOICE' || entry.type === 'REFUND') ? entry.amount : (entry.type === 'CREDIT_USED' ? entry.amount : null);
                      const isInflow = entry.type === 'PAYMENT';
                      const isOutflow = entry.type === 'INVOICE' || entry.type === 'REFUND';
                      return (
                        <tr
                          key={entry.txn_id}
                          style={{
                            borderBottom: '1px solid rgba(0,0,0,0.04)',
                            opacity: isInformational ? 0.7 : 1,
                            background: isInformational ? 'rgba(0,0,0,0.015)' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{entry.txn_id}</td>
                          <td style={{ padding: '0.5rem 0.6rem', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{formatDate(entry.date)}</td>
                          <td style={{ padding: '0.5rem 0.6rem' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.15rem 0.6rem',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              ...typeBadge(entry.type)
                            }}>
                              {typeLabel[entry.type]}
                            </span>
                          </td>
                          <td style={{ padding: '0.5rem 0.6rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{entry.ref_id}</td>
                          <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 500, color: isInflow ? '#15803d' : 'var(--text-muted)' }}>
                            {moneyIn !== null ? formatCurrency(moneyIn) : '—'}
                          </td>
                          <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 500, color: isOutflow ? '#dc2626' : 'var(--text-muted)' }}>
                            {moneyOut !== null ? formatCurrency(moneyOut) : '—'}
                          </td>
                          <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {isInformational ? (
                              <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>—</span>
                            ) : (
                              <span style={{ color: entry.runningBalance >= 0 ? '#15803d' : '#dc2626' }}>
                                {formatCurrency(Math.abs(entry.runningBalance))}
                                <span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: '0.3rem' }}>
                                  {entry.runningBalance >= 0 ? 'CR' : 'DR'}
                                </span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>Select a customer to view their credit ledger.</div>
        )}
      </section>
    </div>
  );
};
