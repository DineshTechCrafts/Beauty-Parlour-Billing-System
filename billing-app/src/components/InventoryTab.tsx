
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
        setEditingId(null);
        setEditItem(null);
    };

    const saveEdit = () => {
        if (editItem) {
            const trimmedDesc = (editItem.description || '').trim();
            if (!trimmedDesc || trimmedDesc === 'New Product' || trimmedDesc === 'New Service') {
                alert('Please enter a valid description before saving.');
                return;
            }
            const isIdTaken = inventory.some(i => i.id === editItem.id && i.id !== editingId);
            if (isIdTaken) {
                alert(`Error: The ID "${editItem.id}" is already in use by another item. Please choose a unique ID.`);
                return;
            }
            if (!editItem.id.trim()) {
                alert('Error: Item ID cannot be empty.');
                return;
            }

            const isNew = !inventory.some(i => i.id === editingId);
            let newList;
            if (isNew) {
                newList = [editItem, ...inventory];
            } else {
                newList = inventory.map(i => i.id === editingId ? editItem : i);
            }
            saveInventory(newList);
            setEditingId(null);
            setEditItem(null);
        }
    };

    const addRow = (type: 'Product' | 'Service') => {
        setSearch('');
        setFilterType('All');
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
        const nextNum = maxNum + 1;
        const newId = `${prefix}_M${String(nextNum).padStart(3, '0')}`;
        const newItem: InventoryItem = {
            id: newId,
            type: type,
            category: type === 'Product' ? 'Retail' : 'General',
            description: `New ${type}`,
            price: 0,
            quantity: type === 'Product' ? 0 : undefined,
            source: 'manual'
        };
        setEditingId(newItem.id);
        setEditItem(newItem);
    };

    const deleteRow = (id: string) => {
        if (window.confirm('Are you sure you want to remove this from your catalog?')) {
            saveInventory(inventory.filter(i => i.id !== id));
        }
    };

    const filtered = React.useMemo(() => {
        const baseFiltered = inventory.filter(i => {
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
        });

        return baseFiltered.sort((a, b) => {
            // 1. Keep editing item at the top
            if (a.id === editingId && b.id !== editingId) return -1;
            if (b.id === editingId && a.id !== editingId) return 1;

            if (!search) {
                return (a.description || '').localeCompare(b.description || '');
            }

            const cleanSearch = search.replace(/\s+/g, '').toLowerCase();

            const aId = a.id || '';
            const bId = b.id || '';
            const aDesc = (a.description || '').toLowerCase();
            const bDesc = (b.description || '').toLowerCase();
            const aCat = (a.category || '').toLowerCase();
            const bCat = (b.category || '').toLowerCase();

            // 1. Exact ID match (case-sensitive and space-sensitive)
            if (aId === search && bId !== search) return -1;
            if (bId === search && aId !== search) return 1;

            // 2. Exact description match (case-insensitive and space-insensitive)
            const cleanADesc = aDesc.replace(/\s+/g, '');
            const cleanBDesc = bDesc.replace(/\s+/g, '');
            if (cleanADesc === cleanSearch && cleanBDesc !== cleanSearch) return -1;
            if (cleanBDesc === cleanSearch && cleanADesc !== cleanSearch) return 1;

            // 3. ID starts with search (exact)
            if (aId.startsWith(search) && !bId.startsWith(search)) return -1;
            if (bId.startsWith(search) && !aId.startsWith(search)) return 1;

            // 4. Description starts with search (space/case-insensitive)
            if (cleanADesc.startsWith(cleanSearch) && !cleanBDesc.startsWith(cleanSearch)) return -1;
            if (cleanBDesc.startsWith(cleanSearch) && !cleanADesc.startsWith(cleanSearch)) return 1;

            // 5. Category starts with search (space/case-insensitive)
            const cleanACat = aCat.replace(/\s+/g, '');
            const cleanBCat = bCat.replace(/\s+/g, '');
            if (cleanACat.startsWith(cleanSearch) && !cleanBCat.startsWith(cleanSearch)) return -1;
            if (cleanBCat.startsWith(cleanSearch) && !cleanACat.startsWith(cleanSearch)) return 1;

            return aDesc.localeCompare(bDesc);
        });
    }, [inventory, filterType, search, editingId]);

    const displayItems = React.useMemo(() => {
        if (editingId && editItem && !inventory.some(i => i.id === editingId)) {
            const matchesType = filterType === 'All' || editItem.type === filterType;
            if (matchesType) {
                return [editItem, ...filtered];
            }
        }
        return filtered;
    }, [filtered, editingId, editItem, inventory, filterType]);

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
                        {displayItems.map((item) => {
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
                        {displayItems.length === 0 && (
                            <tr><td colSpan={6} style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>Inventory is empty.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
