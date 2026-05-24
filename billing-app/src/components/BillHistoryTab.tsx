
import React, { useState } from 'react';
import { Bill, BillRow } from '../types';
import { Icons } from './Icons';

interface BillHistoryTabProps {
    bills: Bill[];
    onEdit: (bill: Bill) => void;
}

export const BillHistoryTab: React.FC<BillHistoryTabProps> = ({ bills, onEdit }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const toggleExpand = (id: string) => {
        setExpandedId(expandedId === id ? null : id);
    };

    return (
        <div className="card no-print">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 className="section-title"><Icons.History /> Sent Invoices & Clients</h2>
            </div>

            <div className="table-wrapper">
                <table style={{ borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '100px' }}>Invoice #</th>
                            <th style={{ width: '120px' }}>Date</th>
                            <th>Customer Name</th>
                            <th style={{ width: '150px' }}>Contact</th>
                            <th style={{ width: '150px' }}>Total Amount</th>
                            <th style={{ width: '120px', textAlign: 'center' }}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bills.map((bill) => (
                            <React.Fragment key={bill.id}>
                                <tr
                                    onClick={() => toggleExpand(bill.id)}
                                    style={{ cursor: 'pointer', background: expandedId === bill.id ? 'var(--bg-app)' : '#fff' }}
                                >
                                    <td style={{ fontWeight: 800 }}>INV#{bill.id}</td>
                                    <td>{new Date(bill.date).toLocaleDateString()}</td>
                                    <td style={{ fontWeight: 600 }}>{bill.clientName}</td>
                                    <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{bill.clientPhone || '—'}</td>
                                    <td style={{ fontWeight: 800, color: 'var(--primary)' }}>₹{Number(bill.total).toLocaleString()}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); onEdit(bill); }}>
                                            Re-edit
                                        </button>
                                    </td>
                                </tr>
                                {expandedId === bill.id && (
                                    <tr>
                                        <td colSpan={6} style={{ padding: '0' }}>
                                            <div style={{ padding: '2rem', borderLeft: '4px solid var(--primary)', background: '#fff', borderBottom: '1px solid var(--border-light)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
                                                    <div>
                                                        <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Billing Address</h4>
                                                        <p style={{ fontSize: '0.9rem' }}>{bill.clientAddress || 'No address details provided.'}</p>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}><strong>Subtotal:</strong> ₹{bill.subTotal}</p>
                                                        <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}><strong>Discounts:</strong> ₹{bill.discount}</p>
                                                        <p style={{ fontSize: '0.9rem' }}><strong>Product (GST):</strong> ₹{Number(bill.cgst) + Number(bill.sgst)}</p>
                                                    </div>
                                                </div>
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ background: 'transparent' }}>
                                                        <thead>
                                                            <tr style={{ background: '#f8fafc' }}>
                                                                <th style={{ fontSize: '0.65rem' }}>Description</th>
                                                                <th style={{ width: '100px', textAlign: 'right', fontSize: '0.65rem' }}>Price</th>
                                                                <th style={{ width: '80px', textAlign: 'center', fontSize: '0.65rem' }}>Qty</th>
                                                                <th style={{ width: '120px', textAlign: 'right', fontSize: '0.65rem' }}>Amount</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {bill.items.map((it: BillRow, idx: number) => (
                                                                <tr key={idx} style={{ background: 'transparent' }}>
                                                                    <td style={{ fontSize: '0.85rem' }}>{it.description}</td>
                                                                    <td style={{ textAlign: 'right', fontSize: '0.85rem' }}>₹{it.price}</td>
                                                                    <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>{it.quantity}</td>
                                                                    <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem' }}>₹{it.amount}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        ))}
                        {bills.length === 0 && (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Bill archive is currently empty.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
