
import React from 'react';
import { Icons } from './Icons';

interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
    const menuItems = [
        { id: 'billing', label: 'Produce Billing', icon: <Icons.FileText /> },
        { id: 'catalog', label: 'Services Menu', icon: <Icons.Tag /> },
        { id: 'products', label: 'Products Menu', icon: <Icons.ShoppingBag /> },
        { id: 'inventory', label: 'Catalog Records', icon: <Icons.Package /> },
        { id: 'history', label: 'Receipt Archive', icon: <Icons.History /> },
        { id: 'customers', label: 'Customers', icon: <Icons.Users /> },
        { id: 'ledger', label: 'Credit Ledger', icon: <Icons.Ledger /> },
        { id: 'taxreport', label: 'Tax Report', icon: <Icons.BarChart /> },
        { id: 'settings', label: 'Settings', icon: <Icons.Settings /> },
    ];

    return (
        <div className="sidebar no-print">
            <div className="logo-container" style={{ padding: '0 0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                    <div style={{ width: '32px', height: '32px', background: 'var(--primary)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '1.2rem', fontWeight: 800 }}>A</div>
                    <div className="logo-text">Premium</div>
                </div>
                <div className="logo-subtext">BEAUTY & CLINIC</div>
            </div>

            <div className="nav-menu">
                {menuItems.map((item) => (
                    <div
                        key={item.id}
                        className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(item.id)}
                    >
                        {item.icon}
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {activeTab === item.id && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#fff' }}></div>}
                    </div>
                ))}
            </div>

            <div style={{ marginTop: 'auto', padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                AESTHETIC CLINIC V2.0
            </div>
        </div>
    );
};
