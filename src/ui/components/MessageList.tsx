import React, { useEffect, useRef, useState } from 'react';
import { ChatMessage } from '../../shared/types';
import { Icons } from '../icons';
import { MarkdownRenderer } from './MarkdownRenderer';

interface Props {
    messages: ChatMessage[];
    isLoading?: boolean;
    onRegenerate?: () => void;
    onEditLastMessage?: (newContent: string) => void;
}

interface ContextMenu {
    x: number;
    y: number;
    messageId: string;
    type: 'ai' | 'user';
    content: string;
}

// Collapsible thinking block component
const ThinkingBlock: React.FC<{ thinking: string }> = ({ thinking }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div style={{
            marginBottom: '12px',
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            overflow: 'hidden',
        }}>
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '10px 12px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '12px',
                    color: 'var(--primary)',
                    textAlign: 'left',
                }}
            >
                <span style={{
                    transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                    display: 'inline-block',
                }}>▶</span>
                🧠 Thinking
                <span style={{ fontWeight: 400, opacity: 0.7, marginLeft: 'auto' }}>
                    {thinking.length > 500 ? `${Math.round(thinking.length / 100) * 100}+ chars` : ''}
                </span>
            </button>
            {isExpanded && (
                <div style={{
                    padding: '0 12px 12px 12px',
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '10px',
                    lineHeight: '1.5',
                }}>
                    {thinking}
                </div>
            )}
        </div>
    );
};

export const MessageList: React.FC<Props> = ({ messages, isLoading, onRegenerate, onEditLastMessage }) => {
    const bottomRef = useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editText, setEditText] = useState('');

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, msg: ChatMessage, type: 'ai' | 'user') => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, messageId: msg.id, type, content: msg.content });
    };

    const handleCopy = async (text: string) => {
        await navigator.clipboard.writeText(text);
        setContextMenu(null);
    };

    const handleRegenerate = () => {
        setContextMenu(null);
        onRegenerate?.();
    };

    const startEdit = (msg: ChatMessage) => {
        setEditingMessageId(msg.id);
        setEditText(msg.content);
        setContextMenu(null);
    };

    const saveEdit = () => {
        if (editText.trim() && onEditLastMessage) {
            onEditLastMessage(editText.trim());
        }
        setEditingMessageId(null);
        setEditText('');
    };

    const cancelEdit = () => {
        setEditingMessageId(null);
        setEditText('');
    };

    // Find last user message for edit feature
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');

    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 40px 16px', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative' }}>
            {messages.length === 0 && !isLoading && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '40px' }}>
                    <div style={{ padding: '20px', background: 'var(--surface)', borderRadius: '50%', marginBottom: '16px', boxShadow: 'var(--shadow-sm)' }}>
                        <Icons.Bot width={32} height={32} strokeWidth={1.5} color="#007AFF" />
                    </div>
                    <h3 style={{ margin: '0 0 8px 0', color: 'var(--text-main)' }}>Local Assistant</h3>
                    <p style={{ margin: 0, opacity: 0.8, fontSize: '14px' }}>Ready to help with this page.</p>
                </div>
            )}

            {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const isSystem = msg.role === 'system';
                const isEditing = editingMessageId === msg.id;
                const canEdit = isUser && lastUserMessage?.id === msg.id && !isLoading;

                if (isSystem) {
                    return (
                        <div key={msg.id} className="animate-fade-in" style={{ padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#EF4444', borderRadius: '8px', fontSize: '12px', textAlign: 'center' }}>
                            {msg.content}
                        </div>
                    );
                }

                return (
                    <div
                        key={msg.id}
                        className="animate-slide-up"
                        style={{
                            display: 'flex',
                            gap: '12px',
                            flexDirection: isUser ? 'row-reverse' : 'row',
                            alignItems: 'flex-start'
                        }}
                    >
                        {/* Avatar */}
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                            background: isUser ? 'var(--primary-gradient)' : 'var(--surface)',
                            border: isUser ? 'none' : '1px solid var(--border-color)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: isUser ? 'white' : '#007AFF',
                            boxShadow: 'var(--shadow-sm)'
                        }}>
                            {isUser ? <Icons.User width={16} height={16} /> : <Icons.Bot width={18} height={18} />}
                        </div>

                        {/* Bubble */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
                            <div
                                onContextMenu={(e) => handleContextMenu(e, msg, isUser ? 'user' : 'ai')}
                                style={{
                                    backgroundColor: isUser ? 'var(--primary)' : 'var(--surface)',
                                    background: isUser ? 'var(--primary-gradient)' : 'var(--surface)',
                                    color: isUser ? 'white' : 'var(--text-main)',
                                    padding: isEditing ? '8px' : '10px 14px',
                                    borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                    boxShadow: isUser ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                                    border: isUser ? 'none' : '1px solid var(--border-color)',
                                    fontSize: '14px',
                                    lineHeight: '1.5',
                                    wordWrap: 'break-word',
                                    position: 'relative',
                                    minWidth: '60px',
                                    cursor: 'context-menu'
                                }}
                            >
                                {isEditing ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <textarea
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            style={{
                                                width: '100%', minWidth: '200px', minHeight: '60px',
                                                border: '1px solid var(--border-color)', borderRadius: '8px',
                                                padding: '8px', fontSize: '14px', resize: 'vertical',
                                                fontFamily: 'inherit', color: 'var(--text-main)'
                                            }}
                                            autoFocus
                                        />
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button onClick={cancelEdit} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }}>Cancel</button>
                                            <button onClick={saveEdit} className="btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }}>Save & Resend</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Thinking content - collapsible */}
                                        {!isUser && msg.thinking && (
                                            <ThinkingBlock thinking={msg.thinking} />
                                        )}
                                        {msg.attachments && msg.attachments.map((att, i) => (
                                            <div key={i} style={{ marginBottom: '8px', borderRadius: '8px', overflow: 'hidden' }}>
                                                <img src={att.content} alt="Attachment" style={{ maxWidth: '100%', maxHeight: '200px', display: 'block' }} />
                                            </div>
                                        ))}
                                        <MarkdownRenderer content={msg.content} />
                                    </>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', padding: '0 4px' }}>
                                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', opacity: 0.7 }}>
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {canEdit && !isEditing && (
                                    <button
                                        onClick={() => startEdit(msg)}
                                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer', padding: '2px', opacity: 0.7 }}
                                        title="Edit"
                                    >
                                        ✏️
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}

            {isLoading && (
                <div className="animate-slide-up" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <div style={{
                        width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                        background: 'var(--surface)',
                        border: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#007AFF',
                        boxShadow: 'var(--shadow-sm)'
                    }}>
                        <Icons.Bot width={18} height={18} />
                    </div>
                    <div style={{
                        background: 'var(--surface)',
                        padding: '12px 16px',
                        borderRadius: '18px 18px 18px 4px',
                        boxShadow: 'var(--shadow-sm)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        gap: '4px',
                        alignItems: 'center',
                        height: '40px'
                    }}>
                        <div className="typing-dot" style={{ width: '6px', height: '6px', background: '#ccc', borderRadius: '50%', animation: 'typing 1.4s infinite ease-in-out both' }}></div>
                        <div className="typing-dot" style={{ width: '6px', height: '6px', background: '#ccc', borderRadius: '50%', animation: 'typing 1.4s infinite ease-in-out both 0.2s' }}></div>
                        <div className="typing-dot" style={{ width: '6px', height: '6px', background: '#ccc', borderRadius: '50%', animation: 'typing 1.4s infinite ease-in-out both 0.4s' }}></div>
                        <style>{`
                            @keyframes typing {
                                0%, 80%, 100% { transform: scale(0); }
                                40% { transform: scale(1); }
                            }
                        `}</style>
                    </div>
                </div>
            )}
            <div ref={bottomRef} />

            {/* Context Menu */}
            {contextMenu && (
                <div
                    style={{
                        position: 'fixed',
                        left: contextMenu.x,
                        top: contextMenu.y,
                        background: 'var(--surface)',
                        borderRadius: '10px',
                        boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                        border: '1px solid var(--border-color)',
                        padding: '4px',
                        zIndex: 1000,
                        minWidth: '120px'
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={() => handleCopy(contextMenu.content)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                            padding: '8px 12px', border: 'none', background: 'transparent',
                            cursor: 'pointer', fontSize: '13px', borderRadius: '6px', textAlign: 'left'
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surface-secondary)')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                        📋 Copy
                    </button>
                    {contextMenu.type === 'ai' && onRegenerate && (
                        <button
                            onClick={handleRegenerate}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                padding: '8px 12px', border: 'none', background: 'transparent',
                                cursor: 'pointer', fontSize: '13px', borderRadius: '6px', textAlign: 'left'
                            }}
                            onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surface-secondary)')}
                            onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                            🔄 Regenerate
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
