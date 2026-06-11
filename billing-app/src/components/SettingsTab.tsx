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
                setCurrentPath(res.config.autoSyncDir || 'Not Set');
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
                showToast('This folder is already set as the backup directory.', 'success');
                return;
            }

            setIsMigrating(true);
            showToast('Setting backup folder, please wait...', 'success');

            const migrateRes = await window.electronAPI.setAutoSyncDir(newPath);
            
            if (migrateRes.success) {
                setCurrentPath(newPath);
                showToast('Backup folder set successfully. Data will be copied here automatically.', 'success');
            } else {
                showToast(migrateRes.error || 'Failed to set backup folder.', 'error');
            }
        } catch (error) {
            showToast('An unexpected error occurred.', 'error');
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
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#fff' }}>Auto-Sync Backup Folder</h3>
                    <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                        Choose a custom folder (like a Google Drive sync folder) to automatically backup your billing data.
                        Your local data remains untouched, and a copy is synced here.
                    </p>
                    
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.5rem' }}>
                            Current Backup Folder
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
                            <>Setting...</>
                        ) : (
                            <><Icons.Search /> Browse and Set Folder</>
                        )}
                    </button>
                    
                    {isMigrating && (
                        <p style={{ color: 'var(--secondary)', fontSize: '0.85rem', marginTop: '1rem' }}>
                            Please wait...
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
