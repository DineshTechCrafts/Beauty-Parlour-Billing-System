import React from 'react';
import logoImg from '../assets/logo.jpeg';
import stampImg from '../assets/stamp.jpeg';
import { BillItem } from '../types';

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

export interface ReceiptTemplateProps {
    clientName: string;
    clientPhone: string;
    clientAddress: string;
    billNo: string;
    billDate: string;
    serviceItems: BillItem[];
    productItems: BillItem[];
    serviceDiscountTotal: number;
    productDiscountTotal: number;
    amountPaid: number | null;
    oldBalanceAmount: number;
    oldBalanceBillRef: string;
    balanceDue: number;
}

export const ReceiptTemplate: React.FC<ReceiptTemplateProps> = ({
    clientName, clientPhone, clientAddress,
    billNo, billDate,
    serviceItems, productItems,
    serviceDiscountTotal, productDiscountTotal,
    amountPaid, oldBalanceAmount, oldBalanceBillRef, balanceDue,
}) => {
    const validSvc = serviceItems.filter(i => i.description.trim() !== '');
    const validPrd = productItems.filter(i => i.description.trim() !== '');

    const svcGross = validSvc.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
    const svcNet = svcGross - serviceDiscountTotal;

    const prdGross = validPrd.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 1), 0);
    const prdNet = prdGross - productDiscountTotal;

    const grandTotal = svcNet + prdNet;
    const safePaid = amountPaid ?? 0;
    const displayDate = formatDate(billDate);
    const amountInWords = numberToWords(r(safePaid)).toUpperCase();

    return (
        <div className="rt-root">

            {/* Title */}
            <div className="rt-title">CASH RECIEPT</div>

            {/* Header: logo + clinic name */}
            <div className="rt-header">
                <img src={logoImg} className="rt-logo" alt="logo" />
                <div className="rt-clinic">AESTHETIC CLINIC BEAUTY STUDIO &amp; ACADEMY</div>
            </div>

            {/* Client details + Bill info table */}
            <table className="rt-client-table">
                <tbody>
                    <tr>
                        <td className="rt-client-left">
                            <strong>Client Details</strong>
                            <span>Name: {clientName || '—'}</span>
                            <span>Address: {clientAddress || '—'}</span>
                            <span>ContactNo: {clientPhone || '—'}</span>
                        </td>
                        <td className="rt-client-right">
                            <div><strong>Bill No</strong>&nbsp;&nbsp;<strong>{billNo}</strong></div>
                            <div style={{ marginTop: '8px' }}><strong>Date</strong>&nbsp;&nbsp;: {displayDate}</div>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* ── SERVICES TABLE ── */}
            <table className="rt-table">
                <colgroup>
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '55%' }} />
                    <col style={{ width: '19%' }} />
                    <col style={{ width: '19%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th>S.NO</th>
                        <th>DESCRIPTION</th>
                        <th>PRICE PER<br />SESSION ₹</th>
                        <th>AMOUNT ₹</th>
                    </tr>
                </thead>
                <tbody>
                    {validSvc.length > 0
                        ? validSvc.map((item, idx) => {
                            const gross = Number(item.price || 0) * Number(item.quantity || 1);
                            const sessions = Math.max(1, Number(item.totalSittings || 1));
                            const pricePerSession = Math.round(Number(item.price || 0) / sessions);
                            return (
                                <tr key={idx}>
                                    <td className="rt-center">{idx + 1}</td>
                                    <td>{item.description}</td>
                                    <td className="rt-right">{r(pricePerSession)}</td>
                                    <td className="rt-right">{r(gross)}</td>
                                </tr>
                            );
                        })
                        : (
                            <tr>
                                <td className="rt-center">0</td>
                                <td>NA</td>
                                <td className="rt-right">0</td>
                                <td className="rt-right">0</td>
                            </tr>
                        )
                    }
                    <tr className="rt-summary">
                        <td colSpan={3} className="rt-label">SUB TOTAL</td>
                        <td className="rt-right">{r(svcGross)}</td>
                    </tr>
                    <tr className="rt-summary">
                        <td colSpan={3} className="rt-label">DISCOUNT</td>
                        <td className="rt-right">{serviceDiscountTotal > 0 ? `-${r(serviceDiscountTotal)}` : '0'}</td>
                    </tr>
                    <tr className="rt-summary rt-section-total">
                        <td colSpan={3} className="rt-label"><strong>TOTAL (A)</strong></td>
                        <td className="rt-right"><strong>{r(svcNet)}</strong></td>
                    </tr>
                </tbody>
            </table>

            {/* ── PRODUCTS TABLE ── */}
            <table className="rt-table rt-products-table">
                <colgroup>
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '55%' }} />
                    <col style={{ width: '19%' }} />
                    <col style={{ width: '19%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th>S.NO</th>
                        <th>ITEMS</th>
                        <th>QTY</th>
                        <th>AMOUNT ₹</th>
                    </tr>
                </thead>
                <tbody>
                    {validPrd.length > 0
                        ? validPrd.map((item, idx) => {
                            const gross = Number(item.price || 0) * Number(item.quantity || 1);
                            return (
                                <tr key={idx}>
                                    <td className="rt-center">{idx + 1}</td>
                                    <td>{item.description}</td>
                                    <td className="rt-center">{item.quantity}</td>
                                    <td className="rt-right">{r(gross)}</td>
                                </tr>
                            );
                        })
                        : (
                            <tr>
                                <td className="rt-center">0</td>
                                <td>NA</td>
                                <td className="rt-center">0</td>
                                <td className="rt-right">0</td>
                            </tr>
                        )
                    }
                    <tr className="rt-summary">
                        <td colSpan={3} className="rt-label">SUB TOTAL</td>
                        <td className="rt-right">{r(prdGross)}</td>
                    </tr>
                    <tr className="rt-summary">
                        <td colSpan={3} className="rt-label">DISCOUNT</td>
                        <td className="rt-right">{productDiscountTotal > 0 ? `-${r(productDiscountTotal)}` : '0'}</td>
                    </tr>
                    <tr className="rt-summary rt-section-total">
                        <td colSpan={3} className="rt-label"><strong>TOTAL (B)</strong></td>
                        <td className="rt-right"><strong>{r(prdNet)}</strong></td>
                    </tr>

                    {/* Grand summary block */}
                    <tr className="rt-grand">
                        <td colSpan={3} className="rt-label"><strong>GRAND TOTAL (A+B)</strong></td>
                        <td className="rt-right"><strong>{r(grandTotal)}</strong></td>
                    </tr>
                    {oldBalanceAmount > 0 && (
                        <tr className="rt-grand rt-grand-inner">
                            <td colSpan={3} className="rt-label">
                                OLD BALANCE DUE AMOUNT ({oldBalanceBillRef})
                            </td>
                            <td className="rt-right">{r(oldBalanceAmount)}</td>
                        </tr>
                    )}
                    {safePaid > 0 && (
                        <tr className="rt-grand rt-grand-inner">
                            <td colSpan={3} className="rt-label">AMOUNT PAID ON {displayDate}</td>
                            <td className="rt-right">{r(safePaid)}</td>
                        </tr>
                    )}
                    <tr className="rt-grand rt-balance-row">
                        <td colSpan={3} className="rt-label"><strong>BALANCE DUE AMOUNT</strong></td>
                        <td className="rt-right"><strong>{r(balanceDue)}</strong></td>
                    </tr>
                </tbody>
            </table>

            {/* Amount in words */}
            {safePaid > 0 && (
                <div className="rt-words">
                    AMOUNT PAID IN WORDS: {amountInWords} RUPEES.
                </div>
            )}

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
