import React from 'react';
import logoImg from '../assets/logo.jpeg';
import stampImg from '../assets/stamp.jpeg';

const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'];
const tensWords = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const convertNum = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return `${tensWords[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
    if (n < 1000) return `${ones[Math.floor(n / 100)]} Hundred ${convertNum(n % 100)}`.trim();
    if (n < 100000) return `${convertNum(Math.floor(n / 1000))} Thousand ${convertNum(n % 1000)}`.trim();
    if (n < 10000000) return `${convertNum(Math.floor(n / 100000))} Lakh ${convertNum(n % 100000)}`.trim();
    return `${convertNum(Math.floor(n / 10000000))} Crore ${convertNum(n % 10000000)}`.trim();
};

const numberToWords = (num: number): string => {
    if (num === 0) return 'Zero';
    return convertNum(Math.floor(num)).trim();
};

const formatDate = (input?: string): string => {
    if (!input) return '—';
    const d = new Date(input + (input.length === 10 ? 'T00:00:00' : ''));
    if (isNaN(d.getTime())) return input;
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
};

const r = (v: number) => Math.round(Number(v || 0));

export interface GstInvoiceTemplateProps {
    gst_seq: number;
    date: string;
    clientName: string;
    clientPhone: string;
    clientAddress: string;
    services: Array<{
        description: string;
        sac_hsn_code: string;
        price: number;
        amount: number;
        discount: number;
    }>;
    products: Array<{
        description: string;
        sac_hsn_code: string;
        price: number;
        amount: number;
        discount: number;
        quantity: number;
    }>;
    subTotal: number;
    gstRate: number;
    cgst: number;
    sgst: number;
    grandTotal: number;
    netAmount: number;
    roundOff: number;
}

export const GstInvoiceTemplate: React.FC<GstInvoiceTemplateProps> = ({
    gst_seq, date, clientName, clientPhone, clientAddress,
    services, products,
    subTotal, gstRate, cgst, sgst, grandTotal, netAmount, roundOff
}) => {
    const displayDate = formatDate(date);
    const amountInWords = numberToWords(netAmount).toUpperCase();
    const fmt = (v: number) => Number(v || 0).toFixed(2);

    let productSubTotal = 0;

    return (
        <div className="rt-root">
            {/* Title */}
            <div className="rt-title" style={{ textDecoration: 'underline' }}>TAX INVOICE</div>

            {/* Header: logo + clinic name */}
            <div className="rt-header">
                <img src={logoImg} className="rt-logo" alt="logo" />
                <div className="rt-clinic" style={{ color: '#a82e2e', textTransform: 'uppercase' }}>AESTHETIC CLINIC BEAUTY STUDIO &amp; ACADEMY</div>
            </div>

            {/* Client details + Bill info table */}
            <table className="rt-client-table">
                <tbody>
                    <tr>
                        <td className="rt-client-left">
                            <strong>Billed To:</strong>
                            <span>{clientName || '—'}</span>
                            <span>{clientAddress || '—'}</span>
                            <span>CONTACT # {clientPhone || '—'}</span>
                        </td>
                        <td className="rt-client-right">
                            <div><strong>Invoice No : {gst_seq}</strong></div>
                            <div style={{ marginTop: '8px' }}><strong>Date : {displayDate}</strong></div>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* ── SERVICES TABLE ── */}
            <table className="rt-table">
                <colgroup>
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '33%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '13%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th>S.NO</th>
                        <th>DESCRIPTION</th>
                        <th>HSN/SAC</th>
                        <th>PRICE PER<br />SESSION ₹</th>
                        <th>AMOUNT ₹</th>
                        <th>DISCOUNT ₹</th>
                        <th>NET<br />AMOUNT ₹</th>
                    </tr>
                </thead>
                <tbody>
                    {services.length > 0
                        ? services.map((item, idx) => {
                            const net = r(item.amount) - r(item.discount);
                            return (
                                <tr key={idx}>
                                    <td className="rt-center">{idx + 1}</td>
                                    <td>{item.description}</td>
                                    <td className="rt-center">{item.sac_hsn_code || '-'}</td>
                                    <td className="rt-right">{r(item.amount)}</td>
                                    <td className="rt-right">{r(item.amount)}</td>
                                    <td className="rt-right">{r(item.discount)}</td>
                                    <td className="rt-right">{net}</td>
                                </tr>
                            );
                        })
                        : (
                            <tr>
                                <td className="rt-center">—</td>
                                <td>NA</td>
                                <td className="rt-center">-</td>
                                <td className="rt-right">0</td>
                                <td className="rt-right">0</td>
                                <td className="rt-right">0</td>
                                <td className="rt-right">0</td>
                            </tr>
                        )
                    }
                </tbody>
            </table>

            {/* ── PRODUCTS TABLE ── */}
            <table className="rt-table rt-products-table">
                <colgroup>
                    <col style={{ width: '5%' }} />
                    <col style={{ width: '48%' }} />
                    <col style={{ width: '15%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '20%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th>S.NO</th>
                        <th>ITEMS</th>
                        <th>HSN/SAC</th>
                        <th>QTY</th>
                        <th>AMOUNT ₹</th>
                    </tr>
                </thead>
                <tbody>
                    {products.length > 0
                        ? products.map((item, idx) => {
                            const gross = (Number(item.price || 0) * Number(item.quantity || 1)) - Number(item.discount || 0);
                            productSubTotal += gross;
                            return (
                                <tr key={idx}>
                                    <td className="rt-center">{idx + 1}</td>
                                    <td>{item.description}</td>
                                    <td className="rt-center">{item.sac_hsn_code || '-'}</td>
                                    <td className="rt-center">{item.quantity}</td>
                                    <td className="rt-right">{r(gross)}</td>
                                </tr>
                            );
                        })
                        : (
                            <tr>
                                <td className="rt-center">—</td>
                                <td>NA</td>
                                <td className="rt-center">-</td>
                                <td className="rt-center">0</td>
                                <td className="rt-right">0</td>
                            </tr>
                        )
                    }
                    {/* Summary Block Starts inside Products Table */}
                    <tr className="rt-summary">
                        <td colSpan={4} className="rt-label">SUB TOTAL</td>
                        <td className="rt-right">{r(productSubTotal)}</td>
                    </tr>
                    <tr className="rt-summary">
                        <td colSpan={4} className="rt-label">DISCOUNT</td>
                        <td className="rt-right">0</td>
                    </tr>
                    <tr className="rt-summary rt-section-total">
                        <td colSpan={4} className="rt-label"><strong>TOTAL(B)</strong></td>
                        <td className="rt-right"><strong>{r(productSubTotal)}</strong></td>
                    </tr>

                    {/* Tax Summary Block */}
                    <tr className="rt-summary">
                        <td colSpan={4} className="rt-label">TOTAL(A+B)</td>
                        <td className="rt-right">{r(subTotal)}</td>
                    </tr>
                    <tr className="rt-summary">
                        <td colSpan={4} className="rt-label">TAX RATE</td>
                        <td className="rt-right">{gstRate}%</td>
                    </tr>
                    <tr className="rt-summary">
                        <td colSpan={4} className="rt-label">CGST {gstRate / 2}%</td>
                        <td className="rt-right">{fmt(cgst)}</td>
                    </tr>
                    <tr className="rt-summary">
                        <td colSpan={4} className="rt-label">SGST {gstRate / 2}%</td>
                        <td className="rt-right">{fmt(sgst)}</td>
                    </tr>
                    <tr className="rt-grand" style={{ borderTop: '2px solid #000' }}>
                        <td colSpan={4} className="rt-label"><strong>GRAND TOTAL</strong></td>
                        <td className="rt-right"><strong>{fmt(grandTotal)}</strong></td>
                    </tr>
                    <tr className="rt-summary">
                        <td colSpan={4} className="rt-label">ROUND OFF</td>
                        <td className="rt-right">{fmt(roundOff)}</td>
                    </tr>
                    <tr className="rt-grand rt-balance-row">
                        <td colSpan={4} className="rt-label"><strong>NET AMOUNT</strong></td>
                        <td className="rt-right"><strong>{r(netAmount)}</strong></td>
                    </tr>
                </tbody>
            </table>

            {/* Amount in words */}
            <div className="rt-words">
                TOTAL AMOUNT IN WORDS: {amountInWords} RUPEES
            </div>

            {/* Note + Stamp */}
            <div className="rt-note-stamp">
                <div className="rt-note-block">
                    <p className="rt-note">
                        <strong>NOTE:</strong> Items Once Sold Will not be return back and non-refundable.
                    </p>
                    <p className="rt-thank"><strong>THANK YOU...</strong></p>
                </div>
                <div className="rt-stamp-block">
                    <img src={stampImg} className="rt-stamp" alt="stamp" />
                </div>
            </div>

            {/* Footer */}
            <div className="rt-footer">
                <div className="rt-footer-line" />
                <div className="rt-tagline">
                    <strong>Bring Out the beauty in you...</strong>
                    {' '}<span className="rt-tree">🌳</span>{' '}
                    <span className="rt-green">Save Paper, Save Trees, Save Earth…</span>
                </div>
                <div className="rt-address">
                    No: 6C, Kamarajar Road, Kanchipuram – 631 501{'    '}Phone: 72006 50094
                </div>
            </div>
        </div>
    );
};
