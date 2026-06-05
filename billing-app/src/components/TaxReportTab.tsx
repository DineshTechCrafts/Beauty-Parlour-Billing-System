import { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { TaxInvoice } from '../types';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - 2 + i);

interface TaxReportTabProps {
  isActive: boolean;
}

export function TaxReportTab({ isActive }: TaxReportTabProps) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [allInvoices, setAllInvoices] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.billingGetTaxInvoices();
      if (result.success && result.data) {
        setAllInvoices(result.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) fetchInvoices();
  }, [isActive, fetchInvoices]);

  const filtered = allInvoices.filter((inv) => {
    if (!inv.date) return false;
    const d = new Date(inv.date);
    return d.getMonth() + 1 === selectedMonth && d.getFullYear() === selectedYear;
  });

  // Deduplicate by gst_seq to count unique invoices
  const uniqueSeqs = new Set(filtered.map((inv) => inv.gst_seq));

  const handleExport = () => {
    if (filtered.length === 0) return;
    setExporting(true);
    try {
      const rows = filtered.map((inv) => ({
        'GST Seq': inv.gst_seq,
        'Receipt ID': inv.receipt_id,
        'Date': inv.date,
        'Client Name': inv.client_name,
        'Client Phone': inv.client_phone,
        'Client Address': inv.client_address,
        'Item Description': inv.item_description,
        'SAC/HSN Code': inv.sac_hsn_code,
        'Unit': inv.unit,
        'Price': inv.price,
        'Quantity': inv.quantity,
        'Amount': inv.amount,
        'Discount': inv.discount,
        'Service Total': inv.service_total,
        'Product Total': inv.product_total,
        'Sub Total': inv.sub_total,
        'Taxable Amount': inv.taxable_amount,
        'GST Rate (%)': inv.gst_rate,
        'CGST': inv.cgst,
        'SGST': inv.sgst,
        'IGST': inv.igst,
        'GST Total': inv.gst_total,
        'Total': inv.total,
        'Place of Supply': inv.place_of_supply,
        'Billing Mode': inv.billing_mode,
        'Invoice Type': inv.invoice_type,
        'Reverse Charge': inv.reverse_charge,
        'Buyer GSTIN': inv.buyer_gstin,
        'Buyer Legal Name': inv.buyer_legal_name,
        'Buyer State Code': inv.buyer_state_code,
        'Source Receipt ID': inv.source_receipt_id,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      const monthLabel = MONTHS.find((m) => m.value === selectedMonth)?.label ?? String(selectedMonth);
      XLSX.utils.book_append_sheet(wb, ws, 'GST Report');

      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GST_Report_${monthLabel}_${selectedYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const monthLabel = MONTHS.find((m) => m.value === selectedMonth)?.label ?? '';

  return (
    <div style={{ padding: '1.5rem', maxWidth: '860px' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1.25rem', fontSize: '1rem', fontWeight: 600 }}>
          Generate GST Report
        </h3>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                background: '#fff',
                color: 'var(--text-main)',
                cursor: 'pointer',
                minWidth: '150px',
              }}
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              style={{
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                background: '#fff',
                color: 'var(--text-main)',
                cursor: 'pointer',
                minWidth: '110px',
              }}
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={filtered.length === 0 || exporting}
            style={{ alignSelf: 'flex-end' }}
          >
            {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>

        {!loading && (
          <div style={{ marginTop: '1.25rem', padding: '0.875rem 1rem', background: 'var(--bg-app)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {filtered.length === 0 ? (
              <span>No GST invoices found for <strong>{monthLabel} {selectedYear}</strong>.</span>
            ) : (
              <span>
                Found <strong>{uniqueSeqs.size}</strong> invoice{uniqueSeqs.size !== 1 ? 's' : ''} with{' '}
                <strong>{filtered.length}</strong> line item{filtered.length !== 1 ? 's' : ''} for{' '}
                <strong>{monthLabel} {selectedYear}</strong>.
              </span>
            )}
          </div>
        )}

        {loading && (
          <div style={{ marginTop: '1.25rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            Loading…
          </div>
        )}
      </div>

      {filtered.length > 0 && (
        <div className="card" style={{ marginTop: '1.25rem', padding: '1rem', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['GST Seq', 'Date', 'Client', 'Item Description', 'Amount', 'Taxable', 'CGST', 'SGST', 'Total'].map((h) => (
                  <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv, i) => (
                <tr key={`${inv.gst_seq}-${inv.source_line_id}-${i}`} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)' }}>{inv.gst_seq}</td>
                  <td style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>{inv.date}</td>
                  <td style={{ padding: '0.5rem 0.75rem' }}>{inv.client_name}</td>
                  <td style={{ padding: '0.5rem 0.75rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.item_description}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>₹{inv.amount.toFixed(2)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>₹{inv.taxable_amount.toFixed(2)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>₹{inv.cgst.toFixed(2)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>₹{inv.sgst.toFixed(2)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>₹{inv.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
