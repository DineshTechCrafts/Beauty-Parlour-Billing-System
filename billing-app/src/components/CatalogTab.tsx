
import React from 'react';
import { InventoryItem } from '../types';

interface CatalogTabProps {
    inventory: InventoryItem[];
}

export const CatalogTab: React.FC<CatalogTabProps> = ({ inventory }) => {
    const services = inventory.filter(i => i.type === 'Service').sort((a, b) => (a.description || '').localeCompare(b.description || ''));

    return (
        <div className="catalog-grid no-print">
            {services.map((item) => (
                <div key={item.id} className="card catalog-card">
                    <div className="catalog-header">
                        <span className="badge badge-service">{item.category}</span>
                        <span className="catalog-price">₹{Number(item.price).toLocaleString()}</span>
                    </div>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{item.description}</h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ID: {item.id}</p>
                </div>
            ))}

            {services.length === 0 && (
                <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No services found in the catalog.</p>
                </div>
            )}
        </div>
    );
};
