
import React, { useState, useMemo } from 'react';
import { InventoryItem } from '../types';

interface ProductsTabProps {
    inventory: InventoryItem[];
}

// Product category colour mapping — same palette style as CatalogTab
const PRODUCT_CATEGORY_META: Record<string, { color: string; bg: string }> = {
    'Hair Care':      { color: '#0891b2', bg: 'rgba(8,145,178,0.1)'   },
    'Skin Care':      { color: '#db2777', bg: 'rgba(219,39,119,0.1)'  },
    'Nail Care':      { color: '#6d28d9', bg: 'rgba(109,40,217,0.1)'  },
    'Makeup':         { color: '#c026d3', bg: 'rgba(192,38,211,0.1)'  },
    'Body Care':      { color: '#059669', bg: 'rgba(5,150,105,0.1)'   },
    'Fragrance':      { color: '#d97706', bg: 'rgba(217,119,6,0.1)'   },
    'Tools':          { color: '#475569', bg: 'rgba(71,85,105,0.1)'   },
    'Supplements':    { color: '#15803d', bg: 'rgba(21,128,61,0.1)'   },
    'Aesthetic':      { color: '#1d4ed8', bg: 'rgba(29,78,216,0.1)'   },
    'Slimming':       { color: '#b45309', bg: 'rgba(180,83,9,0.1)'    },
    'Threading':      { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'  },
};

const DEFAULT_META = { color: '#2563eb', bg: 'rgba(37,99,235,0.1)' };

type SortOption = 'default' | 'low-to-high' | 'high-to-low';

const PRICE_RANGES = [
    { label: 'All Prices',        min: 0,    max: Infinity },
    { label: 'Under ₹500',        min: 0,    max: 499      },
    { label: '₹500 – ₹1,000',    min: 500,  max: 1000     },
    { label: '₹1,000 – ₹5,000',  min: 1001, max: 5000     },
    { label: 'Above ₹5,000',      min: 5001, max: Infinity },
];

export const ProductsTab: React.FC<ProductsTabProps> = ({ inventory }) => {
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [priceRangeIdx, setPriceRangeIdx]       = useState<number>(0);
    const [sortOrder, setSortOrder]                = useState<SortOption>('default');
    const [search, setSearch]                      = useState('');

    // Only product items
    const allProducts = useMemo(() =>
        inventory.filter(i => i.type === 'Product'),
        [inventory]
    );

    // Derive unique categories dynamically from actual data
    const categories = useMemo(() => {
        const cats = Array.from(new Set(allProducts.map(i => i.category || 'General'))).sort();
        return ['All', ...cats];
    }, [allProducts]);

    // Apply filters + sorting
    const filtered = useMemo(() => {
        const range = PRICE_RANGES[priceRangeIdx];
        let result = allProducts.filter(item => {
            const cat   = item.category || 'General';
            const price = Number(item.price);
            const matchCat   = selectedCategory === 'All' || cat === selectedCategory;
            const matchPrice = price >= range.min && price <= range.max;

            const matchSearch = (() => {
                if (!search) return true;
                if ((item.id || '').includes(search)) return true;
                const cleanSearch = search.replace(/\s+/g, '').toLowerCase();
                const cleanDesc   = (item.description || '').replace(/\s+/g, '').toLowerCase();
                const cleanCat    = (item.category || '').replace(/\s+/g, '').toLowerCase();
                const cleanBrand  = (item.brand || '').replace(/\s+/g, '').toLowerCase();
                return cleanDesc.includes(cleanSearch) || cleanCat.includes(cleanSearch) || cleanBrand.includes(cleanSearch);
            })();

            return matchCat && matchPrice && matchSearch;
        });

        if (sortOrder === 'low-to-high') result = [...result].sort((a, b) => a.price - b.price);
        if (sortOrder === 'high-to-low') result = [...result].sort((a, b) => b.price - a.price);
        if (sortOrder === 'default')     result = [...result].sort((a, b) => (a.description || '').localeCompare(b.description || ''));

        return result;
    }, [allProducts, selectedCategory, priceRangeIdx, sortOrder, search]);

    const totalShown = filtered.length;
    const totalAll   = allProducts.length;

    const resetFilters = () => {
        setSelectedCategory('All');
        setPriceRangeIdx(0);
        setSearch('');
        setSortOrder('default');
    };

    return (
        <div className="ctab-wrapper no-print">

            {/* ── Filter Bar ── */}
            <div className="ctab-filter-bar">

                {/* Search */}
                <div className="ctab-search-box">
                    <span className="ctab-search-icon">&#128269;</span>
                    <input
                        id="ptab-search"
                        className="ctab-search-input"
                        type="text"
                        placeholder="Search products, brands..."
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
                        id="ptab-price-range"
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
                        id="ptab-sort"
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
                    const meta     = PRODUCT_CATEGORY_META[cat] ?? DEFAULT_META;
                    const isActive = selectedCategory === cat;
                    return (
                        <button
                            key={cat}
                            id={`ptab-cat-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                            className={`ctab-chip ${isActive ? 'ctab-chip--active' : ''}`}
                            style={isActive ? { background: meta.color, color: '#fff', borderColor: meta.color } : {}}
                            onClick={() => setSelectedCategory(cat)}
                        >
                            {cat === 'All' ? 'All Products' : cat}
                        </button>
                    );
                })}
            </div>

            {/* ── Results count ── */}
            <div className="ctab-results-bar">
                <span className="ctab-results-count">
                    Showing <strong>{totalShown}</strong> of <strong>{totalAll}</strong> products
                    {selectedCategory !== 'All' && <> in <strong>{selectedCategory}</strong></>}
                </span>
                {(selectedCategory !== 'All' || priceRangeIdx !== 0 || search) && (
                    <button className="ctab-clear-btn" onClick={resetFilters}>
                        Clear Filters
                    </button>
                )}
            </div>

            {/* ── Product Cards Grid ── */}
            {filtered.length > 0 ? (
                <div className="ctab-grid">
                    {filtered.map(item => {
                        const cat  = item.category || 'General';
                        const meta = PRODUCT_CATEGORY_META[cat] ?? DEFAULT_META;
                        return (
                            <div key={item.id} className="ctab-card" style={{ '--card-accent': meta.color } as React.CSSProperties}>
                                <div className="ctab-card-top" style={{ background: meta.bg }}>
                                    <span className="ctab-card-cat" style={{ color: meta.color }}>{cat}</span>
                                    {item.brand && (
                                        <span className="ptab-card-brand" style={{ color: meta.color }}>{item.brand}</span>
                                    )}
                                </div>
                                <div className="ctab-card-body">
                                    <h3 className="ctab-card-title">{item.description}</h3>

                                    {/* Extra product metadata row */}
                                    <div className="ptab-card-meta">
                                        {item.unit && (
                                            <span className="ptab-meta-pill">{item.unit}</span>
                                        )}
                                        {item.mrp != null && item.mrp > 0 && item.mrp !== item.price && (
                                            <span className="ptab-meta-mrp">MRP ₹{Number(item.mrp).toLocaleString('en-IN')}</span>
                                        )}
                                        {typeof item.quantity === 'number' && (
                                            <span className="ptab-meta-stock-row">
                                                <span
                                                    className="ptab-meta-stock"
                                                    style={{ color: item.quantity <= 5 ? '#dc2626' : '#15803d' }}
                                                >
                                                    {item.quantity <= 5 ? 'Low Stock' : 'In Stock'}
                                                </span>
                                                <span
                                                    className="ptab-meta-stock-count"
                                                    style={{ color: item.quantity <= 5 ? '#dc2626' : '#15803d' }}
                                                >
                                                    {item.quantity} units
                                                </span>
                                            </span>
                                        )}
                                    </div>

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
                    <div className="ptab-empty-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#cbd5e1' }}>
                            <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <path d="M16 10a4 4 0 0 1-8 0"/>
                        </svg>
                    </div>
                    <h3>No products found</h3>
                    <p>Try adjusting your filters or search term.</p>
                    <button className="btn btn-primary" onClick={resetFilters}>
                        Reset Filters
                    </button>
                </div>
            )}
        </div>
    );
};
