import React from 'react';
import logoImg from '../assets/logo.jpeg';
import stampImg from '../assets/stamp.jpeg';
import { BillItem } from '../types';

/* ── number-to-words ─────────────────────────────────────────── */
const numberToWords = (num: number): string => {
    const ones = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen',
    ];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const convert = (n: number): string => {
        if (n === 0) return '';
        if (n < 20) return ones[n];
        if (n < 100) return `${tens[Math.floor(n / 10)]} ${ones[n % 10]}`.trim();
        if (n < 1000) return `${ones[Math.floor(n / 100)]} Hundred ${convert(n % 100)}`.trim();
        if (n < 100000) return `${convert(Math.floor(n / 1000))} Thousand ${convert(n % 1000)}`.trim();
        if (n < 10000000) return `${convert(Math.floor(n / 100000))} Lakh ${convert(n % 100000)}`.trim();
        return `${convert(Math.floor(n / 10000000))} Crore ${convert(n % 10000000)}`.trim();
    };

    if (num === 0) return 'Zero';
    return convert(Math.floor(num)).trim();
};

/* ── date formatter ──────────────────────────────────────────── */
const formatDisplayDate = (input?: string): string => {
    if (!input) return '—';
    const trimmed = input.trim();
    const dotted = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dotted) {
        const [, dd, mm, yyyy] = dotted;
        return `${dd.padStart(2, '0')}.${mm.padStart(2, '0')}.${yyyy}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        const dd = String(parsed.getDate()).padStart(2, '0');
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const yyyy = parsed.getFullYear();
        return `${dd}.${mm}.${yyyy}`;
    }
    return trimmed;
};

/* ── props ───────────────────────────────────────────────────── */
interface PrintTemplateProps {
    clientName: string;
    clientPhone: string;
    clientAddress: string;
    currentBillId: string;
    serviceItems: BillItem[];
    productItems: BillItem[];
    grandTotal: number;
    billDate?: string;
    amountPaid?: number;
    amountPaidDate?: string;
    oldBalanceBillRef?: string;
    oldBalanceAmount?: number;
    /* Legacy props kept for API compatibility — not used in layout */
    serviceDiscountAmount?: number;
    subTotal?: number;
    taxableAmount?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    gstRatePercent?: number;
}

/* ── component ───────────────────────────────────────────────── */
export const PrintTemplate = React.forwardRef<HTMLDivElement, PrintTemplateProps>((props, ref) => {
    const {
        clientName, clientPhone, clientAddress, currentBillId,
        serviceItems, productItems,
        billDate, amountPaid,
        oldBalanceBillRef, oldBalanceAmount,
    } = props;

    const validServices = serviceItems.filter(i => i.description.trim() !== '');
    const validProducts = productItems.filter(i => i.description.trim() !== '');

    const fmt = (v: number | string) => Math.round(Number(v || 0));

    /* ── service totals ── */
    const serviceGrossSubtotal  = validServices.reduce((s, i) => s + Number(i.grossAmount  ?? i.amount ?? 0), 0);
    const serviceDiscSubtotal   = validServices.reduce((s, i) => s + Number(i.discountAmount ?? 0), 0);
    const serviceNetSubtotal    = validServices.reduce((s, i) => s + Number(i.amount ?? 0), 0);

    /* ── product totals ── */
    const productGrossSubtotal  = validProducts.reduce((s, i) => {
        const gross = i.grossAmount ?? (Number(i.price || 0) * Number(i.quantity || 1));
        return s + Number(gross);
    }, 0);
    const productDiscSubtotal   = validProducts.reduce((s, i) => s + Number(i.discountAmount ?? 0), 0);
    const productNetSubtotal    = validProducts.reduce((s, i) => s + Number(i.amount ?? 0), 0);

    /* ── balances ── */
    const oldBal           = Number(oldBalanceAmount || 0);
    const totalB           = productNetSubtotal + oldBal;
    const grandTotalDisplay = serviceNetSubtotal + totalB;

    const displayBillDate  = formatDisplayDate(billDate);

    const safePaid    = typeof amountPaid === 'number'
        ? Math.min(grandTotalDisplay, fmt(amountPaid))
        : grandTotalDisplay;
    const balanceDue  = Math.max(0, grandTotalDisplay - safePaid);
    const amountInWords = numberToWords(safePaid).toUpperCase();

    /* ── render ── */
    return (
        <div ref={ref} className="print-only print-container">

            {/* ── TITLE ── */}
            <div className="pt-title">CASH RECIEPT</div>

            {/* ── LOGO + CLINIC NAME ── */}
            <div className="pt-header">
                <img src={logoImg} className="pt-logo" alt="logo" />
                <div className="pt-clinic-name">
                    AESTHETIC CLINIC BEAUTY STUDIO &amp; ACADEMY
                </div>
            </div>

            {/* ── CLIENT DETAILS + BILL INFO ── */}
            <table className="pt-client-table">
                <tbody>
                    <tr>
                        <td className="pt-client-left">
                            <strong>Client Details</strong>
                            <span>{clientName || '—'}</span>
                            <span>{clientAddress || '—'}</span>
                            <span>CONTACT # {clientPhone || '—'}</span>
                        </td>
                        <td className="pt-client-right">
                            <div className="pt-bi-row"><strong>Bill No : {currentBillId}</strong></div>
                            <div className="pt-bi-row" style={{ marginTop: '6px' }}><strong>Date : {displayBillDate}</strong></div>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* ════════════════════════════════════════
                TABLE A — SERVICES  (6 columns)
            ════════════════════════════════════════ */}
            <table className="pt-main-table">
                <colgroup>
                    <col style={{ width: '6%' }} />
                    <col style={{ width: '38%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '13%' }} />
                    <col style={{ width: '15%' }} />
                </colgroup>
                <thead>
                    <tr>
                        <th>S.NO</th>
                        <th>DESCRIPTION</th>
                        <th>PRICE PER<br />SESSION ₹</th>
                        <th>AMOUNT ₹</th>
                        <th>DISCOUNT ₹</th>
                        <th>NET<br />AMOUNT ₹</th>
                    </tr>
                </thead>
                <tbody>
                    {validServices.length > 0
                        ? validServices.map((item, idx) => {
                            const gross          = Number(item.grossAmount ?? item.amount ?? 0);
                            const disc           = Number(item.discountAmount ?? 0);
                            const net            = Number(item.amount ?? 0);
                            const sessions       = Math.max(1, Number(item.totalSittings || 1));
                            const pricePerSession = Math.round(Number(item.price) / sessions);
                            return (
                                <tr key={`svc-${idx}`}>
                                    <td className="pt-center">{idx + 1}</td>
                                    <td>{item.description}</td>
                                    <td className="pt-right">{pricePerSession}</td>
                                    <td className="pt-right">{fmt(gross)}</td>
                                    <td className="pt-right">{fmt(disc)}</td>
                                    <td className="pt-right">{fmt(net)}</td>
                                </tr>
                            );
                        })
                        : (
                            <tr>
                                <td className="pt-center">—</td>
                                <td>NA</td>
                                <td className="pt-right">0</td>
                                <td className="pt-right">0</td>
                                <td className="pt-right">0</td>
                                <td className="pt-right">0</td>
                            </tr>
                        )
                    }

                    {/* SUB TOTAL */}
                    <tr className="pt-summary-row">
                        <td></td>
                        <td colSpan={2} className="pt-label">SUB TOTAL</td>
                        <td className="pt-right"><strong>{fmt(serviceGrossSubtotal)}</strong></td>
                        <td className="pt-right"><strong>{fmt(serviceDiscSubtotal)}</strong></td>
                        <td className="pt-right"><strong>{fmt(serviceNetSubtotal)}</strong></td>
                    </tr>

                    {/* TOTAL (A) */}
                    <tr className="pt-summary-row pt-total-row">
                        <td></td>
                        <td colSpan={4} className="pt-label"><strong>TOTAL (A)</strong></td>
                        <td className="pt-right"><strong>{fmt(serviceNetSubtotal)}</strong></td>
                    </tr>
                </tbody>
            </table>

            {/* ════════════════════════════════════════
                TABLE B — PRODUCTS / ITEMS  (4 columns)
            ════════════════════════════════════════ */}
            <table className="pt-main-table pt-product-table" style={{ marginTop: '10px' }}>
                <colgroup>
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '63%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '20%' }} />
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
                    {validProducts.length > 0
                        ? validProducts.map((item, idx) => {
                            const gross = Number(item.grossAmount ?? (Number(item.price || 0) * Number(item.quantity || 1)));
                            return (
                                <tr key={`prd-${idx}`}>
                                    <td className="pt-center">{idx + 1}</td>
                                    <td>{item.description}</td>
                                    <td className="pt-center">{item.quantity}</td>
                                    <td className="pt-right">{fmt(gross)}</td>
                                </tr>
                            );
                        })
                        : (
                            <tr>
                                <td className="pt-center">—</td>
                                <td>NA</td>
                                <td className="pt-center">0</td>
                                <td className="pt-right">0</td>
                            </tr>
                        )
                    }

                    {/* TOTAL */}
                    <tr className="pt-summary-row">
                        <td colSpan={3} className="pt-label">TOTAL</td>
                        <td className="pt-right">{fmt(productGrossSubtotal)}</td>
                    </tr>

                    {/* DISCOUNT (only when there is one) */}
                    {productDiscSubtotal > 0 && (
                        <tr className="pt-summary-row">
                            <td colSpan={3} className="pt-label">DISCOUNT</td>
                            <td className="pt-right">-{fmt(productDiscSubtotal)}</td>
                        </tr>
                    )}

                    {/* SUB TOTAL */}
                    <tr className="pt-summary-row">
                        <td colSpan={3} className="pt-label">SUB TOTAL</td>
                        <td className="pt-right">{fmt(productNetSubtotal)}</td>
                    </tr>

                    {/* OLD BALANCE (if any) */}
                    {oldBal > 0 && (
                        <tr className="pt-summary-row">
                            <td colSpan={3} className="pt-label">
                                {oldBalanceBillRef || 'BALANCE DUE'}
                            </td>
                            <td className="pt-right">{fmt(oldBal)}</td>
                        </tr>
                    )}

                    {/* TOTAL (B) */}
                    <tr className="pt-summary-row pt-total-row">
                        <td colSpan={3} className="pt-label"><strong>TOTAL (B)</strong></td>
                        <td className="pt-right"><strong>{fmt(totalB)}</strong></td>
                    </tr>

                    {/* GRAND TOTAL (A+B) */}
                    <tr className="pt-grand-row">
                        <td colSpan={3} className="pt-label"><strong>GRAND TOTAL (A+B)</strong></td>
                        <td className="pt-right"><strong>{grandTotalDisplay}</strong></td>
                    </tr>

                    {/* TOTAL AMOUNT PAID */}
                    <tr className="pt-grand-row">
                        <td colSpan={3} className="pt-label">
                            <strong>TOTAL AMOUNT PAID</strong>
                        </td>
                        <td className="pt-right"><strong>{safePaid}</strong></td>
                    </tr>

                    {/* BALANCE DUE */}
                    <tr className="pt-grand-row pt-balance-row">
                        <td colSpan={3} className="pt-label"><strong>BALANCE DUE AMOUNT</strong></td>
                        <td className="pt-right"><strong>{balanceDue}</strong></td>
                    </tr>
                </tbody>
            </table>

            {/* ── AMOUNT IN WORDS ── */}
            <div className="pt-words">
                TOTAL AMOUNT PAID IN WORDS: {amountInWords} RUPEES
            </div>

            {/* ── NOTE + STAMP ROW ── */}
            <div className="pt-note-stamp-row">
                <div className="pt-note-block">
                    <p className="pt-note">
                        <strong>NOTE:</strong> Items Once Sold Will not be return back and non-refundable.
                    </p>
                    <p className="pt-thank">THANK YOU...</p>
                </div>
                <div className="pt-stamp-block">
                    <img src={stampImg} className="pt-stamp" alt="stamp" />
                </div>
            </div>

            {/* ── FOOTER ── */}
            <div className="pt-footer">
                <div className="pt-footer-line" />
                <div className="pt-tagline">
                    Bring Out the beauty in you...&nbsp;
                    <span className="pt-tree">🌳</span>&nbsp;
                    <span className="pt-green">Save Paper, Save Trees, Save Earth…</span>
                </div>
                <div className="pt-address">
                    No: 6C, Kamarajar Road, Kanchipuram – 631 501&nbsp;&nbsp;&nbsp;&nbsp;Phone: 72006 5004
                </div>
            </div>

        </div>
    );
});
