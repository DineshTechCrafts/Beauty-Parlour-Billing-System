
import React, { useState, useMemo } from 'react';
import { InventoryItem } from '../types';

interface CatalogTabProps {
    inventory: InventoryItem[];
}

// Category color mapping
const CATEGORY_META: Record<string, { color: string; bg: string }> = {
    'Threading':      { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)' },
    'Hair Treatment': { color: '#0891b2', bg: 'rgba(8,145,178,0.1)'  },
    'Hair Color':     { color: '#db2777', bg: 'rgba(219,39,119,0.1)' },
    'Hair Cut':       { color: '#059669', bg: 'rgba(5,150,105,0.1)'  },
    'Hair Styling':   { color: '#d97706', bg: 'rgba(217,119,6,0.1)'  },
    'Facials':        { color: '#e11d48', bg: 'rgba(225,29,72,0.1)'  },
    'Waxing':         { color: '#7c2d12', bg: 'rgba(124,45,18,0.1)'  },
    'Manicure':       { color: '#be185d', bg: 'rgba(190,24,93,0.1)'  },
    'Pedicure':       { color: '#0f766e', bg: 'rgba(15,118,110,0.1)' },
    'Nail Art':       { color: '#6d28d9', bg: 'rgba(109,40,217,0.1)' },
    'Mehandi':        { color: '#15803d', bg: 'rgba(21,128,61,0.1)'  },
    'Makeup':         { color: '#c026d3', bg: 'rgba(192,38,211,0.1)' },
    'Aesthetic':      { color: '#1d4ed8', bg: 'rgba(29,78,216,0.1)'  },
    'Slimming':       { color: '#b45309', bg: 'rgba(180,83,9,0.1)'   },
};

const DEFAULT_META = { color: '#2563eb', bg: 'rgba(37,99,235,0.1)' };

type SortOption = 'default' | 'low-to-high' | 'high-to-low';

const PRICE_RANGES = [
    { label: 'All Prices', min: 0, max: Infinity },
    { label: 'Under ₹500',  min: 0,    max: 499   },
    { label: '₹500 – ₹1,000', min: 500, max: 1000 },
    { label: '₹1,000 – ₹5,000', min: 1001, max: 5000 },
    { label: 'Above ₹5,000', min: 5001, max: Infinity },
];

export const CatalogTab: React.FC<CatalogTabProps> = ({ inventory }) => {
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [priceRangeIdx, setPriceRangeIdx]       = useState<number>(0);
    const [sortOrder, setSortOrder]                = useState<SortOption>('default');
    const [search, setSearch]                      = useState('');

    // All service items only
    const allServices = useMemo(() =>
        inventory.filter(i => i.type === 'Service'),
        [inventory]
    );

    // Derive unique categories dynamically from actual data
    const categories = useMemo(() => {
        const cats = Array.from(new Set(allServices.map(i => i.category || 'General'))).sort();
        return ['All', ...cats];
    }, [allServices]);

    // Apply filters + sorting
    const filtered = useMemo(() => {
        const range = PRICE_RANGES[priceRangeIdx];
        let result = allServices.filter(item => {
            const cat = item.category || 'General';
            const price = Number(item.price);
            const desc = (item.description || '').toLowerCase();
            const matchCat   = selectedCategory === 'All' || cat === selectedCategory;
            const matchPrice = price >= range.min && price <= range.max;
            const matchSearch = search.trim() === '' || desc.includes(search.toLowerCase());
            return matchCat && matchPrice && matchSearch;
        });

        if (sortOrder === 'low-to-high')  result = [...result].sort((a, b) => a.price - b.price);
        if (sortOrder === 'high-to-low') result = [...result].sort((a, b) => b.price - a.price);
        if (sortOrder === 'default')      result = [...result].sort((a, b) => (a.description || '').localeCompare(b.description || ''));

        return result;
    }, [allServices, selectedCategory, priceRangeIdx, sortOrder, search]);

    const totalShown = filtered.length;
    const totalAll   = allServices.length;

    return (
        <div className="ctab-wrapper no-print">

            {/* ── Filter Bar ── */}
            <div className="ctab-filter-bar">

                {/* Search */}
                <div className="ctab-search-box">
                    <span className="ctab-search-icon">&#128269;</span>
                    <input
                        id="ctab-search"
                        className="ctab-search-input"
                        type="text"
                        placeholder="Search services..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="ctab-search-clear" onClick={() => setSearch('')}>&#x2715;</button>
                    )}
                </div>

                {/* Price Range */}
                <div className="ctab-select-wrap">
                    <select
                        id="ctab-price-range"
                        className="ctab-select ctab-select--no-icon"
                        value={priceRangeIdx}
                        onChange={e => setPriceRangeIdx(Number(e.target.value))}
                    >
                        {PRICE_RANGES.map((r, i) => (
                            <option key={i} value={i}>{r.label}</option>
                        ))}
                    </select>
                </div>

                {/* Sort */}
                <div className="ctab-select-wrap">
                    <select
                        id="ctab-sort"
                        className="ctab-select ctab-select--no-icon"
                        value={sortOrder}
                        onChange={e => setSortOrder(e.target.value as SortOption)}
                    >
                        <option value="default">Sort: A to Z</option>
                        <option value="low-to-high">Price: Low to High</option>
                        <option value="high-to-low">Price: High to Low</option>
                    </select>
                </div>
            </div>

            {/* ── Category Chips ── */}
            <div className="ctab-category-scroll">
                {categories.map(cat => {
                    const meta = CATEGORY_META[cat] ?? DEFAULT_META;
                    const isActive = selectedCategory === cat;
                    return (
                        <button
                            key={cat}
                            id={`ctab-cat-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                            className={`ctab-chip ${isActive ? 'ctab-chip--active' : ''}`}
                            style={isActive ? { background: meta.color, color: '#fff', borderColor: meta.color } : {}}
                            onClick={() => setSelectedCategory(cat)}
                        >
                            {cat === 'All' ? 'All Services' : cat}
                        </button>
                    );
                })}
            </div>

            {/* ── Results count ── */}
            <div className="ctab-results-bar">
                <span className="ctab-results-count">
                    Showing <strong>{totalShown}</strong> of <strong>{totalAll}</strong> services
                    {selectedCategory !== 'All' && <> in <strong>{selectedCategory}</strong></>}
                </span>
                {(selectedCategory !== 'All' || priceRangeIdx !== 0 || search) && (
                    <button
                        className="ctab-clear-btn"
                        onClick={() => { setSelectedCategory('All'); setPriceRangeIdx(0); setSearch(''); setSortOrder('default'); }}
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            {/* ── Service Cards Grid ── */}
            {filtered.length > 0 ? (
                <div className="ctab-grid">
                    {filtered.map(item => {
                        const cat  = item.category || 'General';
                        const meta = CATEGORY_META[cat] ?? DEFAULT_META;
                        return (
                            <div key={item.id} className="ctab-card" style={{ '--card-accent': meta.color } as React.CSSProperties}>
                                <div className="ctab-card-top" style={{ background: meta.bg }}>
                                    <span className="ctab-card-cat" style={{ color: meta.color }}>{cat}</span>
                                </div>
                                <div className="ctab-card-body">
                                    <h3 className="ctab-card-title">{item.description}</h3>
                                    <div className="ctab-card-footer">
                                        <span className="ctab-card-price">₹{Number(item.price).toLocaleString('en-IN')}</span>
                                        <span className="ctab-card-id">ID: {item.id}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="ctab-empty">
                    <div className="ctab-empty-icon">🔍</div>
                    <h3>No services found</h3>
                    <p>Try adjusting your filters or search term.</p>
                    <button
                        className="btn btn-primary"
                        onClick={() => { setSelectedCategory('All'); setPriceRangeIdx(0); setSearch(''); setSortOrder('default'); }}
                    >
                        Reset Filters
                    </button>
                </div>
            )}
        </div>
    );
};
