
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { InventoryItem } from '../types';
import { Icons } from './Icons';

interface InventoryTabProps {
    inventory: InventoryItem[];
    saveInventory: (newInventory: InventoryItem[]) => void;
}

const UQC_OPTIONS = [
    "NA","NOS","PCS","UNT","SET","PRS","DOZ","BOX","PAC","CTN","BAG","BAL","BDL","BKL","BUN",
    "CAN","ROL","TUB","DRM","KGS","GMS","TGM","MTS","TON","QTL","BTL","MLT","KLR","UGS","MTR",
    "CMS","KME","YDS","SQM","SQF","SQY","GRS","GGR","GYD","BOU","THD","TBS","CBM","CCM","OTH"
];

function SearchableDropdown({
    value,
    options,
    onChange,
    onAddNew,
    placeholder = 'Select...'
}: {
    value: string;
    options: string[];
    onChange: (val: string) => void;
    onAddNew?: (val: string) => void;
    placeholder?: string;
}) {
    const [inputVal, setInputVal] = useState(value);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => { setInputVal(value); }, [value]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = options.filter(o => o.toLowerCase().includes(inputVal.toLowerCase()));
    const exactMatch = options.some(o => o.toLowerCase() === inputVal.toLowerCase());
    const showAddNew = onAddNew && inputVal.trim() && !exactMatch;

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <input
                className="form-control"
                value={inputVal}
                placeholder={placeholder}
                autoComplete="off"
                onChange={e => {
                    setInputVal(e.target.value);
                    onChange(e.target.value);
                    if (!open) setOpen(true);
                }}
                onFocus={() => setOpen(true)}
            />
            {open && (filtered.length > 0 || showAddNew) && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10000,
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)', maxHeight: '180px', overflowY: 'auto',
                    marginTop: '2px'
                }}>
                    {filtered.map(opt => (
                        <div
                            key={opt}
                            style={{
                                padding: '8px 12px', cursor: 'pointer', fontSize: '0.875rem',
                                background: opt === value ? 'rgba(37,99,235,0.07)' : undefined,
                                color: opt === value ? '#2563eb' : undefined
                            }}
                            onMouseDown={() => { onChange(opt); setInputVal(opt); setOpen(false); }}
                        >
                            {opt}
                        </div>
                    ))}
                    {showAddNew && (
                        <div
                            style={{
                                padding: '8px 12px', cursor: 'pointer', color: '#2563eb',
                                fontWeight: 600, fontSize: '0.875rem',
                                borderTop: filtered.length > 0 ? '1px solid #f1f5f9' : undefined
                            }}
                            onMouseDown={() => {
                                onAddNew!(inputVal.trim());
                                setOpen(false);
                            }}
                        >
                            + Add &quot;{inputVal.trim()}&quot;
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function FormField({ label, required, children, fullWidth }: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
    fullWidth?: boolean;
}) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: fullWidth ? 'span 2' : undefined }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {label}{required && <span style={{ color: '#ef4444', marginLeft: '2px' }}>*</span>}
            </label>
            {children}
        </div>
    );
}

interface ProductFormState {
    id: string; sacHsnCode: string; unit: string; category: string;
    productName: string; brand: string; mrp: string; sellingPrice: string;
    gst: string; stock: string;
}

interface ServiceFormState {
    id: string; sacHsnCode: string; unit: string; category: string;
    subcategory: string; serviceName: string; basePrice: string;
    priceType: string; gst: string; sessions: string;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ inventory, saveInventory }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editItem, setEditItem] = useState<InventoryItem | null>(null);
    const [filterType, setFilterType] = useState<'All' | 'Product' | 'Service'>('All');
    const [search, setSearch] = useState('');

    const [modalType, setModalType] = useState<'Product' | 'Service' | null>(null);

    const [productForm, setProductForm] = useState<ProductFormState>({
        id: '', sacHsnCode: '', unit: 'NOS', category: '', productName: '',
        brand: '', mrp: '', sellingPrice: '', gst: '18', stock: '0'
    });

    const [serviceForm, setServiceForm] = useState<ServiceFormState>({
        id: '', sacHsnCode: '', unit: 'NA', category: '', subcategory: '',
        serviceName: '', basePrice: '', priceType: 'FIXED', gst: '18', sessions: '1'
    });

    const [extraProductCategories, setExtraProductCategories] = useState<string[]>([]);
    const [extraServiceCategories, setExtraServiceCategories] = useState<string[]>([]);
    const [extraSubcategories, setExtraSubcategories] = useState<string[]>([]);
    const [extraPriceTypes, setExtraPriceTypes] = useState<string[]>([]);

    const productCategories = useMemo(() => Array.from(new Set([
        ...inventory.filter(i => i.type === 'Product').map(i => i.category).filter(Boolean),
        ...extraProductCategories
    ])).sort(), [inventory, extraProductCategories]);

    const serviceCategories = useMemo(() => Array.from(new Set([
        ...inventory.filter(i => i.type === 'Service').map(i => i.category).filter(Boolean),
        ...extraServiceCategories
    ])).sort(), [inventory, extraServiceCategories]);

    const subcategories = useMemo(() => Array.from(new Set([
        ...(inventory.filter(i => i.type === 'Service').map(i => i.subcategory).filter(Boolean) as string[]),
        ...extraSubcategories
    ])).sort(), [inventory, extraSubcategories]);

    const priceTypes = useMemo(() => Array.from(new Set([
        'FIXED', 'VARIABLE', 'ONWARDS',
        ...(inventory.filter(i => i.type === 'Service').map(i => i.priceType).filter(Boolean) as string[]),
        ...extraPriceTypes
    ])).sort(), [inventory, extraPriceTypes]);

    const serviceFinalPrice = useMemo(() => {
        const base = parseFloat(serviceForm.basePrice) || 0;
        const gst = parseFloat(serviceForm.gst) || 0;
        return (base + (base * gst / 100)).toFixed(2);
    }, [serviceForm.basePrice, serviceForm.gst]);

    const generateId = (type: 'Product' | 'Service') => {
        const prefix = type === 'Product' ? 'PRD' : 'SRV';
        const manualItems = inventory.filter(i => i.source === 'manual' && i.type === type);
        let maxNum = 0;
        manualItems.forEach(item => {
            const match = item.id.match(/_M(\d+)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
            }
        });
        return `${prefix}_M${String(maxNum + 1).padStart(3, '0')}`;
    };

    const openModal = (type: 'Product' | 'Service') => {
        const newId = generateId(type);
        if (type === 'Product') {
            setProductForm({ id: newId, sacHsnCode: '', unit: 'NOS', category: '', productName: '', brand: '', mrp: '', sellingPrice: '', gst: '18', stock: '0' });
            setExtraProductCategories([]);
        } else {
            setServiceForm({ id: newId, sacHsnCode: '', unit: 'NA', category: '', subcategory: '', serviceName: '', basePrice: '', priceType: 'FIXED', gst: '18', sessions: '1' });
            setExtraServiceCategories([]);
            setExtraSubcategories([]);
            setExtraPriceTypes([]);
        }
        setModalType(type);
    };

    const closeModal = () => setModalType(null);

    const saveProduct = () => {
        if (!productForm.productName.trim()) { alert('Product Name is required.'); return; }
        if (!productForm.id.trim()) { alert('Product ID is required.'); return; }
        const finalId = productForm.id.trim().toUpperCase();
        if (inventory.some(i => i.id === finalId)) { alert(`ID "${finalId}" is already in use.`); return; }
        const newItem: InventoryItem = {
            id: finalId,
            type: 'Product',
            category: productForm.category.trim() || 'Retail',
            description: productForm.productName.trim(),
            price: parseFloat(productForm.sellingPrice) || 0,
            quantity: parseInt(productForm.stock) || 0,
            gst: parseFloat(productForm.gst) || 0,
            brand: productForm.brand.trim() || undefined,
            sacHsnCode: productForm.sacHsnCode.trim() || undefined,
            unit: productForm.unit || undefined,
            mrp: parseFloat(productForm.mrp) || undefined,
            source: 'manual'
        };
        saveInventory([newItem, ...inventory]);
        closeModal();
    };

    const saveService = () => {
        if (!serviceForm.serviceName.trim()) { alert('Service Name is required.'); return; }
        if (!serviceForm.id.trim()) { alert('Service ID is required.'); return; }
        const finalId = serviceForm.id.trim().toUpperCase();
        if (inventory.some(i => i.id === finalId)) { alert(`ID "${finalId}" is already in use.`); return; }
        const newItem: InventoryItem = {
            id: finalId,
            type: 'Service',
            category: serviceForm.category.trim() || 'General',
            subcategory: serviceForm.subcategory.trim() || undefined,
            description: serviceForm.serviceName.trim(),
            price: parseFloat(serviceForm.basePrice) || 0,
            gst: parseFloat(serviceForm.gst) || 0,
            totalSittings: parseInt(serviceForm.sessions) || 1,
            priceType: serviceForm.priceType.trim() || undefined,
            sacHsnCode: serviceForm.sacHsnCode.trim() || undefined,
            unit: serviceForm.unit || undefined,
            source: 'manual'
        };
        saveInventory([newItem, ...inventory]);
        closeModal();
    };

    const startEdit = (item: InventoryItem) => {
        setEditingId(item.id);
        setEditItem({ ...item });
    };

    const cancelEdit = () => {
        if (editItem) {
            const originalItem = inventory.find(i => i.id === editItem.id);
            if (originalItem && (originalItem.description === 'New Product' || originalItem.description === 'New Service' || originalItem.description.trim() === '')) {
                saveInventory(inventory.filter(i => i.id !== editItem.id));
            }
        }
        setEditingId(null);
        setEditItem(null);
    };

    const saveEdit = () => {
        if (editItem) {
            if (editItem.description === 'New Product' || editItem.description === 'New Service' || editItem.description.trim() === '') {
                saveInventory(inventory.filter(i => i.id !== editItem.id));
            } else {
                const isIdTaken = inventory.some(i => i.id === editItem.id && i.id !== editingId);
                if (isIdTaken) {
                    alert(`Error: The ID "${editItem.id}" is already in use by another item. Please choose a unique ID.`);
                    return;
                }
                if (!editItem.id.trim()) {
                    alert('Error: Item ID cannot be empty.');
                    return;
                }
                const newList = inventory.map(i => i.id === editingId ? editItem : i);
                saveInventory(newList);
            }
            setEditingId(null);
            setEditItem(null);
        }
    };

    const deleteRow = (id: string) => {
        if (window.confirm('Are you sure you want to remove this from your catalog?')) {
            saveInventory(inventory.filter(i => i.id !== id));
        }
    };

    const filtered = useMemo(() => {
        const baseFiltered = inventory.filter(i => {
            const matchesType = filterType === 'All' || i.type === filterType;
            const matchesSearch = (() => {
                if (!search) return true;
                if ((i.id || '').includes(search)) return true;
                const cleanSearch = search.replace(/\s+/g, '').toLowerCase();
                const cleanDesc = (i.description || '').replace(/\s+/g, '').toLowerCase();
                const cleanCat = (i.category || '').replace(/\s+/g, '').toLowerCase();
                return cleanDesc.includes(cleanSearch) || cleanCat.includes(cleanSearch);
            })();
            return matchesType && matchesSearch;
        });

        return baseFiltered.sort((a, b) => {
            if (a.id === editingId && b.id !== editingId) return -1;
            if (b.id === editingId && a.id !== editingId) return 1;
            if (!search) return 0;
            const cleanSearch = search.replace(/\s+/g, '').toLowerCase();
            const aId = a.id || '', bId = b.id || '';
            const aDesc = (a.description || '').toLowerCase(), bDesc = (b.description || '').toLowerCase();
            const aCat = (a.category || '').toLowerCase(), bCat = (b.category || '').toLowerCase();
            if (aId === search && bId !== search) return -1;
            if (bId === search && aId !== search) return 1;
            const cleanADesc = aDesc.replace(/\s+/g, ''), cleanBDesc = bDesc.replace(/\s+/g, '');
            if (cleanADesc === cleanSearch && cleanBDesc !== cleanSearch) return -1;
            if (cleanBDesc === cleanSearch && cleanADesc !== cleanSearch) return 1;
            if (aId.startsWith(search) && !bId.startsWith(search)) return -1;
            if (bId.startsWith(search) && !aId.startsWith(search)) return 1;
            if (cleanADesc.startsWith(cleanSearch) && !cleanBDesc.startsWith(cleanSearch)) return -1;
            if (cleanBDesc.startsWith(cleanSearch) && !cleanADesc.startsWith(cleanSearch)) return 1;
            const cleanACat = aCat.replace(/\s+/g, ''), cleanBCat = bCat.replace(/\s+/g, '');
            if (cleanACat.startsWith(cleanSearch) && !cleanBCat.startsWith(cleanSearch)) return -1;
            if (cleanBCat.startsWith(cleanSearch) && !cleanACat.startsWith(cleanSearch)) return 1;
            return aDesc.localeCompare(bDesc);
        });
    }, [inventory, filterType, search, editingId]);

    const modalOverlayStyle: React.CSSProperties = {
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
    };

    const modalCardStyle: React.CSSProperties = {
        background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '680px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column',
        maxHeight: '90vh', overflow: 'hidden'
    };

    const modalHeaderStyle: React.CSSProperties = {
        padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
    };

    const modalBodyStyle: React.CSSProperties = {
        padding: '1.5rem', overflowY: 'auto', flex: 1
    };

    const modalFooterStyle: React.CSSProperties = {
        padding: '1rem 1.5rem', borderTop: '1px solid #f1f5f9',
        display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', flexShrink: 0
    };

    const formGridStyle: React.CSSProperties = {
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'
    };

    return (
        <div className="catalog-mgmt-flow">
            <div className="card no-print" style={{ marginBottom: '2rem', paddingBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h2 className="section-title" style={{ margin: 0 }}><Icons.Package /> Catalog Definitions</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.4rem' }}>Formalize your pricing and track product stock.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => openModal('Service')}><Icons.Plus /> Add Service</button>
                        <button className="btn btn-primary btn-sm" onClick={() => openModal('Product')}><Icons.Plus /> Add Product</button>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: 'var(--radius-md)', gap: '4px' }}>
                        {(['All', 'Service', 'Product'] as const).map(t => (
                            <button key={t} onClick={() => setFilterType(t)} className={`btn btn-sm ${filterType === t ? 'btn-primary' : 'btn-ghost'}`} style={{ minWidth: '80px', padding: '0.5rem' }}>{t}s</button>
                        ))}
                    </div>
                    <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                        <div style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }}><Icons.Search /></div>
                        <input type="text" className="form-control" placeholder="Search item or category..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: '40px' }} />
                    </div>
                </div>
            </div>

            <div className="table-wrapper no-print">
                <table>
                    <thead>
                        <tr>
                            <th style={{ width: '130px' }}>Item Type</th>
                            <th style={{ width: '110px' }}>ID</th>
                            <th>Description</th>
                            <th style={{ width: '130px' }}>Unit Price (₹)</th>
                            <th style={{ width: '130px' }}>Stock Info</th>
                            <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((item) => {
                            const isEditing = editingId === item.id;
                            const isManualEditing = isEditing && editItem?.source === 'manual';
                            const safeQuantity = Math.max(0, Number(item.quantity ?? 0));
                            return (
                                <tr key={item.id}>
                                    {isEditing ? (
                                        <>
                                            <td>
                                                <select
                                                    className="form-control"
                                                    value={editItem?.type}
                                                    disabled={!isManualEditing}
                                                    onChange={e => setEditItem(prev => prev ? { ...prev, type: e.target.value } : null)}
                                                    style={{ padding: '0.4rem', fontSize: '0.8rem', width: '100%' }}
                                                >
                                                    <option value="Service">Service</option>
                                                    <option value="Product">Product</option>
                                                </select>
                                            </td>
                                            <td>
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.id}</span>
                                            </td>
                                            <td>
                                                {isManualEditing && (
                                                    <div style={{ marginBottom: '8px' }}>
                                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>Item ID</label>
                                                        <input
                                                            className="form-control"
                                                            value={editItem?.id || ''}
                                                            onChange={e => {
                                                                const newId = e.target.value.trim().toUpperCase();
                                                                setEditItem(prev => prev ? { ...prev, id: newId } : null);
                                                            }}
                                                            style={{ fontSize: '0.8rem' }}
                                                        />
                                                    </div>
                                                )}
                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>Description</label>
                                                <input
                                                    className="form-control"
                                                    value={editItem?.description}
                                                    disabled={!isManualEditing}
                                                    onChange={e => setEditItem(prev => prev ? { ...prev, description: e.target.value } : null)}
                                                    style={{ marginBottom: '8px' }}
                                                />
                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px', fontWeight: 600 }}>Category</label>
                                                <input
                                                    className="form-control"
                                                    placeholder="Category"
                                                    value={editItem?.category}
                                                    disabled={!isManualEditing}
                                                    onChange={e => setEditItem(prev => prev ? { ...prev, category: e.target.value } : null)}
                                                    style={{ fontSize: '0.75rem' }}
                                                />
                                                {!isManualEditing && (
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                                                        Description managed via master catalog
                                                    </div>
                                                )}
                                            </td>
                                            <td><input type="number" className="form-control" value={editItem?.price} onChange={e => setEditItem(prev => prev ? { ...prev, price: Number(e.target.value) } : null)} /></td>
                                            <td>
                                                {editItem?.type === 'Product' ? (
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        value={(editItem?.quantity ?? 0).toString()}
                                                        onChange={e => {
                                                            const cleanNum = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
                                                            setEditItem(prev => prev ? { ...prev, quantity: cleanNum ? Number(cleanNum) : 0 } : null);
                                                        }}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Non-Inventory</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                    <button className="btn btn-primary btn-sm" style={{ padding: '0.4rem' }} onClick={saveEdit}>✔</button>
                                                    <button className="btn btn-secondary btn-sm" style={{ padding: '0.4rem' }} onClick={cancelEdit}>✕</button>
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                                    <span className={`badge ${item.type === 'Service' ? 'badge-service' : 'badge-product'}`}>{item.type}</span>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', marginTop: '6px' }}>{item.category}</div>
                                                </div>
                                            </td>
                                            <td>
                                                <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{item.id}</span>
                                            </td>
                                            <td>
                                                <span style={{ fontWeight: 600 }}>{item.description}</span>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>ID: {item.id}</div>
                                            </td>
                                            <td><span style={{ fontWeight: 700, color: 'var(--secondary)' }}>₹{item.price.toLocaleString()}</span></td>
                                            <td>
                                                {item.type === 'Product' ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: safeQuantity < 5 ? '#ef4444' : '#34c759' }}></span>
                                                        <span style={{ fontSize: '0.85rem' }}>{safeQuantity} units</span>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Infinite</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(item)}><Icons.Plus /> Edit</button>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => deleteRow(item.id)} style={{ color: '#ef4444', cursor: 'pointer' }}><Icons.Trash /></button>
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                        {filtered.length === 0 && (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Inventory is empty.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* ── Add Product Modal ── */}
            {modalType === 'Product' && (
                <div style={modalOverlayStyle} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div style={modalCardStyle}>
                        <div style={modalHeaderStyle}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Add Product</h2>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>New product will be saved to catalog records</p>
                            </div>
                            <button
                                onClick={closeModal}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', padding: '4px', lineHeight: 1 }}
                            >✕</button>
                        </div>

                        <div style={modalBodyStyle}>
                            <div style={formGridStyle}>
                                <FormField label="Product ID" required>
                                    <input
                                        className="form-control"
                                        value={productForm.id}
                                        placeholder="e.g. PRD_M001"
                                        onChange={e => setProductForm(p => ({ ...p, id: e.target.value.toUpperCase() }))}
                                    />
                                </FormField>

                                <FormField label="SAC / HSN Code">
                                    <input
                                        className="form-control"
                                        value={productForm.sacHsnCode}
                                        placeholder="e.g. 33049910"
                                        onChange={e => setProductForm(p => ({ ...p, sacHsnCode: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="Category" required>
                                    <SearchableDropdown
                                        value={productForm.category}
                                        options={productCategories}
                                        placeholder="Select or search category..."
                                        onChange={val => setProductForm(p => ({ ...p, category: val }))}
                                        onAddNew={val => {
                                            setExtraProductCategories(prev => [...prev, val]);
                                            setProductForm(p => ({ ...p, category: val }));
                                        }}
                                    />
                                </FormField>

                                <FormField label="Unit (UQC)">
                                    <SearchableDropdown
                                        value={productForm.unit}
                                        options={UQC_OPTIONS}
                                        placeholder="Select unit..."
                                        onChange={val => setProductForm(p => ({ ...p, unit: val }))}
                                    />
                                </FormField>

                                <FormField label="Product Name" required fullWidth>
                                    <input
                                        className="form-control"
                                        value={productForm.productName}
                                        placeholder="Enter product name"
                                        onChange={e => setProductForm(p => ({ ...p, productName: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="Brand">
                                    <input
                                        className="form-control"
                                        value={productForm.brand}
                                        placeholder="Brand name"
                                        onChange={e => setProductForm(p => ({ ...p, brand: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="GST %">
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={productForm.gst}
                                        min="0"
                                        placeholder="18"
                                        onChange={e => setProductForm(p => ({ ...p, gst: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="MRP (₹)">
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={productForm.mrp}
                                        min="0"
                                        placeholder="0.00"
                                        onChange={e => setProductForm(p => ({ ...p, mrp: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="Selling Price (₹)" required>
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={productForm.sellingPrice}
                                        min="0"
                                        placeholder="0.00"
                                        onChange={e => setProductForm(p => ({ ...p, sellingPrice: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="Stock">
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={productForm.stock}
                                        min="0"
                                        placeholder="0"
                                        onChange={e => setProductForm(p => ({ ...p, stock: e.target.value }))}
                                    />
                                </FormField>
                            </div>
                        </div>

                        <div style={modalFooterStyle}>
                            <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveProduct}>Save Product</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Add Service Modal ── */}
            {modalType === 'Service' && (
                <div style={modalOverlayStyle} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
                    <div style={modalCardStyle}>
                        <div style={modalHeaderStyle}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Add Service</h2>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>New service will be saved to catalog records</p>
                            </div>
                            <button
                                onClick={closeModal}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--text-muted)', padding: '4px', lineHeight: 1 }}
                            >✕</button>
                        </div>

                        <div style={modalBodyStyle}>
                            <div style={formGridStyle}>
                                <FormField label="Service ID" required>
                                    <input
                                        className="form-control"
                                        value={serviceForm.id}
                                        placeholder="e.g. SRV_M001"
                                        onChange={e => setServiceForm(s => ({ ...s, id: e.target.value.toUpperCase() }))}
                                    />
                                </FormField>

                                <FormField label="SAC / HSN Code">
                                    <input
                                        className="form-control"
                                        value={serviceForm.sacHsnCode}
                                        placeholder="e.g. 999721"
                                        onChange={e => setServiceForm(s => ({ ...s, sacHsnCode: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="Category" required>
                                    <SearchableDropdown
                                        value={serviceForm.category}
                                        options={serviceCategories}
                                        placeholder="Select or search category..."
                                        onChange={val => setServiceForm(s => ({ ...s, category: val }))}
                                        onAddNew={val => {
                                            setExtraServiceCategories(prev => [...prev, val]);
                                            setServiceForm(s => ({ ...s, category: val }));
                                        }}
                                    />
                                </FormField>

                                <FormField label="Subcategory">
                                    <SearchableDropdown
                                        value={serviceForm.subcategory}
                                        options={subcategories}
                                        placeholder="Select or search subcategory..."
                                        onChange={val => setServiceForm(s => ({ ...s, subcategory: val }))}
                                        onAddNew={val => {
                                            setExtraSubcategories(prev => [...prev, val]);
                                            setServiceForm(s => ({ ...s, subcategory: val }));
                                        }}
                                    />
                                </FormField>

                                <FormField label="Service Name" required fullWidth>
                                    <input
                                        className="form-control"
                                        value={serviceForm.serviceName}
                                        placeholder="Enter service name"
                                        onChange={e => setServiceForm(s => ({ ...s, serviceName: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="Base Price (₹)" required>
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={serviceForm.basePrice}
                                        min="0"
                                        placeholder="0.00"
                                        onChange={e => setServiceForm(s => ({ ...s, basePrice: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="Price Type">
                                    <SearchableDropdown
                                        value={serviceForm.priceType}
                                        options={priceTypes}
                                        placeholder="Select price type..."
                                        onChange={val => setServiceForm(s => ({ ...s, priceType: val }))}
                                        onAddNew={val => {
                                            setExtraPriceTypes(prev => [...prev, val]);
                                            setServiceForm(s => ({ ...s, priceType: val }));
                                        }}
                                    />
                                </FormField>

                                <FormField label="GST %">
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={serviceForm.gst}
                                        min="0"
                                        placeholder="18"
                                        onChange={e => setServiceForm(s => ({ ...s, gst: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="Final Price (₹)">
                                    <input
                                        className="form-control"
                                        value={`₹ ${serviceFinalPrice}`}
                                        readOnly
                                        style={{ background: '#f8fafc', color: 'var(--text-secondary)', cursor: 'default' }}
                                    />
                                </FormField>

                                <FormField label="Session Count">
                                    <input
                                        type="number"
                                        className="form-control"
                                        value={serviceForm.sessions}
                                        min="1"
                                        placeholder="1"
                                        onChange={e => setServiceForm(s => ({ ...s, sessions: e.target.value }))}
                                    />
                                </FormField>

                                <FormField label="Unit (UQC)">
                                    <SearchableDropdown
                                        value={serviceForm.unit}
                                        options={UQC_OPTIONS}
                                        placeholder="Select unit..."
                                        onChange={val => setServiceForm(s => ({ ...s, unit: val }))}
                                    />
                                </FormField>
                            </div>
                        </div>

                        <div style={modalFooterStyle}>
                            <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>
                            <button className="btn btn-primary" onClick={saveService}>Save Service</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
