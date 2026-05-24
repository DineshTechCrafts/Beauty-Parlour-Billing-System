import { useEffect, useMemo, useState } from 'react';
import { Customer } from '../types';
import { Icons } from './Icons';

interface CustomerTabProps {
  customers: Customer[];
  sessions: Record<string, Record<string, { total: number; completed: number }>>;
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) {
    return currencyFormatter.format(0);
  }
  return currencyFormatter.format(Math.max(0, Math.round(value)));
};

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown date';
  }
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const CustomerTab = ({ customers, sessions }: CustomerTabProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) {
      return customers;
    }
    const q = searchQuery.trim().toLowerCase();
    return customers.filter((customer) => {
      const nameMatch = customer.name.toLowerCase().includes(q);
      const phoneMatch = (customer.phone || '').toLowerCase().includes(q);
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

  const orderedBills = useMemo(() => {
    if (!selectedCustomer) {
      return [];
    }
    return [...selectedCustomer.bills].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [selectedCustomer]);

  const sessionEntries = useMemo(() => {
    if (!selectedCustomer) {
      return [];
    }
    const key = (selectedCustomer.name || '').trim();
    if (!key || !sessions[key]) {
      return [];
    }
    return Object.entries(sessions[key]).map(([service, progress]) => ({
      service,
      total: progress.total,
      completed: progress.completed
    }));
  }, [selectedCustomer, sessions]);

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

      <section className="card" style={{ flex: 1, minHeight: '60vh' }}>
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

            <section>
              <h3 style={{ marginBottom: '0.75rem' }}>Session Progress</h3>
              {sessionEntries.length > 0 ? (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {sessionEntries.map((entry) => (
                    <div key={entry.service} style={{ border: '1px solid rgba(0,0,0,0.05)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <strong>{entry.service}</strong>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{entry.completed}/{entry.total} sittings completed</div>
                      </div>
                      <div style={{ width: '160px', height: '6px', background: 'rgba(0,0,0,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.min(100, (entry.completed / Math.max(1, entry.total)) * 100)}%`,
                            height: '100%',
                            background: 'var(--primary)'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>No session tracking data found for this customer.</div>
              )}
            </section>
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)' }}>Select a customer to view their history.</div>
        )}
      </section>
    </div>
  );
};
