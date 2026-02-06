import React from 'react';
import { ChatSession } from '../../shared/types';
import { Icons } from '../icons';

interface Props {
    sessions: ChatSession[];
    currentSessionId?: string;
    onSelectSession: (session: ChatSession) => void;
    onNewChat: () => void;
    onClose: () => void;
}

export const HistorySidebar: React.FC<Props> = ({ sessions, currentSessionId, onSelectSession, onNewChat, onClose }) => {
    // Sort sessions by date desc
    const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

    return (
        <div className="animate-fade-in" style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: '250px',
            background: 'var(--surface)', borderRight: '1px solid var(--border-color)',
            zIndex: 20, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)'
        }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>History</h2>
                <button onClick={onClose} className="btn-icon"><Icons.X width={20} height={20} /></button>
            </div>

            <div style={{ padding: '12px' }}>
                <button
                    onClick={onNewChat}
                    className="btn-primary"
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                    <span>+</span> New Chat
                </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px 12px' }}>
                {sortedSessions.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        No history yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {sortedSessions.map(session => (
                            <button
                                key={session.id}
                                onClick={() => onSelectSession(session)}
                                style={{
                                    background: session.id === currentSessionId ? 'var(--surface-secondary)' : 'transparent',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '10px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    color: session.id === currentSessionId ? 'var(--primary)' : 'var(--text-main)',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    transition: 'background 0.2s'
                                }}
                            >
                                {session.title || 'Untitled Chat'}
                                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    {new Date(session.updatedAt).toLocaleDateString()}
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
