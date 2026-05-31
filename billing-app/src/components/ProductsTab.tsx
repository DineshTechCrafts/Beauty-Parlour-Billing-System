
import React, { useState, useMemo } from 'react';
import { InventoryItem } from '../types';

interface ProductsTabProps {
    inventory: InventoryItem[];
}

// ── Inline SVG icons (no emojis) ────────────────────────────────────────────
const IconBox = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
);

const IconCheckCircle = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
);

const IconAlertTriangle = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
);

const IconXCircle = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
    </svg>
);

const IconTag = () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
);

const IconSearch = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.3-4.3"/>
    </svg>
);

const IconEmptyBox = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#cbd5e1' }}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
        <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
);

// ── Category colour map ──────────────────────────────────────────────────────
const PRODUCT_CATEGORY_META: Record<string, { color: string; bg: string }> = {
    'Hair Care':   { color: '#0891b2', bg: 'rgba(8,145,178,0.1)'   },
    'Skin Care':   { color: '#db2777', bg: 'rgba(219,39,119,0.1)'  },
    'Color':       { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)'  },
    'Nail':        { color: '#6d28d9', bg: 'rgba(109,40,217,0.1)'  },
    'Makeup':      { color: '#c026d3', bg: 'rgba(192,38,211,0.1)'  },
    'Wax':         { color: '#7c2d12', bg: 'rgba(124,45,18,0.1)'   },
    'Accessories': { color: '#059669', bg: 'rgba(5,150,105,0.1)'   },
    'Tools':       { color: '#d97706', bg: 'rgba(217,119,6,0.1)'   },
    'Supplement':  { color: '#15803d', bg: 'rgba(21,128,61,0.1)'   },
    'Aesthetic':   { color: '#1d4ed8', bg: 'rgba(29,78,216,0.1)'   },
    'General':     { color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
};

const DEFAULT_META = { color: '#2563eb', bg: 'rgba(37,99,235,0.1)' };

type SortOption = 'default' | 'low-to-high' | 'high-to-low' | 'stock-low' | 'stock-high';

const PRICE_RANGES = [
    { label: 'All Prices',       min: 0,    max: Infinity },
    { label: 'Under ₹500',       min: 0,    max: 499      },
    { label: '₹500 – ₹1,000',   min: 500,  max: 1000     },
    { label: '₹1,000 – ₹5,000', min: 1001, max: 5000     },
    { label: 'Above ₹5,000',     min: 5001, max: Infinity },
];

const STOCK_FILTERS = [
    { label: 'All Stock',    filter: 'all' },
    { label: 'In Stock',     filter: 'in'  },
    { label: 'Low Stock',    filter: 'low' },
    { label: 'Out of Stock', filter: 'out' },
];

function getStockStatus(qty?: number): { label: string; className: string } {
    if (qty === undefined || qty === null) return { label: 'N/A',          className: 'ptab-stock-na'  };
    if (qty <= 0)                          return { label: 'Out of Stock',  className: 'ptab-stock-out' };
    if (qty <= 5)                          return { label: 'Low Stock',     className: 'ptab-stock-low' };
    return                                        { label: 'In Stock',      className: 'ptab-stock-in'  };
}

export const ProductsTab: React.FC<ProductsTabProps> = ({ inventory }) => {
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [priceRangeIdx, setPriceRangeIdx]       = useState<number>(0);
    const [sortOrder, setSortOrder]                = useState<SortOption>('default');
    const [search, setSearch]                      = useState('');
    const [stockFilter, setStockFilter]            = useState('all');

    // All product items only
    const allProducts = useMemo(() =>
        inventory.filter(i => i.type === 'Product'),
        [inventory]
    );

    // Derive unique categories dynamically from actual data
    const categories = useMemo(() => {
        const cats = Array.from(new Set(allProducts.map(i => i.category || 'General'))).sort();
        return ['All', ...cats];
    }, [allProducts]);

    // Stats
    const totalProducts   = allProducts.length;
    const inStockCount    = allProducts.filter(i => (i.quantity ?? -1) > 5).length;
    const lowStockCount   = allProducts.filter(i => { const q = i.quantity ?? -1; return q > 0 && q <= 5; }).length;
    const outOfStockCount = allProducts.filter(i => i.quantity !== undefined && i.quantity <= 0).length;

    // Apply filters + sorting
    const filtered = useMemo(() => {
        const range = PRICE_RANGES[priceRangeIdx];
        let result = allProducts.filter(item => {
            const cat   = item.category || 'General';
            const price = Number(item.price);
            const qty   = item.quantity;

            const matchCat   = selectedCategory === 'All' || cat === selectedCategory;
            const matchPrice = price >= range.min && price <= range.max;

            const matchStock = (() => {
                if (stockFilter === 'all') return true;
                if (stockFilter === 'in')  return qty !== undefined && qty > 5;
                if (stockFilter === 'low') return qty !== undefined && qty > 0 && qty <= 5;
                if (stockFilter === 'out') return qty !== undefined && qty <= 0;
                return true;
            })();

            const matchSearch = (() => {
                if (!search) return true;
                if ((item.id || '').includes(search)) return true;
                const cleanSearch = search.replace(/\s+/g, '').toLowerCase();
                const cleanDesc   = (item.description || '').replace(/\s+/g, '').toLowerCase();
                const cleanCat    = (item.category || '').replace(/\s+/g, '').toLowerCase();
                const cleanBrand  = (item.brand || '').replace(/\s+/g, '').toLowerCase();
                return cleanDesc.includes(cleanSearch) || cleanCat.includes(cleanSearch) || cleanBrand.includes(cleanSearch);
            })();

            return matchCat && matchPrice && matchStock && matchSearch;
        });

        if (sortOrder === 'low-to-high')  result = [...result].sort((a, b) => a.price - b.price);
        if (sortOrder === 'high-to-low')  result = [...result].sort((a, b) => b.price - a.price);
        if (sortOrder === 'stock-low')    result = [...result].sort((a, b) => (a.quantity ?? 9999) - (b.quantity ?? 9999));
        if (sortOrder === 'stock-high')   result = [...result].sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0));
        if (sortOrder === 'default')      result = [...result].sort((a, b) => (a.description || '').localeCompare(b.description || ''));

        return result;
    }, [allProducts, selectedCategory, priceRangeIdx, sortOrder, search, stockFilter]);

    const clearAll = () => {
        setSelectedCategory('All');
        setPriceRangeIdx(0);
        setSearch('');
        setSortOrder('default');
        setStockFilter('all');
    };

    const hasActiveFilters = selectedCategory !== 'All' || priceRangeIdx !== 0 || !!search || stockFilter !== 'all';

    return (
        <div className="ptab-wrapper no-print">

            {/* ── Stock Summary Cards ── */}
            <div className="ptab-stats-row">
                <div className="ptab-stat-card ptab-stat-total">
                    <div className="ptab-stat-icon"><IconBox /></div>
                    <div className="ptab-stat-info">
                        <span className="ptab-stat-value">{totalProducts}</span>
                        <span className="ptab-stat-label">Total Products</span>
                    </div>
                </div>
                <div className="ptab-stat-card ptab-stat-in">
                    <div className="ptab-stat-icon"><IconCheckCircle /></div>
                    <div className="ptab-stat-info">
                        <span className="ptab-stat-value">{inStockCount}</span>
                        <span className="ptab-stat-label">In Stock</span>
                    </div>
                </div>
                <div className="ptab-stat-card ptab-stat-low">
                    <div className="ptab-stat-icon"><IconAlertTriangle /></div>
                    <div className="ptab-stat-info">
                        <span className="ptab-stat-value">{lowStockCount}</span>
                        <span className="ptab-stat-label">Low Stock</span>
                    </div>
                </div>
                <div className="ptab-stat-card ptab-stat-out">
                    <div className="ptab-stat-icon"><IconXCircle /></div>
                    <div className="ptab-stat-info">
                        <span className="ptab-stat-value">{outOfStockCount}</span>
                        <span className="ptab-stat-label">Out of Stock</span>
                    </div>
                </div>
            </div>

            {/* ── Filter Bar ── */}
            <div className="ptab-filter-bar">

                {/* Search */}
                <div className="ptab-search-box">
                    <span className="ptab-search-icon"><IconSearch /></span>
                    <input
                        id="ptab-search"
                        className="ptab-search-input"
                        type="text"
                        placeholder="Search products, brands..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button className="ptab-search-clear" onClick={() => setSearch('')}>&#x2715;</button>
                    )}
                </div>

                {/* Stock Filter */}
                <div className="ptab-select-wrap">
                    <select
                        id="ptab-stock-filter"
                        className="ptab-select ptab-select--no-icon"
                        value={stockFilter}
                        onChange={e => setStockFilter(e.target.value)}
                    >
                        {STOCK_FILTERS.map(sf => (
                            <option key={sf.filter} value={sf.filter}>{sf.label}</option>
                        ))}
                    </select>
                </div>

                {/* Price Range */}
                <div className="ptab-select-wrap">
                    <select
                        id="ptab-price-range"
                        className="ptab-select ptab-select--no-icon"
                        value={priceRangeIdx}
                        onChange={e => setPriceRangeIdx(Number(e.target.value))}
                    >
                        {PRICE_RANGES.map((r, i) => (
                            <option key={i} value={i}>{r.label}</option>
                        ))}
                    </select>
                </div>

                {/* Sort */}
                <div className="ptab-select-wrap">
                    <select
                        id="ptab-sort"
                        className="ptab-select ptab-select--no-icon"
                        value={sortOrder}
                        onChange={e => setSortOrder(e.target.value as SortOption)}
                    >
                        <option value="default">Sort: A to Z</option>
                        <option value="low-to-high">Price: Low to High</option>
                        <option value="high-to-low">Price: High to Low</option>
                        <option value="stock-low">Stock: Low to High</option>
                        <option value="stock-high">Stock: High to Low</option>
                    </select>
                </div>
            </div>

            {/* ── Category Chips ── */}
            <div className="ptab-category-scroll">
                {categories.map(cat => {
                    const meta     = PRODUCT_CATEGORY_META[cat] ?? DEFAULT_META;
                    const isActive = selectedCategory === cat;
                    return (
                        <button
                            key={cat}
                            id={`ptab-cat-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                            className={`ptab-chip ${isActive ? 'ptab-chip--active' : ''}`}
                            style={isActive ? { background: meta.color, color: '#fff', borderColor: meta.color } : {}}
                            onClick={() => setSelectedCategory(cat)}
                        >
                            {cat === 'All' ? 'All Products' : cat}
                        </button>
                    );
                })}
            </div>

            {/* ── Results count ── */}
            <div className="ptab-results-bar">
                <span className="ptab-results-count">
                    Showing <strong>{filtered.length}</strong> of <strong>{totalProducts}</strong> products
                    {selectedCategory !== 'All' && <> in <strong>{selectedCategory}</strong></>}
                </span>
                {hasActiveFilters && (
                    <button className="ptab-clear-btn" onClick={clearAll}>
                        Clear Filters
                    </button>
                )}
            </div>

            {/* ── Product Cards Grid ── */}
            {filtered.length > 0 ? (
                <div className="ptab-grid">
                    {filtered.map(item => {
                        const cat   = item.category || 'General';
                        const meta  = PRODUCT_CATEGORY_META[cat] ?? DEFAULT_META;
                        const stock = getStockStatus(item.quantity);
                        const qty   = item.quantity;
                        return (
                            <div
                                key={item.id}
                                className="ptab-card"
                                style={{ '--card-accent': meta.color } as React.CSSProperties}
                            >
                                {/* Top accent */}
                                <div className="ptab-card-top" style={{ background: meta.bg }}>
                                    <span className="ptab-card-cat" style={{ color: meta.color }}>{cat}</span>
                                </div>

                                {/* Body */}
                                <div className="ptab-card-body">
                                    <h3 className="ptab-card-title">{item.description}</h3>
                                    <div className="ptab-card-brand-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        {item.brand ? (
                                            <span className="ptab-card-brand">
                                                <IconTag /> {item.brand}
                                            </span>
                                        ) : (
                                            <span className="ptab-card-brand"></span>
                                        )}
                                        <span className="ptab-stock-qty" style={{ minWidth: 'auto', textAlign: 'right' }}>
                                            {qty !== undefined ? qty : '—'} units
                                        </span>
                                    </div>

                                    {/* Footer */}
                                    <div className="ptab-card-footer">
                                        <span className="ptab-card-price">&#8377;{Number(item.price).toLocaleString('en-IN')}</span>
                                        <span className="ptab-card-id">ID: {item.id}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="ptab-empty">
                    <div className="ptab-empty-icon"><IconEmptyBox /></div>
                    <h3>No products found</h3>
                    <p>Try adjusting your filters or search term.</p>
                    <button className="btn btn-primary" onClick={clearAll}>
                        Reset Filters
                    </button>
                </div>
            )}
        </div>
    );
};
