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
    serviceDiscountAmount: number;
    subTotal: number;
    taxableAmount: number;
    cgstAmount: number;
    sgstAmount: number;
    gstRatePercent: number;
    grandTotal: number;
    billDate?: string;
    amountPaid?: number;
    amountPaidDate?: string;
    /* Optional: previous unpaid balance carried forward */
    oldBalanceBillRef?: string;   // e.g. "BILL:135(B), DATED:17.02.2026"
    oldBalanceAmount?: number;    // e.g. 6000
}

/* ── component ───────────────────────────────────────────────── */
export const PrintTemplate = React.forwardRef<HTMLDivElement, PrintTemplateProps>((props, ref) => {
    const {
        clientName, clientPhone, clientAddress, currentBillId,
        serviceItems, productItems,
        serviceDiscountAmount,
        grandTotal,
        billDate,
        amountPaid,
        amountPaidDate,
        oldBalanceBillRef,
        oldBalanceAmount,
    } = props;

    /* ── derived values ── */
    const validServices = serviceItems.filter(i => i.description.trim() !== '');
    const validProducts = productItems.filter(i => i.description.trim() !== '');

    const serviceSubtotal = validServices.reduce((s, i) => s + Number(i.amount || 0), 0);
    const productSubtotal = validProducts.reduce((s, i) => s + Number(i.amount || 0), 0);
    const serviceNet      = Math.max(0, serviceSubtotal - Number(serviceDiscountAmount || 0));

    const fmt = (v: number | string) => Math.round(Number(v || 0));

    const displayBillDate = formatDisplayDate(billDate);
    const paymentDate     = formatDisplayDate(amountPaidDate || billDate);

    const roundedGrandTotal = fmt(grandTotal);
    const paidAmountValue   = typeof amountPaid === 'number' ? fmt(amountPaid) : roundedGrandTotal;
    const safePaidAmount    = Math.min(roundedGrandTotal, paidAmountValue);

    const oldBal      = Number(oldBalanceAmount || 0);
    const totalDue    = roundedGrandTotal + oldBal;
    const amountPaidOn = safePaidAmount || roundedGrandTotal;
    const balanceDue  = Math.max(0, totalDue - amountPaidOn);

    const amountInWords = numberToWords(amountPaidOn).toUpperCase();

    /* ── render ── */
    return (
        <div ref={ref} className="print-only print-container">

            {/* ── HEADER ── */}
            <div className="pt-header">
                <img src={logoImg} className="pt-logo" alt="logo" />
                <div className="pt-title">CASH RECEIPT</div>
            </div>

            {/* ── CLINIC NAME ── */}
            <div className="pt-clinic-name">
                AESTHETIC CLINIC BEAUTY STUDIO &amp; ACADEMY
            </div>

            {/* ── CLIENT DETAILS + BILL INFO ── */}
            <table className="pt-client-table">
                <tbody>
                    <tr>
                        <td className="pt-client-left">
                            <strong>Client Details</strong>
                            <span>Name: &nbsp; {clientName || '—'}</span>
                            <span>Address: {clientAddress || '—'}</span>
                            <span>Contact No: {clientPhone || '—'}</span>
                        </td>
                        <td className="pt-client-right">
                            <table className="pt-bill-info-table">
                                <tbody>
                                    <tr>
                                        <td className="pt-bi-label">Bill No</td>
                                        <td className="pt-bi-value">{currentBillId}</td>
                                    </tr>
                                    <tr>
                                        <td className="pt-bi-label">Date</td>
                                        <td className="pt-bi-value">: {displayBillDate}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* ════════════════════════════════════════
                TABLE A — SERVICES
            ════════════════════════════════════════ */}
            <table className="pt-main-table">
                <colgroup>
                    <col className="pt-col-sno" />
                    <col className="pt-col-desc" />
                    <col className="pt-col-rate" />
                    <col className="pt-col-amt" />
                </colgroup>
                <thead>
                    <tr>
                        <th>S.NO</th>
                        <th>DESCRIPTION</th>
                        <th>PRICE PER SESSION ₹</th>
                        <th>AMOUNT ₹</th>
                    </tr>
                </thead>
                <tbody>
                    {validServices.length > 0
                        ? validServices.map((item, idx) => (
                            <tr key={`svc-${idx}`}>
                                <td className="pt-center">{idx + 1}</td>
                                <td>{item.description}</td>
                                <td className="pt-right">{fmt(item.price)}</td>
                                <td className="pt-right">{fmt(item.amount)}</td>
                            </tr>
                        ))
                        : (
                            <tr>
                                <td className="pt-center">—</td>
                                <td>NA</td>
                                <td className="pt-right">0</td>
                                <td className="pt-right">0</td>
                            </tr>
                        )
                    }

                    {/* summary rows — empty spans only S.NO, label spans DESCRIPTION+RATE */}
                    <tr className="pt-summary-row">
                        <td></td>
                        <td colSpan={2} className="pt-label">SUB TOTAL</td>
                        <td className="pt-right">{fmt(serviceSubtotal)}</td>
                    </tr>
                    <tr className="pt-summary-row">
                        <td></td>
                        <td colSpan={2} className="pt-label">DISCOUNT</td>
                        <td className="pt-right">
                            {serviceDiscountAmount ? fmt(serviceDiscountAmount) : 0}
                        </td>
                    </tr>
                    <tr className="pt-summary-row pt-total-row">
                        <td></td>
                        <td colSpan={2} className="pt-label"><strong>TOTAL (A)</strong></td>
                        <td className="pt-right"><strong>{fmt(serviceNet)}</strong></td>
                    </tr>
                </tbody>
            </table>

            {/* ════════════════════════════════════════
                TABLE B — PRODUCTS / ITEMS
            ════════════════════════════════════════ */}
            <table className="pt-main-table pt-product-table" style={{ marginTop: '10px' }}>
                <colgroup>
                    <col className="pt-col-sno" />
                    <col className="pt-col-desc-wide" />
                    <col className="pt-col-qty" />
                    <col className="pt-col-amt" />
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
                        ? validProducts.map((item, idx) => (
                            <tr key={`prd-${idx}`}>
                                <td className="pt-center">{idx + 1}</td>
                                <td>{item.description}</td>
                                <td className="pt-center">{item.quantity}</td>
                                <td className="pt-right">{fmt(item.amount)}</td>
                            </tr>
                        ))
                        : (
                            <tr>
                                <td className="pt-center">—</td>
                                <td>NA</td>
                                <td className="pt-center">0</td>
                                <td className="pt-right">0</td>
                            </tr>
                        )
                    }

                    {/* empty spans only S.NO, label spans ITEMS+QTY */}
                    <tr className="pt-summary-row">
                        <td></td>
                        <td colSpan={2} className="pt-label">SUB TOTAL</td>
                        <td className="pt-right">{fmt(productSubtotal)}</td>
                    </tr>
                    <tr className="pt-summary-row">
                        <td></td>
                        <td colSpan={2} className="pt-label">DISCOUNT</td>
                        <td className="pt-right">0</td>
                    </tr>
                    <tr className="pt-summary-row pt-total-row">
                        <td></td>
                        <td colSpan={2} className="pt-label"><strong>TOTAL (B)</strong></td>
                        <td className="pt-right"><strong>{fmt(productSubtotal)}</strong></td>
                    </tr>

                    {/* Grand totals section — spans full width */}
                    <tr className="pt-grand-row">
                        <td colSpan={3} className="pt-label"><strong>GRAND TOTAL (A+B)</strong></td>
                        <td className="pt-right"><strong>{roundedGrandTotal}</strong></td>
                    </tr>

                    {oldBal > 0 && oldBalanceBillRef && (
                        <tr className="pt-grand-row">
                            <td colSpan={3} className="pt-label">
                                <strong>OLD BALANCE DUE AMOUNT ({oldBalanceBillRef})</strong>
                            </td>
                            <td className="pt-right"><strong>{fmt(oldBal)}</strong></td>
                        </tr>
                    )}

                    <tr className="pt-grand-row">
                        <td colSpan={3} className="pt-label">
                            <strong>AMOUNT PAID ON {paymentDate}</strong>
                        </td>
                        <td className="pt-right"><strong>{amountPaidOn}</strong></td>
                    </tr>

                    <tr className="pt-grand-row pt-balance-row">
                        <td colSpan={3} className="pt-label"><strong>BALANCE DUE AMOUNT</strong></td>
                        <td className="pt-right"><strong>{balanceDue}</strong></td>
                    </tr>
                </tbody>
            </table>

            {/* ── AMOUNT IN WORDS ── */}
            <div className="pt-words">
                AMOUNT PAID IN WORDS: {amountInWords} RUPEES.
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
            </div>

        </div>
    );
});
