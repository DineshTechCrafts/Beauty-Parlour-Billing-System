import React from 'react';
import logoImg from '../assets/logo.jpeg';
import stampImg from '../assets/stamp.jpeg';
import { BillItem } from '../types';

const numberToWords = (num: number) => {
    const a = [
        '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const convert = (n: number): string => {
        if (n === 0) return '';
        if (n < 20) return a[n];
        if (n < 100) return `${b[Math.floor(n / 10)]} ${a[n % 10]}`.trim();
        if (n < 1000) return `${a[Math.floor(n / 100)]} Hundred ${convert(n % 100)}`.trim();
        if (n < 100000) return `${convert(Math.floor(n / 1000))} Thousand ${convert(n % 1000)}`.trim();
        return '';
    };

    if (num === 0) return 'Zero';
    return convert(Math.floor(num)).trim();
};

const formatDisplayDate = (input?: string) => {
    if (!input) return '—';
    const trimmed = input.trim();
    const dotted = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (dotted) {
        const [, dd, mm, yyyy] = dotted;
        return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-GB');
    }

    return trimmed;
};

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
}

export const PrintTemplate = React.forwardRef<HTMLDivElement, PrintTemplateProps>((props, ref) => {
    const {
        clientName, clientPhone, clientAddress, currentBillId,
        serviceItems, productItems,
        serviceDiscountAmount,
        grandTotal,
        billDate,
        amountPaid,
        amountPaidDate
    } = props;

    const validServices = serviceItems.filter(i => i.description.trim() !== '');
    const validProducts = productItems.filter(i => i.description.trim() !== '');
    const serviceSubtotal = validServices.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const productSubtotal = validProducts.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const serviceNet = Math.max(0, serviceSubtotal - Number(serviceDiscountAmount || 0));

    const formatValue = (value: number | string) => Math.round(Number(value || 0));
    const displayBillDate = formatDisplayDate(billDate);
    const paymentDate = formatDisplayDate(amountPaidDate || billDate);
    const roundedGrandTotal = formatValue(grandTotal);
    const paidAmountValue = typeof amountPaid === 'number' ? formatValue(amountPaid) : roundedGrandTotal;
    const safePaidAmount = Math.min(roundedGrandTotal, paidAmountValue);
    const balanceDue = Math.max(0, roundedGrandTotal - safePaidAmount);
    const amountInWords = numberToWords(safePaidAmount || roundedGrandTotal).toUpperCase();

    return (
        <div ref={ref} className="print-only print-container">
            <div className="header">
                <img src={logoImg} className="logo" />
                <div className="title">CASH RECEIPT</div>
            </div>

            <div className="divider" />

            <div className="clinic-name">
                AESTHETIC CLINIC BEAUTY STUDIO &amp; ACADEMY
            </div>

            <table className="client-table">
                <tbody>
                    <tr>
                        <td>
                            <strong>Client Details</strong><br />
                            Name: {clientName || '—'}<br />
                            Address: {clientAddress || '—'}<br />
                            Contact No: {clientPhone ? `+91 ${clientPhone}` : '—'}
                        </td>
                        <td className="right">
                            Bill No : {currentBillId}<br />
                            Date : {displayBillDate}
                        </td>
                    </tr>
                </tbody>
            </table>

            <table className="main-table service-table">
                <colgroup>
                    <col className="col-sno" />
                    <col className="col-description" />
                    <col className="col-rate" />
                    <col className="col-amount" />
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
                    {validServices.map((item, index) => (
                        <tr key={`service-${index}`}>
                            <td>{index + 1}</td>
                            <td>{item.description}</td>
                            <td>{formatValue(item.price)}</td>
                            <td>{formatValue(item.amount)}</td>
                        </tr>
                    ))}

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell">SUB TOTAL</td>
                        <td className="amount-cell">{formatValue(serviceSubtotal)}</td>
                    </tr>

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell">DISCOUNT</td>
                        <td className="amount-cell">{serviceDiscountAmount ? `-${formatValue(serviceDiscountAmount)}` : ''}</td>
                    </tr>

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell"><strong>TOTAL (A)</strong></td>
                        <td className="amount-cell"><strong>{formatValue(serviceNet)}</strong></td>
                    </tr>
                </tbody>
            </table>

            <table className="main-table product-table">
                <colgroup>
                    <col className="col-sno" />
                    <col className="col-description" />
                    <col className="col-qty" />
                    <col className="col-amount-wide" />
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
                    {validProducts.map((item, index) => (
                        <tr key={`product-${index}`}>
                            <td>{index + 1}</td>
                            <td>{item.description}</td>
                            <td>{item.quantity}</td>
                            <td>{formatValue(item.amount)}</td>
                        </tr>
                    ))}

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell">SUB TOTAL</td>
                        <td className="amount-cell">{formatValue(productSubtotal)}</td>
                    </tr>

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell">DISCOUNT</td>
                        <td className="amount-cell"></td>
                    </tr>

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell"><strong>TOTAL (B)</strong></td>
                        <td className="amount-cell"><strong>{formatValue(productSubtotal)}</strong></td>
                    </tr>

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell"><strong>GRAND TOTAL (A+B)</strong></td>
                        <td className="amount-cell"><strong>{roundedGrandTotal}</strong></td>
                    </tr>

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell"><strong>NET AMOUNT</strong></td>
                        <td className="amount-cell"><strong>{roundedGrandTotal}</strong></td>
                    </tr>

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell">
                            <strong>AMOUNT PAID ON {paymentDate}</strong>
                        </td>
                        <td className="amount-cell"><strong>{safePaidAmount || ''}</strong></td>
                    </tr>

                    <tr>
                        <td colSpan={2}></td>
                        <td className="label-cell"><strong>. BALANCE DUE AMOUNT</strong></td>
                        <td className="amount-cell"><strong>{balanceDue}</strong></td>
                    </tr>
                </tbody>
            </table>

            <div className="words">
                AMOUNT PAID IN WORDS: {amountInWords} RUPEES.
            </div>

            <img src={stampImg} className="stamp" />

            <div className="note">
                <strong>NOTE:</strong> Items Once Sold Will not be return back and non-refundable.
            </div>

            <div className="thank">
                THANK YOU...
            </div>

            <div className="footer">
                <div className="footer-line" />
                <div className="tagline">
                    Bring Out the beauty in you... <span className="green-text">Save Paper, Save Trees, Save Earth...</span>
                </div>
                <div className="address">
                    No: 6C, Kamarajar Road, Kanchipuram - 631 501 &nbsp; &nbsp; Phone: 72006 50094
                </div>
            </div>
        </div>
    );
});
