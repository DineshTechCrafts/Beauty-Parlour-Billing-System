import React, { useMemo } from 'react';
import { BillItem, InventoryItem, Customer } from '../types';
import { Icons } from './Icons';

interface BillingTabProps {
    clientName: string;
    setClientName: (v: string) => void;
    clientPhone: string;
    setClientPhone: (v: string) => void;
    clientAddress: string;
    setClientAddress: (v: string) => void;

    productItems: BillItem[];
    setProductItems: React.Dispatch<React.SetStateAction<BillItem[]>>;
    serviceItems: BillItem[];
    setServiceItems: React.Dispatch<React.SetStateAction<BillItem[]>>;

    applyGST: boolean;
    setApplyGST: (v: boolean) => void;
    gstRate: number;
    setGstRate: (v: number) => void;

    inventory: InventoryItem[];
    handleProduceBill: () => void;
    currentBillId: number;
    sessions: Record<string, Record<string, { total: number; completed: number }>>;
    customers: Customer[];
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const formatCurrency = (value: number) => currencyFormatter.format(Math.max(0, Number.isFinite(value) ? value : 0));

const clampServiceMeta = (item: BillItem) => {
    const total = Math.max(1, Number(item.totalSittings || 1));
    let visit = Math.max(1, Number(item.completedSittings || 1));
    if (visit > total) {
        visit = total;
    }
    return { total, visit };
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
    // If open, we show their search string. If closed, we show the selected catalog item description if available, else just the raw value.
    const displayValue = open ? search : (selectedOption ? selectedOption.description : value);

    const filtered = options.filter(o => {
        if (!search) return true;
        if ((o.id || '').includes(search)) return true;
        
        const cleanSearch = search.replace(/\s+/g, '').toLowerCase();
        const cleanDesc = (o.description || '').replace(/\s+/g, '').toLowerCase();
        const cleanCat = (o.category || '').replace(/\s+/g, '').toLowerCase();
        
        return cleanDesc.includes(cleanSearch) || cleanCat.includes(cleanSearch);
    });

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
                        if (filtered.length === 1) {
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
                    {filtered.map(opt => (
                        <div 
                            key={opt.id} 
                            style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onClick={() => { 
                                onChange(opt.id, null); 
                                setOpen(false); 
                            }}
                            onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                            <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                                {opt.description}
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '6px' }}>({opt.id})</span>
                            </span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>₹{Number(opt.price).toLocaleString()}</span>
                        </div>
                    ))}
                    {filtered.length === 0 && <div style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>Type to set as manual entry</div>}
                </div>
            )}
        </div>
    );
};

export const BillingTab: React.FC<BillingTabProps> = ({
    clientName, setClientName, clientPhone, setClientPhone, clientAddress, setClientAddress,
    productItems, setProductItems, serviceItems, setServiceItems,
    applyGST, setApplyGST, gstRate, setGstRate,
    inventory, handleProduceBill, currentBillId, sessions, customers
}) => {
    const sanitizedPhone = clientPhone.trim();
    const returningCustomer = useMemo(
        () => customers.find(c => c.phone?.trim() === sanitizedPhone && sanitizedPhone.length > 0),
        [customers, sanitizedPhone]
    );

    const summaryData = useMemo(() => {
        const getBaseAmount = (item: BillItem, isProduct: boolean) => {
            const price = Number(item.price || 0);
            const qty = Number(item.quantity || 1);
            if (isProduct) return price * qty;
            const { total, visit } = clampServiceMeta(item);
            if ((item.paymentMode || 'per_sitting') !== 'full') {
                return (price / total) * visit * qty;
            }
            return price * qty;
        };

        const servicePreDiscount = serviceItems.reduce((sum, item) => sum + getBaseAmount(item, false), 0);
        const productPreDiscount = productItems.reduce((sum, item) => sum + getBaseAmount(item, true), 0);
        
        const serviceDiscountAmount = serviceItems.reduce((sum, item) => sum + (getBaseAmount(item, false) * Number(item.discount || 0) / 100), 0);
        const productDiscountAmount = productItems.reduce((sum, item) => sum + (getBaseAmount(item, true) * Number(item.discount || 0) / 100), 0);
        const discount = serviceDiscountAmount + productDiscountAmount;

        const serviceSubTotal = serviceItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const productSubTotal = productItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        
        const taxable = Math.max(0, serviceSubTotal + productSubTotal);
        const gstHalf = applyGST ? taxable * (gstRate / 100) : 0;
        const gstTotal = gstHalf * 2;
        const grandTotal = taxable + gstTotal;
        return { servicePreDiscount, productPreDiscount, serviceSubTotal, productSubTotal, discount, taxable, gstTotal, grandTotal };
    }, [serviceItems, productItems, applyGST, gstRate]);

    const handlePhoneChange = (raw: string) => {
        setClientPhone(raw);
        const normalized = raw.trim();
        if (!normalized) {
            return;
        }
        const matched = customers.find(c => c.phone?.trim() === normalized);
        if (matched) {
            setClientName(matched.name);
        }
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
                completedSittings: 1,
                paymentMode: 'per_sitting',
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


    const computeServiceAmount = (item: BillItem) => {
        const price = Number(item.price || 0);
        const qty = Number(item.quantity || 1);
        const discountPercent = Number(item.discount || 0);
        const { total, visit } = clampServiceMeta(item);
        let baseAmount = price * qty;
        if ((item.paymentMode || 'per_sitting') !== 'full') {
            baseAmount = (price / total) * visit * qty;
        }
        const discountVal = (baseAmount * discountPercent) / 100;
        return Math.max(0, baseAmount - discountVal);
    };

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
                    (!isProduct && (field === 'totalSittings' || field === 'completedSittings' || field === 'paymentMode'))
                ) {
                    if (!isProduct) {
                        // Allow completedSittings to exceed totalSittings without artificially clamping it, 
                        // as the user wants to manually adjust these and let them do 2 of 2 or 1 of 1, 
                        // but if they set totalSittings directly, we must ensure it matches logic.
                        const updatedItem = { ...updated };
                        // We do not clamp here! They can manually enter the plan sittings and completed.
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
                    notes: catalogItem.notes
                };
                const withServiceMeta = isProduct
                    ? base
                    : {
                        ...base,
                        totalSittings: Number(catalogItem.totalSittings || item.totalSittings || 1),
                        completedSittings: 1,
                        paymentMode: item.paymentMode || 'per_sitting'
                    };
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
            totalSittings: isProduct ? item.totalSittings : 1,
            completedSittings: isProduct ? item.completedSittings : 1,
            paymentMode: isProduct ? item.paymentMode : 'per_sitting'
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
                                    <th className="col-sessions">Sessions (Visits/Plan)</th>
                                    <th className="col-payment">Payment</th>
                                    <th className="col-amount" style={{ textAlign: 'right' }}>Amount</th>
                                    <th className="col-action"></th>
                                </tr>
                            )}
                        </thead>
                        <tbody>
                            {items.map(item => {
                                const manualService = !isProduct && (item.mode ?? 'catalog') === 'manual';
                                const remainingSessions = !isProduct && item.description.trim()
                                    ? (() => {
                                        const clientKey = clientName.trim();
                                        const serviceKey = item.description.trim();
                                        const record = sessions?.[clientKey]?.[serviceKey];
                                        const total = Number(item.totalSittings || 1);
                                        if (!record) {
                                            return total;
                                        }
                                        return Math.max(0, Number(record.total || total) - Number(record.completed || 0));
                                    })()
                                    : null;

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
                                            {!isProduct && remainingSessions !== null && (
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                    Remaining {remainingSessions} sessions of plan {Number(item.totalSittings || 1)}
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

                                        {/* Sittings (Services only) */}
                                        {!isProduct && (
                                            <td className="col-sessions">
                                                <div className="session-grid">
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        className="form-control session-mini-input"
                                                        value={item.completedSittings || ''}
                                                        onChange={(e) =>
                                                            updateItem(
                                                                item.id,
                                                                'completedSittings',
                                                                Number(e.target.value),
                                                                false
                                                            )
                                                        }
                                                    />
                                                    <span>of</span>
                                                    <input
                                                        type="number"
                                                        min={Math.max(1, Number(item.completedSittings || 1))}
                                                        className="form-control session-mini-input"
                                                        value={item.totalSittings || ''}
                                                        onChange={(e) =>
                                                            updateItem(
                                                                item.id,
                                                                'totalSittings',
                                                                Number(e.target.value),
                                                                false
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </td>
                                        )}

                                        {/* Payment Toggle (Services only) */}
                                        {!isProduct && (
                                            <td className="col-payment">
                                                <div className="payment-toggle">
                                                    <button
                                                        type="button"
                                                        className={item.paymentMode === 'per_sitting' ? 'active' : ''}
                                                        onClick={() => updateItem(item.id, 'paymentMode', 'per_sitting', false)}
                                                    >
                                                        Sitting
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={item.paymentMode === 'full' ? 'active' : ''}
                                                        onClick={() => updateItem(item.id, 'paymentMode', 'full', false)}
                                                    >
                                                        Full
                                                    </button>
                                                </div>
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
                            <p className="section-caption">Capture who you’re serving today</p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {returningCustomer && <span className="badge-returning">Returning Customer</span>}
                            <div className="bill-id-pill">ID: #{currentBillId}</div>
                        </div>
                    </div>
                    <div className="client-grid">
                        <div className="form-group">
                            <label>Full Name</label>
                            <input type="text" className="form-control" placeholder="John Doe" value={clientName} onChange={e => setClientName(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Phone Number</label>
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
                            <label>Address / Session Notes</label>
                            <input type="text" className="form-control" placeholder="123 Street, City..." value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
                        </div>
                    </div>
                </div>

                {renderItemSection(serviceItems, false, 'Services', '2. Services')}
                {renderItemSection(productItems, true, 'Products', '3. Products')}
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
                            <span>Total Discount</span>
                            <strong>-{formatCurrency(summaryData.discount)}</strong>
                        </p>
                        <p>
                            <span>Taxable Amount</span>
                            <strong>{formatCurrency(summaryData.taxable)}</strong>
                        </p>
                        <p>
                            <span>GST ({applyGST ? `${gstRate * 2}%` : '0%'})</span>
                            <strong>{formatCurrency(summaryData.gstTotal)}</strong>
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

                    <div className="summary-total-row">
                        <span>Total Due</span>
                        <span className="total">{formatCurrency(summaryData.grandTotal)}</span>
                    </div>

                    <button className="btn btn-primary btn-checkout" onClick={handleProduceBill}>
                        <Icons.Save /> Generate Invoice
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BillingTab;
