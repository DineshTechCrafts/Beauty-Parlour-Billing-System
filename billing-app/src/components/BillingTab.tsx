import React, { useMemo, useState, useRef, useEffect } from 'react';
import { BillItem, InventoryItem, Customer } from '../types';
import { Icons } from './Icons';

const INDIA_STATES = [
    { code: '01', name: 'Jammu & Kashmir' },
    { code: '02', name: 'Himachal Pradesh' },
    { code: '03', name: 'Punjab' },
    { code: '04', name: 'Chandigarh' },
    { code: '05', name: 'Uttarakhand' },
    { code: '06', name: 'Haryana' },
    { code: '07', name: 'Delhi' },
    { code: '08', name: 'Rajasthan' },
    { code: '09', name: 'Uttar Pradesh' },
    { code: '10', name: 'Bihar' },
    { code: '11', name: 'Sikkim' },
    { code: '12', name: 'Arunachal Pradesh' },
    { code: '13', name: 'Nagaland' },
    { code: '14', name: 'Manipur' },
    { code: '15', name: 'Mizoram' },
    { code: '16', name: 'Tripura' },
    { code: '17', name: 'Meghalaya' },
    { code: '18', name: 'Assam' },
    { code: '19', name: 'West Bengal' },
    { code: '20', name: 'Jharkhand' },
    { code: '21', name: 'Odisha' },
    { code: '22', name: 'Chhattisgarh' },
    { code: '23', name: 'Madhya Pradesh' },
    { code: '24', name: 'Gujarat' },
    { code: '25', name: 'Daman & Diu and DNH' },
    { code: '26', name: 'Dadra & Nagar Haveli' },
    { code: '27', name: 'Maharashtra' },
    { code: '28', name: 'Andhra Pradesh (old)' },
    { code: '29', name: 'Karnataka' },
    { code: '30', name: 'Goa' },
    { code: '31', name: 'Lakshadweep' },
    { code: '32', name: 'Kerala' },
    { code: '33', name: 'Tamil Nadu' },
    { code: '34', name: 'Puducherry' },
    { code: '35', name: 'Andaman & Nicobar Islands' },
    { code: '36', name: 'Telangana' },
    { code: '37', name: 'Andhra Pradesh' },
    { code: '38', name: 'Ladakh' },
    { code: '97', name: 'Other Territory' },
    { code: '99', name: 'Centre Jurisdiction' },
];

const StateSelect: React.FC<{
    value: string;
    onChange: (code: string) => void;
    placeholder?: string;
    disabled?: boolean;
}> = ({ value, onChange, placeholder = 'Select State...', disabled = false }) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const wrapperRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const selectedState = INDIA_STATES.find(s => s.code === value);
    const displayValue = open ? search : (selectedState ? `${selectedState.name} (${selectedState.code})` : '');

    const filtered = React.useMemo(() => {
        if (!search) return INDIA_STATES;
        const q = search.toLowerCase();
        return INDIA_STATES.filter(s => s.name.toLowerCase().includes(q) || s.code.includes(q));
    }, [search]);

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
            <input
                className="form-control"
                style={{ fontSize: '0.85rem' }}
                placeholder={disabled ? 'Enter phone number first' : placeholder}
                value={displayValue}
                disabled={disabled}
                onChange={e => { setSearch(e.target.value); setOpen(true); }}
                onFocus={() => { if (!disabled) { setOpen(true); setSearch(''); } }}
            />
            {open && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', maxHeight: '200px', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', marginTop: '4px' }}>
                    {filtered.map(state => (
                        <div
                            key={state.code}
                            style={{ padding: '0.6rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onClick={() => { onChange(state.code); setOpen(false); setSearch(''); }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            <span style={{ fontSize: '0.85rem' }}>{state.name}</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{state.code}</span>
                        </div>
                    ))}
                    {filtered.length === 0 && <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>No states found</div>}
                </div>
            )}
        </div>
    );
};

const NameCombobox: React.FC<{
    value: string;
    onChange: (name: string) => void;
    suggestions: string[];
    disabled: boolean;
}> = ({ value, onChange, suggestions, disabled }) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()));
    const showDropdown = open && filtered.length > 0;

    return (
        <div ref={wrapperRef} style={{ position: 'relative' }}>
            <input
                type="text"
                className="form-control"
                placeholder={disabled ? 'Enter phone number first' : 'Full Name'}
                value={value}
                disabled={disabled}
                onChange={e => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
            />
            {showDropdown && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
                    background: '#fff', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', maxHeight: '200px', overflowY: 'auto',
                    boxShadow: 'var(--shadow-lg)', marginTop: '4px'
                }}>
                    {filtered.map(name => (
                        <div
                            key={name}
                            style={{ padding: '0.65rem 1rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}
                            onMouseDown={e => { e.preventDefault(); onChange(name); setOpen(false); }}
                            onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            {name}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

import { CustomerBillingInfo } from '../types';

interface BillingTabProps {
    editingReceiptId?: string | null;
    editingReceiptDate?: string | null;
    clientName: string;
    setClientName: (v: string) => void;
    clientPhone: string;
    setClientPhone: (v: string) => void;
    clientAddress: string;
    setClientAddress: (v: string) => void;

    placeOfSupply: string;
    setPlaceOfSupply: (v: string) => void;

    productItems: BillItem[];
    setProductItems: React.Dispatch<React.SetStateAction<BillItem[]>>;
    serviceItems: BillItem[];
    setServiceItems: React.Dispatch<React.SetStateAction<BillItem[]>>;

    applyGST: boolean;
    setApplyGST: (v: boolean) => void;
    gstRate: number;
    setGstRate: (v: number) => void;

    paymentAmount: string;
    setPaymentAmount: (v: string) => void;
    billReceiptFirst: boolean;
    setBillReceiptFirst: (v: boolean) => void;

    inventory: InventoryItem[];
    handleProduceBill: () => void;
    isProcessing: boolean;
    handleStartNewSeries: () => void;
    nextReceiptId: string | null;
    customerBillingInfo: CustomerBillingInfo | null;
    customers: Customer[];
    receiptLevelDiscount: number;
    setReceiptLevelDiscount: (v: number) => void;
    receiptDiscountType: 'amount' | 'percent';
    setReceiptDiscountType: (v: 'amount' | 'percent') => void;
    effectiveSummaryDiscount: number | null;
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.max(0, Number.isFinite(value) ? value : 0));

const getServiceTotal = (item: BillItem) => {
    const price = Number(item.price || 0);
    const qty = Number(item.quantity || 1);
    const discPct = Number(item.discount || 0);
    const base = price * qty;
    return Math.max(0, base - (base * discPct / 100));
};

const ComboSelect: React.FC<{
    value: string;
    options: InventoryItem[];
    placeholder: string;
    onChange: (id: string | null, rawValue: string | null) => void;
}> = ({ value, options, placeholder, onChange }) => {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState('');
    const wrapperRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const selectedOption = options.find(o => o.id === value);
    const displayValue = open ? search : (selectedOption ? selectedOption.description : value);

    const filtered = React.useMemo(() => {
        if (!search) return options;

        const matches = options.filter(o => {
            if ((o.id || '').includes(search)) return true;

            const cleanSearch = search.replace(/\s+/g, '').toLowerCase();
            const cleanDesc = (o.description || '').replace(/\s+/g, '').toLowerCase();
            const cleanCat = (o.category || '').replace(/\s+/g, '').toLowerCase();

            return cleanDesc.includes(cleanSearch) || cleanCat.includes(cleanSearch);
        });

        return matches.sort((a, b) => {
            const cleanSearch = search.replace(/\s+/g, '').toLowerCase();

            const aId = a.id || '';
            const bId = b.id || '';
            const aDesc = (a.description || '').toLowerCase();
            const bDesc = (b.description || '').toLowerCase();
            const aCat = (a.category || '').toLowerCase();
            const bCat = (b.category || '').toLowerCase();

            if (aId === search && bId !== search) return -1;
            if (bId === search && aId !== search) return 1;

            const cleanADesc = aDesc.replace(/\s+/g, '');
            const cleanBDesc = bDesc.replace(/\s+/g, '');
            if (cleanADesc === cleanSearch && cleanBDesc !== cleanSearch) return -1;
            if (cleanBDesc === cleanSearch && cleanADesc !== cleanSearch) return 1;

            if (aId.startsWith(search) && !bId.startsWith(search)) return -1;
            if (bId.startsWith(search) && !aId.startsWith(search)) return 1;

            if (cleanADesc.startsWith(cleanSearch) && !cleanBDesc.startsWith(cleanSearch)) return -1;
            if (cleanBDesc.startsWith(cleanSearch) && !cleanADesc.startsWith(cleanSearch)) return 1;

            const cleanACat = aCat.replace(/\s+/g, '');
            const cleanBCat = bCat.replace(/\s+/g, '');
            if (cleanACat.startsWith(cleanSearch) && !cleanBCat.startsWith(cleanSearch)) return -1;
            if (cleanBCat.startsWith(cleanSearch) && !cleanACat.startsWith(cleanSearch)) return 1;

            return (a.description || '').localeCompare(b.description || '');
        });
    }, [options, search]);

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
            <input
                className="form-control"
                style={{ fontSize: '0.85rem', fontWeight: 500 }}
                placeholder={placeholder}
                value={displayValue || ''}
                onChange={e => {
                    setSearch(e.target.value);
                    setOpen(true);
                    onChange(null, e.target.value);
                }}
                onFocus={() => {
                    setOpen(true);
                    setSearch('');
                }}
                onKeyDown={e => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const query = search.trim().toLowerCase();
                        const exactIdMatch = filtered.find(o => (o.id || '').toLowerCase() === query);
                        if (exactIdMatch) {
                            onChange(exactIdMatch.id, null);
                            setOpen(false);
                            (e.target as HTMLInputElement).blur();
                        } else if (filtered.length === 1) {
                            onChange(filtered[0].id, null);
                            setOpen(false);
                            (e.target as HTMLInputElement).blur();
                        } else if (filtered.length > 0) {
                            onChange(filtered[0].id, null);
                            setOpen(false);
                            (e.target as HTMLInputElement).blur();
                        } else {
                            setOpen(false);
                            (e.target as HTMLInputElement).blur();
                        }
                    }
                }}
            />
            {open && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999, background: '#fff', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', maxHeight: '250px', overflowY: 'auto', boxShadow: 'var(--shadow-lg)', marginTop: '4px' }}>
                    {filtered.map(opt => {
                        const isExactIdMatch = (opt.id || '').toLowerCase() === search.trim().toLowerCase();
                        return (
                            <div
                                key={opt.id}
                                style={{
                                    padding: '0.75rem 1rem',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    backgroundColor: isExactIdMatch ? '#f0fdf4' : 'transparent'
                                }}
                                onClick={() => {
                                    onChange(opt.id, null);
                                    setOpen(false);
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = isExactIdMatch ? '#dcfce7' : '#f8fafc')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = isExactIdMatch ? '#f0fdf4' : 'transparent')}
                            >
                                <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                    {opt.description}
                                    <span style={{ fontSize: '0.72rem', color: isExactIdMatch ? 'var(--primary)' : 'var(--text-muted)', marginLeft: '6px', fontWeight: isExactIdMatch ? 700 : 500 }}>
                                        ({opt.id}){isExactIdMatch && ' [Exact ID Match]'}
                                    </span>
                                </span>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>₹{Number(opt.price).toLocaleString()}</span>
                            </div>
                        );
                    })}
                    {filtered.length === 0 && <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>Type to set as manual entry</div>}
                </div>
            )}
        </div>
    );
};

export const BillingTab: React.FC<BillingTabProps> = ({
    editingReceiptId,
    clientName, setClientName, clientPhone, setClientPhone, clientAddress, setClientAddress,
    placeOfSupply, setPlaceOfSupply,
    productItems, setProductItems, serviceItems, setServiceItems,
    applyGST, setApplyGST, gstRate, setGstRate,
    paymentAmount, setPaymentAmount, billReceiptFirst, setBillReceiptFirst,
    inventory, handleProduceBill, isProcessing, handleStartNewSeries, nextReceiptId, customerBillingInfo,
    customers,
    receiptLevelDiscount, setReceiptLevelDiscount, receiptDiscountType, setReceiptDiscountType,
    effectiveSummaryDiscount
}) => {
    const [seriesCooldown, setSeriesCooldown] = useState(false);

    const handleStartNewSeriesClick = () => {
        if (seriesCooldown) return;
        handleStartNewSeries();
        setSeriesCooldown(true);
        setTimeout(() => setSeriesCooldown(false), 5000);
    };
    const sanitizedPhone = clientPhone.replace(/\D/g, '');
    const normalizedInputName = clientName.trim().toLowerCase().replace(/\s+/g, ' ');
    const returningCustomer = useMemo(() => {
        if (sanitizedPhone.length !== 10 || !normalizedInputName) return undefined;
        const key = `${sanitizedPhone}::${normalizedInputName}`;
        return customers.find(c => c.key === key);
    }, [customers, sanitizedPhone, normalizedInputName]);

    const phoneCustomers = useMemo(
        () => sanitizedPhone.length === 10
            ? customers.filter(c => c.phone === sanitizedPhone)
            : [],
        [customers, sanitizedPhone]
    );
    const nameSuggestions = useMemo(() => phoneCustomers.map(c => c.name), [phoneCustomers]);
    const isPhoneLocked = sanitizedPhone.length !== 10;

    const summaryData = useMemo(() => {
        const getBaseAmount = (item: BillItem) => {
            const price = Number(item.price || 0);
            const qty = Number(item.quantity || 1);
            return price * qty;
        };

        const servicePreDiscount = serviceItems.reduce((sum, item) => sum + getBaseAmount(item), 0);
        const productPreDiscount = productItems.reduce((sum, item) => sum + getBaseAmount(item), 0);

        const serviceDiscountAmount = serviceItems.reduce((sum, item) => sum + (getBaseAmount(item) * Number(item.discount || 0) / 100), 0);
        const productDiscountAmount = productItems.reduce((sum, item) => sum + (getBaseAmount(item) * Number(item.discount || 0) / 100), 0);
        const discount = serviceDiscountAmount + productDiscountAmount;

        const serviceSubTotal = serviceItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const productSubTotal = productItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

        const taxable = Math.max(0, serviceSubTotal + productSubTotal);

        const gstTotal = applyGST ? taxable * (gstRate * 2 / 100) : 0;
        const grandTotal = taxable + gstTotal;
        return { servicePreDiscount, productPreDiscount, serviceSubTotal, productSubTotal, discount, taxable, gstTotal, grandTotal };
    }, [serviceItems, productItems, applyGST, gstRate]);

    const handlePhoneChange = (raw: string) => {
        setClientPhone(raw);
        setClientName('');
    };

    const addProductItem = () => {
        setProductItems([
            {
                id: Date.now(),
                description: '',
                category: 'Product',
                type: 'Product',
                price: 0,
                quantity: 1,
                amount: 0,
                discount: 0,
                gst: 0,
                catalogId: '',
                mode: 'catalog'
            },
            ...productItems
        ]);
    };

    const addServiceItem = () => {
        setServiceItems([
            {
                id: Date.now(),
                description: '',
                category: 'Service',
                type: 'Service',
                price: 0,
                quantity: 1,
                amount: 0,
                discount: 0,
                totalSittings: 1,
                catalogId: '',
                mode: 'catalog'
            },
            ...serviceItems
        ]);
    };

    const removeItem = (id: number, isProduct: boolean) => {
        const fn = isProduct ? setProductItems : setServiceItems;
        const list = isProduct ? productItems : serviceItems;
        fn(list.filter(item => item.id !== id));
    };


    const computeServiceAmount = (item: BillItem) => getServiceTotal(item);

    const updateItem = (id: number, field: string, value: string | number, isProduct: boolean) => {
        const fn = isProduct ? setProductItems : setServiceItems;
        const list = isProduct ? productItems : serviceItems;
        fn(list.map(item => {
            if (item.id === id) {
                const updated = { ...item, [field]: value };
                if (
                    field === 'price' ||
                    field === 'quantity' ||
                    field === 'discount' ||
                    (!isProduct && field === 'totalSittings')
                ) {
                    if (!isProduct) {
                        const updatedItem = { ...updated };
                        updated.amount = computeServiceAmount(updatedItem);
                    } else {
                        const price = Number(updated.price || 0);
                        const qty = Number(updated.quantity || 1);
                        const discPercent = Number(updated.discount || 0);
                        const baseAmount = price * qty;
                        const discVal = (baseAmount * discPercent) / 100;
                        updated.amount = Math.max(0, baseAmount - discVal);
                    }
                }
                return updated;
            }
            return item;
        }));
    };

    const selectCatalogItem = (id: number, catalogItem: InventoryItem, isProduct: boolean) => {
        const fn = isProduct ? setProductItems : setServiceItems;
        const list = isProduct ? productItems : serviceItems;
        fn(list.map(item => {
            if (item.id === id) {
                const base = {
                    ...item,
                    description: catalogItem.description,
                    price: catalogItem.price,
                    category: catalogItem.category,
                    type: catalogItem.type,
                    gst: catalogItem.gst || 0,
                    catalogId: catalogItem.id,
                    mode: 'catalog' as BillItem['mode'],
                    priceType: catalogItem.priceType,
                    notes: catalogItem.notes,
                    sacHsnCode: catalogItem.sacHsnCode,
                    unit: catalogItem.unit
                };
                const withServiceMeta = isProduct
                    ? base
                    : { ...base, totalSittings: Number(catalogItem.totalSittings || item.totalSittings || 1) };
                return {
                    ...withServiceMeta,
                    amount: isProduct
                        ? Math.max(0, (catalogItem.price * Number(item.quantity || 1)) - ((catalogItem.price * Number(item.quantity || 1)) * Number(item.discount || 0) / 100))
                        : computeServiceAmount(withServiceMeta)
                };
            }
            return item;
        }));
    };

    const clearCatalogItem = (id: number, isProduct: boolean) => {
        const fn = isProduct ? setProductItems : setServiceItems;
        const list = isProduct ? productItems : serviceItems;
        fn(list.map(item => item.id === id ? {
            ...item,
            description: '',
            price: 0,
            amount: 0,
            category: isProduct ? 'Product' : 'Service',
            type: isProduct ? 'Product' : 'Service',
            gst: isProduct ? 0 : item.gst,
            catalogId: '',
            mode: 'catalog',
            priceType: undefined,
            notes: undefined,
            sacHsnCode: undefined,
            unit: undefined,
            totalSittings: isProduct ? item.totalSittings : 1
        } : item));
    };

    const renderItemSection = (items: BillItem[], isProduct: boolean, title: string, stepLabel: string) => {
        const catalogChoices = inventory
            .filter(i => (isProduct ? i.type === 'Product' : i.type === 'Service'))
            .sort((a, b) => (a.description || '').localeCompare(b.description || ''));

        const addHandler = isProduct ? addProductItem : addServiceItem;

        return (
            <div className={`card section-card no-print ${isProduct ? 'product-section-card' : 'service-section-card'}`}>
                <div className="section-heading spread">
                    <div>
                        <h3 className="flow-heading">{stepLabel}</h3>
                        <p className="section-caption">{title}</p>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={addHandler}>
                        <Icons.Plus /> Add {isProduct ? 'Product' : 'Service'}
                    </button>
                </div>

                {items.length > 0 ? (
                    <table className="billing-table">
                        <thead>
                            {isProduct ? (
                                <tr>
                                    <th className="col-desc" style={{ width: '45%' }}>Product Description</th>
                                    <th className="col-price" style={{ width: '20%' }}>Price (₹)</th>
                                    <th className="col-qty" style={{ width: '12%' }}>Qty</th>
                                    <th className="col-disc" style={{ width: '12%' }}>Disc %</th>
                                    <th className="col-amount" style={{ width: '18%', textAlign: 'right' }}>Amount</th>
                                    <th className="col-action" style={{ width: '5%' }}></th>
                                </tr>
                            ) : (
                                <tr>
                                    <th className="col-desc">Service Description</th>
                                    <th className="col-price">Price (₹)</th>
                                    <th className="col-qty">Qty</th>
                                    <th className="col-disc">Disc %</th>
                                    <th className="col-sessions">Sessions (Plan)</th>
                                    <th className="col-amount" style={{ textAlign: 'right' }}>Amount</th>
                                    <th className="col-action"></th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {items.map(item => {
                                const manualService = !isProduct && (item.mode ?? 'catalog') === 'manual';

                                return (
                                    <tr key={item.id}>
                                        {/* Description */}
                                        <td className="col-desc">
                                            {(item.mode ?? 'catalog') === 'manual' ? (
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={item.description}
                                                    onChange={(e) => updateItem(item.id, 'description', e.target.value, isProduct)}
                                                />
                                            ) : (
                                                <ComboSelect
                                                    value={item.catalogId || item.description}
                                                    options={catalogChoices}
                                                    placeholder={`Select or type ${isProduct ? 'Product' : 'Service'}...`}
                                                    onChange={(id, rawValue) => {
                                                        if (id) {
                                                            const match = catalogChoices.find(c => c.id === id);
                                                            if (match) {
                                                                selectCatalogItem(item.id, match, isProduct);
                                                            }
                                                        } else {
                                                            if (!rawValue) {
                                                                clearCatalogItem(item.id, isProduct);
                                                            } else {
                                                                updateItem(item.id, 'description', rawValue, isProduct);
                                                            }
                                                        }
                                                    }}
                                                />
                                            )}
                                            {item.catalogId && (
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    {(() => {
                                                        const catalogMeta = catalogChoices.find(c => c.id === item.catalogId);
                                                        if (!catalogMeta) {
                                                            return null;
                                                        }
                                                        const segments = [catalogMeta.category];
                                                        if (catalogMeta.priceType) {
                                                            segments.push(catalogMeta.priceType);
                                                        }
                                                        if (catalogMeta.notes) {
                                                            segments.push(catalogMeta.notes);
                                                        }
                                                        return segments.filter(Boolean).join(' · ');
                                                    })()}
                                                </div>
                                            )}
                                        </td>

                                        {/* Price */}
                                        <td className="col-price">
                                            {isProduct || manualService ? (
                                                <input
                                                    type="number"
                                                    className="form-control"
                                                    value={item.price || ''}
                                                    onChange={(e) => updateItem(item.id, 'price', Number(e.target.value), isProduct)}
                                                />
                                            ) : (
                                                <div className="value-label">₹{Number(item.price || 0).toLocaleString()}</div>
                                            )}
                                        </td>

                                        {/* Quantity */}
                                        <td className="col-qty">
                                            <input
                                                type="number"
                                                className="form-control qty-input"
                                                value={item.quantity || ''}
                                                onChange={(e) => updateItem(item.id, 'quantity', Number(e.target.value), isProduct)}
                                            />
                                        </td>

                                        {/* Discount */}
                                        <td className="col-disc">
                                            <input
                                                type="number"
                                                className="form-control disc-input"
                                                value={item.discount || ''}
                                                onChange={(e) => updateItem(item.id, 'discount', Number(e.target.value), isProduct)}
                                                placeholder="0"
                                            />
                                        </td>

                                        {/* Sessions plan total (Services only) */}
                                        {!isProduct && (
                                            <td className="col-sessions">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    className="form-control session-mini-input"
                                                    value={item.totalSittings || ''}
                                                    onChange={(e) =>
                                                        updateItem(item.id, 'totalSittings', Number(e.target.value), false)
                                                    }
                                                />
                                            </td>
                                        )}

                                        {/* Total Amount */}
                                        <td className="col-amount">
                                            <span className="amount-label">₹{Number(item.amount || 0).toLocaleString()}</span>
                                        </td>

                                        {/* Remove Button */}
                                        <td className="col-action">
                                            <button
                                                className="btn-danger-icon"
                                                type="button"
                                                onClick={() => removeItem(item.id, isProduct)}
                                            >
                                                <Icons.Trash />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                ) : (
                    <div className="empty-state-block">
                        <p>No {isProduct ? 'products' : 'services'} added yet.</p>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={addHandler}>
                            + Add {isProduct ? 'Product' : 'Service'}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="billing-layout">
            <div className="left-panel">
                <div className="card no-print guest-card">
                    <div className="section-heading spread" style={{ marginBottom: '1.25rem' }}>
                        <div>
                            <h3 className="flow-heading">1. Customer Details</h3>
                            <p className="section-caption">Capture who you're serving today</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {returningCustomer && <span className="badge-returning">Returning Customer</span>}
                            <div className="bill-id-pill">Receipt: {nextReceiptId ?? '—'}</div>
                        </div>
                    </div>

                    <div className="client-grid">
                        <div className="form-group">
                            <label>Phone Number <span style={{ color: 'var(--danger, #ef4444)', fontWeight: 700 }}>*</span></label>
                            <div style={{ display: 'flex' }}>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '0 0.75rem',
                                    backgroundColor: '#f1f5f9',
                                    border: '1px solid #e2e8f0',
                                    borderRight: 'none',
                                    borderTopLeftRadius: 'var(--radius-md)',
                                    borderBottomLeftRadius: 'var(--radius-md)',
                                    color: '#64748b'
                                }}>+91</span>
                                <input
                                    type="text"
                                    maxLength={10}
                                    style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                                    className="form-control"
                                    placeholder="Enter 10-digit number"
                                    value={clientPhone}
                                    onChange={e => {
                                        const val = e.target.value.replace(/\D/g, '');
                                        if (val.length <= 10) handlePhoneChange(val);
                                    }}
                                />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Full Name</label>
                            <NameCombobox
                                value={clientName}
                                onChange={setClientName}
                                suggestions={nameSuggestions}
                                disabled={isPhoneLocked}
                            />
                        </div>
                        <div className="form-group">
                            <label>Address / Session Notes</label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder={isPhoneLocked ? 'Enter phone number first' : '123 Street, City...'}
                                value={clientAddress}
                                disabled={isPhoneLocked}
                                onChange={e => setClientAddress(e.target.value)}
                            />
                        </div>

                        <div className="form-group">
                            <label>Place of Supply</label>
                            <StateSelect value={placeOfSupply} onChange={isPhoneLocked ? () => {} : setPlaceOfSupply} disabled={isPhoneLocked} />
                        </div>
                    </div>

                    {customerBillingInfo && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', gap: '1.5rem' }}>
                                {customerBillingInfo.outstanding > 0 && (
                                    <span style={{ fontSize: '0.8rem', color: '#ef4444' }}>
                                        Outstanding: <strong>{formatCurrency(customerBillingInfo.outstanding)}</strong>
                                    </span>
                                )}
                                {customerBillingInfo.advance_credit > 0 && (
                                    <span style={{ fontSize: '0.8rem', color: '#16a34a' }}>
                                        Advance Credit: <strong>{formatCurrency(customerBillingInfo.advance_credit)}</strong>
                                    </span>
                                )}
                                {customerBillingInfo.outstanding === 0 && customerBillingInfo.advance_credit === 0 && (
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No balance</span>
                                )}
                            </div>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem', opacity: seriesCooldown ? 0.6 : 1 }}
                                onClick={handleStartNewSeriesClick}
                                disabled={seriesCooldown}
                            >
                                {seriesCooldown ? 'Starting…' : 'Start New Series'}
                            </button>
                        </div>
                    )}
                </div>

                <div style={{ opacity: isPhoneLocked ? 0.4 : 1, pointerEvents: isPhoneLocked ? 'none' : 'auto' }}>
                    {renderItemSection(serviceItems, false, 'Services', '2. Services')}
                    {renderItemSection(productItems, true, 'Products', '3. Products')}
                </div>
            </div>

            <div className="right-panel">
                <div className="summary-card">
                    <div className="summary-card-header">
                        <h4>Summary</h4>
                        <p>Updates live as you add items</p>
                    </div>
                    <div className="summary-list">
                        <p>
                            <span>Services</span>
                            <strong>{formatCurrency(summaryData.servicePreDiscount)}</strong>
                        </p>
                        <p>
                            <span>Products</span>
                            <strong>{formatCurrency(summaryData.productPreDiscount)}</strong>
                        </p>
                        <p className="muted">
                            <span>Total Discount{effectiveSummaryDiscount != null ? ' (Receipt)' : ''}</span>
                            <strong>-{formatCurrency(effectiveSummaryDiscount ?? summaryData.discount)}</strong>
                        </p>
                        <p>
                            <span>Taxable Amount</span>
                            <strong>{formatCurrency(
                                effectiveSummaryDiscount != null
                                    ? Math.max(0, summaryData.servicePreDiscount + summaryData.productPreDiscount - effectiveSummaryDiscount)
                                    : summaryData.taxable
                            )}</strong>
                        </p>
                        <p className="muted">
                            <span>CGST ({applyGST ? `${gstRate}%` : '0%'})</span>
                            <strong>{formatCurrency(applyGST ? summaryData.gstTotal / 2 : 0)}</strong>
                        </p>
                        <p className="muted">
                            <span>SGST ({applyGST ? `${gstRate}%` : '0%'})</span>
                            <strong>{formatCurrency(applyGST ? summaryData.gstTotal / 2 : 0)}</strong>
                        </p>
                    </div>

                    {/* Integrated GST Controls */}
                    <div className="tax-control-box">
                        <label className="tax-toggle-label">
                            <input
                                type="checkbox"
                                checked={applyGST}
                                onChange={(e) => setApplyGST(e.target.checked)}
                            />
                            &nbsp; Apply GST (Products Only)
                        </label>
                        <div className="tax-input-grid">
                            <div className="tax-field">
                                <span>CGST</span>
                                <input
                                    type="number"
                                    value={applyGST ? gstRate : ''}
                                    onChange={(e) => setGstRate(Number(e.target.value))}
                                    disabled={!applyGST}
                                />
                                <span>%</span>
                            </div>
                            <div className="tax-field">
                                <span>SGST</span>
                                <input
                                    type="number"
                                    value={applyGST ? gstRate : ''}
                                    onChange={(e) => setGstRate(Number(e.target.value))}
                                    disabled={!applyGST}
                                />
                                <span>%</span>
                            </div>
                        </div>
                    </div>

                    {/* Receipt-level discount (overrides all item discounts) */}
                    <div className="receipt-discount-box">
                        <div className="receipt-discount-label">Receipt Discount (overrides item discounts)</div>
                        <div className="receipt-discount-row">
                            <button
                                type="button"
                                className={`disc-type-btn${receiptDiscountType === 'percent' ? ' active' : ''}`}
                                onClick={() => setReceiptDiscountType('percent')}
                            >%</button>
                            <button
                                type="button"
                                className={`disc-type-btn${receiptDiscountType === 'amount' ? ' active' : ''}`}
                                onClick={() => setReceiptDiscountType('amount')}
                            >₹</button>
                            <input
                                type="number"
                                className="form-control"
                                style={{ fontSize: '0.82rem' }}
                                placeholder={receiptDiscountType === 'percent' ? '0 %' : '₹ 0'}
                                value={receiptLevelDiscount || ''}
                                onChange={e => setReceiptLevelDiscount(Math.max(0, Number(e.target.value)))}
                                min="0"
                                disabled={isPhoneLocked}
                            />
                            {receiptLevelDiscount > 0 && (
                                <button
                                    type="button"
                                    className="disc-clear-btn"
                                    onClick={() => setReceiptLevelDiscount(0)}
                                >✕</button>
                            )}
                        </div>
                    </div>

                    <div className="summary-total-row">
                        <span>Total Due</span>
                        <span className="total">{formatCurrency(
                            effectiveSummaryDiscount != null
                                ? Math.max(0, summaryData.servicePreDiscount + summaryData.productPreDiscount - effectiveSummaryDiscount) + summaryData.gstTotal
                                : summaryData.grandTotal
                        )}</span>
                    </div>

                    {/* Payment section */}
                    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem', display: 'block' }}>
                                Payment Received (₹)
                            </label>
                            <input
                                type="number"
                                className="form-control"
                                placeholder={editingReceiptId ? 'Payments locked during re-edit' : 'Leave blank — items only'}
                                min="0"
                                step="0.01"
                                value={paymentAmount}
                                onChange={e => setPaymentAmount(e.target.value)}
                                disabled={!!editingReceiptId}
                            />
                        </div>
                        {!editingReceiptId && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                                <input
                                    type="checkbox"
                                    checked={billReceiptFirst}
                                    onChange={e => setBillReceiptFirst(e.target.checked)}
                                    style={{ width: 14, height: 14 }}
                                />
                                Apply payment to this receipt first
                            </label>
                        )}
                    </div>

                    <button
                        className="btn btn-primary btn-checkout"
                        onClick={handleProduceBill}
                        disabled={isPhoneLocked || isProcessing}
                        style={{ opacity: (isPhoneLocked || isProcessing) ? 0.5 : 1, cursor: (isPhoneLocked || isProcessing) ? 'not-allowed' : 'pointer' }}
                    >
                        <Icons.Save /> {isProcessing ? 'Saving…' : (editingReceiptId ? 'Update Receipt' : 'Generate Receipt')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BillingTab;
