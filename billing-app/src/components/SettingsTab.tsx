import React, { useState, useEffect } from 'react';
import { Icons } from './Icons';

interface SettingsTabProps {
    showToast: (message: string, type: 'success' | 'error') => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ showToast }) => {
    const [currentPath, setCurrentPath] = useState<string>('Loading...');
    const [isMigrating, setIsMigrating] = useState(false);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            const res = await window.electronAPI.getConfig();
            if (res.success && res.config) {
                setCurrentPath(res.config.currentDataDir || 'Default');
            } else {
                setCurrentPath('Unable to load path');
            }
        } catch (error) {
            setCurrentPath('Error reading configuration');
        }
    };

    const handleBrowseAndMigrate = async () => {
        if (isMigrating) return;
        
        try {
            const folderRes = await window.electronAPI.selectFolder();
            if (folderRes.cancelled) {
                return;
            }
            if (!folderRes.success) {
                showToast('Failed to open folder selector.', 'error');
                return;
            }

            const newPath = folderRes.path;
            
            if (newPath === currentPath) {
                showToast('This folder is already set as the data directory.', 'success');
                return;
            }

            setIsMigrating(true);
            showToast('Migrating data, please wait...', 'success');

            const migrateRes = await window.electronAPI.migrateData(newPath);
            
            if (migrateRes.success) {
                setCurrentPath(newPath);
                showToast('Data migration successful. The app will now use the new folder.', 'success');
            } else {
                showToast(migrateRes.error || 'Data migration failed.', 'error');
            }
        } catch (error) {
            showToast('An unexpected error occurred during migration.', 'error');
        } finally {
            setIsMigrating(false);
        }
    };

    return (
        <div className="tab-pane active" style={{ animation: 'fadeIn 0.4s ease' }}>
            <div className="card" style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
                <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Icons.Settings /> Settings
                </h2>
                
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#fff' }}>Cloud Storage Migration / Data Location</h3>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                        Choose a custom folder (like a Google Drive sync folder) to store your billing data.
                        This will automatically backup your JSON, CSV, and PDF files to the cloud if the folder is synced.
                    </p>
                    
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.5rem' }}>
                            Current Data Folder
                        </label>
                        <div style={{ 
                            padding: '0.75rem 1rem', 
                            background: 'rgba(0,0,0,0.2)', 
                            border: '1px dashed var(--border)', 
                            borderRadius: '8px',
                            color: 'var(--primary)',
                            fontFamily: 'monospace',
                            wordBreak: 'break-all'
                        }}>
                            {currentPath}
                        </div>
                    </div>

                    <button 
                        className="btn-primary" 
                        onClick={handleBrowseAndMigrate}
                        disabled={isMigrating}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                        {isMigrating ? (
                            <>Migrating...</>
                        ) : (
                            <><Icons.Search /> Browse and Migrate</>
                        )}
                    </button>
                    
                    {isMigrating && (
                        <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginTop: '1rem' }}>
                            Please do not close the app while data is migrating...
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
