
import React, { useState } from 'react';
import { InventoryItem } from '../types';
import { Icons } from './Icons';

interface InventoryTabProps {
    inventory: InventoryItem[];
    saveInventory: (newInventory: InventoryItem[]) => void;
}

export const InventoryTab: React.FC<InventoryTabProps> = ({ inventory, saveInventory }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editItem, setEditItem] = useState<InventoryItem | null>(null);
    const [filterType, setFilterType] = useState<'All' | 'Product' | 'Service'>('All');
    const [search, setSearch] = useState('');

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
                const newList = inventory.map(i => i.id === editingId ? editItem : i);
                saveInventory(newList);
            }
            setEditingId(null);
            setEditItem(null);
        }
    };

    const addRow = (type: 'Product' | 'Service') => {
        setSearch('');
        setFilterType('All');
        const newItem: InventoryItem = {
            id: Date.now().toString(),
            type: type,
            category: type === 'Product' ? 'Retail' : 'General',
            description: `New ${type}`,
            price: 0,
            quantity: type === 'Product' ? 0 : undefined,
            source: 'manual'
        };
        saveInventory([newItem, ...inventory]);
        startEdit(newItem);
    };

    const deleteRow = (id: string) => {
        if (window.confirm('Are you sure you want to remove this from your catalog?')) {
            saveInventory(inventory.filter(i => i.id !== id));
        }
    };

    const filtered = inventory.filter(i => {
        const matchesType = filterType === 'All' || i.type === filterType;
        
        const matchesSearch = (() => {
            if (!search) return true;
            
            // 1. ID check (exact substring match, preserving case and spaces)
            if ((i.id || '').includes(search)) return true;
            
            // 2. Name & Category check (ignoring case and spaces entirely)
            const cleanSearch = search.replace(/\s+/g, '').toLowerCase();
            const cleanDesc = (i.description || '').replace(/\s+/g, '').toLowerCase();
            const cleanCat = (i.category || '').replace(/\s+/g, '').toLowerCase();
            
            return cleanDesc.includes(cleanSearch) || cleanCat.includes(cleanSearch);
        })();

        return matchesType && matchesSearch;
    }).sort((a, b) => {
        if (a.id === editingId) return -1;
        if (b.id === editingId) return 1;
        return (a.description || '').localeCompare(b.description || '');
    });

    return (
        <div className="catalog-mgmt-flow">
            <div className="card no-print" style={{ marginBottom: '2rem', paddingBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div>
                        <h2 className="section-title" style={{ margin: 0 }}><Icons.Package /> Catalog Definitions</h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.4rem' }}>Formalize your pricing and track product stock.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => addRow('Service')}><Icons.Plus /> Add Service</button>
                        <button className="btn btn-primary btn-sm" onClick={() => addRow('Product')}><Icons.Plus /> Add Product</button>
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
                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
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
                                            </div>
                                        </td>
                                        <td>
                                            <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{item.id}</span>
                                        </td>
                                        <td>
                                            <input
                                                className="form-control"
                                                value={editItem?.description}
                                                disabled={!isManualEditing}
                                                onChange={e => setEditItem(prev => prev ? { ...prev, description: e.target.value } : null)}
                                                style={{ marginBottom: '8px' }}
                                            />
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
                                        <td><span style={{ fontWeight: 600 }}>{item.description}</span></td>
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
        </div>
    );
};
