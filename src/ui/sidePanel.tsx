/* eslint-disable react-refresh/only-export-components */
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ChatMessage, PageContext, ExtensionSettings, BackendToFrontendMessage, AIRequestPayload, ChatSession, ContextPreferences } from '../shared/types';
import { ChatWindow } from './components/ChatWindow';
import { SettingsPanel } from './components/SettingsPanel';
import { HistorySidebar } from './components/HistorySidebar';
import { AgentController } from './components/AgentController';
import { Icons } from './icons';

const App: React.FC = () => {
    // Current Chat State
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);

    // Global State
    const [pageContext, setPageContext] = useState<PageContext | undefined>(undefined);
    const [settings, setSettings] = useState<ExtensionSettings | undefined>(undefined);

    // UI State
    const [showSettings, setShowSettings] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showAgent, setShowAgent] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);
    const [contextEnabled, setContextEnabled] = useState(true); // Browser context toggle
    const [contextPreferences, setContextPreferences] = useState<ContextPreferences>({
        includeUrl: true,
        includeTitle: true,
        includeSelection: true,
        includeContent: true,
        includeHtml: false,
        includeScreenshot: false,
        includeMetadata: true,
        includeImageOCR: true,
        quality: 'balanced',
        maxTokens: 8000,
        useCache: true,
        cacheTTL: 30,
        maxImagesForOCR: 3,
    });
    const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    );

    // Listen for system theme changes
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    // Listen for online/offline status
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // History State
    const [sessions, setSessions] = useState<ChatSession[]>([]);

    // 1. Load initial data
    useEffect(() => {
        // Load settings
        chrome.runtime.sendMessage({ type: 'LOAD_SETTINGS' }, (response: BackendToFrontendMessage) => {
            if (response?.type === 'SETTINGS') {
                setSettings(response.payload);
                if (response.payload.contextPreferences) {
                    setContextPreferences(response.payload.contextPreferences);
                }
            }
        });
        // Load page context
        chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT' }, (response: BackendToFrontendMessage) => {
            if (response?.type === 'PAGE_CONTEXT') setPageContext(response.payload);
        });
        // Load history and restore the most recent session
        chrome.runtime.sendMessage({ type: 'LOAD_HISTORY' }, (response: BackendToFrontendMessage) => {
            if (response?.type === 'HISTORY') {
                const loadedSessions = response.payload as ChatSession[];
                setSessions(loadedSessions);

                // Restore the most recent session so chats persist after restart
                if (loadedSessions.length > 0) {
                    // Sort by updatedAt descending to get the most recent
                    const sorted = [...loadedSessions].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
                    const lastSession = sorted[0];
                    setMessages(lastSession.messages);
                    setCurrentSessionId(lastSession.id);
                }
            }
        });
    }, []);

    // Theme Effect
    useEffect(() => {
        const theme = settings?.theme || 'system';
        const root = document.documentElement;

        if (theme === 'system') {
            root.setAttribute('data-theme', systemTheme);
        } else {
            root.setAttribute('data-theme', theme);
        }
    }, [settings?.theme, systemTheme]);


    // 2. Auto-save session when messages change (debounce could be good but simplistic for now)
    useEffect(() => {
        if (messages.length > 0) {
            // Use a ref pattern to avoid setState in effect while maintaining session ID
            const sessionId = currentSessionId || crypto.randomUUID();

            // Determine title from first message
            const title = messages[0].content.substring(0, 30) + (messages[0].content.length > 30 ? '...' : '');

            const updatedSession: ChatSession = {
                id: sessionId,
                title,
                messages,
                updatedAt: Date.now()
            };

            // eslint-disable-next-line react-hooks/set-state-in-effect -- Necessary to persist sessions on message change
            setSessions(prev => {
                const filtered = prev.filter(s => s.id !== sessionId);
                const newSessions = [...filtered, updatedSession];
                // Persist to storage
                chrome.runtime.sendMessage({ type: 'SAVE_HISTORY', payload: newSessions });
                return newSessions;
            });

            // Update current session ID if it was newly created
            // Using a microtask to avoid synchronous setState within effect
            if (!currentSessionId) {
                Promise.resolve().then(() => setCurrentSessionId(sessionId));
            }
        }
    }, [messages, currentSessionId]);

    // 3. Listen for AI responses, context updates, and keyboard shortcuts
    useEffect(() => {
        interface ErrorPayload { message: string }
        interface AIResponsePayload { message: ChatMessage }
        interface OfflinePayload { isOffline: boolean }
        
        interface RuntimeMessage {
            type: string;
            payload?: AIResponsePayload | ErrorPayload | PageContext | OfflinePayload;
        }
        const listener = (message: RuntimeMessage) => {
            if (message.type === 'AI_RESPONSE') {
                const payload = message.payload as AIResponsePayload;
                if (payload?.message) {
                    setMessages(prev => [...prev, payload.message]);
                    setIsLoading(false);
                }
            } else if (message.type === 'ERROR') {
                const payload = message.payload as ErrorPayload;
                console.error('Error from backend:', payload?.message);
                setIsLoading(false);
                setMessages(prev => [...prev, {
                    id: crypto.randomUUID(),
                    role: 'system',
                    content: `Error: ${payload?.message || 'Unknown error'}`,
                    createdAt: Date.now()
                }]);
            } else if (message.type === 'PAGE_CONTEXT') {
                // Auto-update context when tab changes
                const payload = message.payload as PageContext;
                setPageContext(payload);
            } else if (message.type === 'OFFLINE') {
                // Update offline status
                const payload = message.payload as OfflinePayload;
                if (payload?.isOffline !== undefined) {
                    setIsOffline(payload.isOffline);
                }
            } else if (message.type === 'TRIGGER_OCR') {
                // Trigger OCR from keyboard shortcut
                const ocrButton = document.querySelector('[data-ocr-trigger]') as HTMLButtonElement;
                if (ocrButton) {
                    ocrButton.click();
                }
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, []);

    // Handle keyboard shortcuts within side panel
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifier = isMac ? e.metaKey : e.ctrlKey;

            // Ctrl/Cmd+K - Focus input
            if (modifier && e.key === 'k') {
                e.preventDefault();
                const textarea = document.querySelector('textarea');
                if (textarea && !showSettings) {
                    textarea.focus();
                }
            }
            // Ctrl/Cmd+/ - Toggle context
            else if (modifier && e.key === '/') {
                e.preventDefault();
                setContextEnabled(prev => !prev);
            }
            // Ctrl/Cmd+L - Clear chat (new chat)
            else if (modifier && e.key === 'l') {
                e.preventDefault();
                // Inline new chat logic to avoid accessing handleNewChat before it's defined
                setMessages([]);
                setCurrentSessionId(undefined);
                setIsLoading(false);
                setShowHistory(false);
            }
            // Escape - Clear input or close settings
            else if (e.key === 'Escape') {
                if (showSettings) {
                    setShowSettings(false);
                } else if (showHistory) {
                    setShowHistory(false);
                } else {
                    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
                    if (textarea && textarea.value) {
                        textarea.value = '';
                        textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }
            }
            // ? - Show shortcuts help
            else if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const activeElement = document.activeElement;
                // Only trigger if not typing in an input
                if (activeElement?.tagName !== 'TEXTAREA' && activeElement?.tagName !== 'INPUT') {
                    e.preventDefault();
                    // Show shortcuts modal (will add this component next)
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [showSettings, showHistory]);

    const handleSendMessage = (text: string, image?: string) => {
        const userMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: text,
            createdAt: Date.now(),
            source: 'user-input',
            attachments: image ? [{ type: 'image', content: image }] : undefined
        };

        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        const payload: AIRequestPayload = {
            messages: [...messages, userMessage],
            pageContext: contextEnabled ? pageContext : undefined,
            contextPreferences: contextEnabled ? contextPreferences : undefined
        };

        chrome.runtime.sendMessage({ type: 'REQUEST_AI_RESPONSE', payload }, (response: BackendToFrontendMessage) => {
            if (response?.type === 'ERROR') {
                setIsLoading(false);
                setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'system', content: `Error: ${response.payload.message}`, createdAt: Date.now() }]);
            }
        });
    };

    const handleAbort = () => {
        // Cancel the request on the backend
        chrome.runtime.sendMessage({ type: 'CANCEL_AI_REQUEST' });
        setIsLoading(false);
    };

    const handleRegenerate = () => {
        // Find and remove the last AI message, then resend the last user message
        const lastAiIndex = [...messages].map((m, i) => ({ m, i })).filter(x => x.m.role === 'assistant').pop()?.i;
        if (lastAiIndex !== undefined) {
            const messagesWithoutLastAi = messages.slice(0, lastAiIndex);
            setMessages(messagesWithoutLastAi);
            setIsLoading(true);

            const payload: AIRequestPayload = {
                messages: messagesWithoutLastAi,
                pageContext: contextEnabled ? pageContext : undefined,
                contextPreferences: contextEnabled ? contextPreferences : undefined
            };
            chrome.runtime.sendMessage({ type: 'REQUEST_AI_RESPONSE', payload });
        }
    };

    const handleEditLastMessage = (newContent: string) => {
        // Replace last user message and resend
        const lastUserIndex = [...messages].map((m, i) => ({ m, i })).filter(x => x.m.role === 'user').pop()?.i;
        if (lastUserIndex !== undefined) {
            const updatedMessages = messages.slice(0, lastUserIndex);
            const editedMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'user',
                content: newContent,
                createdAt: Date.now(),
                source: 'user-input'
            };
            setMessages([...updatedMessages, editedMessage]);
            setIsLoading(true);

            const payload: AIRequestPayload = {
                messages: [...updatedMessages, editedMessage],
                pageContext: contextEnabled ? pageContext : undefined,
                contextPreferences: contextEnabled ? contextPreferences : undefined
            };
            chrome.runtime.sendMessage({ type: 'REQUEST_AI_RESPONSE', payload });
        }
    };

    const handleNewChat = () => {
        setMessages([]);
        setCurrentSessionId(undefined);
        setIsLoading(false);
        setShowHistory(false);
    };

    const handleSelectSession = (session: ChatSession) => {
        setMessages(session.messages);
        setCurrentSessionId(session.id);
        setShowHistory(false);
    };

    const handleRefreshContext = () => {
        chrome.runtime.sendMessage({ 
            type: 'GET_PAGE_CONTEXT', 
            payload: { 
                forceRefresh: true, 
                quality: contextPreferences.quality 
            } 
        }, (response: BackendToFrontendMessage) => {
            if (response?.type === 'PAGE_CONTEXT') setPageContext(response.payload);
        });
    };

    const handleSaveSettings = (newSettings: ExtensionSettings) => {
        chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: newSettings }, (response: BackendToFrontendMessage) => {
            if (response?.type === 'SETTINGS') {
                setSettings(response.payload);
                if (response.payload.contextPreferences) {
                    setContextPreferences(response.payload.contextPreferences);
                }
            }
        });
        setShowSettings(false);
    };

    const handleModelChange = (modelId: string) => {
        if (!settings) return;
        const newSettings = { ...settings, activeModelId: modelId };
        setSettings(newSettings);
        chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: newSettings });
    };

    const handleToggleTheme = () => {
        if (!settings) return;
        // If currently system, determine what to toggle to based on current system state
        const currentSetting = settings.theme || 'system';
        let newTheme: 'light' | 'dark';

        if (currentSetting === 'system') {
            newTheme = systemTheme === 'dark' ? 'light' : 'dark';
        } else {
            newTheme = currentSetting === 'dark' ? 'light' : 'dark';
        }

        const newSettings = { ...settings, theme: newTheme };
        setSettings(newSettings);
        chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', payload: newSettings });
    };

    const enabledModels = settings?.models.filter(m => m.enabled) || [];

    return (
        <>
            <header className="glass-header">
                <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => setShowHistory(true)} className="btn-icon">
                            <Icons.Menu width={24} height={24} />
                        </button>
                        <div style={{ width: '28px', height: '28px', background: 'var(--primary-gradient)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)' }}>
                            <Icons.Bot width={16} height={16} color="white" />
                        </div>
                        {isOffline && (
                            <span style={{
                                fontSize: '11px',
                                background: '#ef4444',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '12px',
                                fontWeight: 600
                            }}>
                                Offline
                            </span>
                        )}
                    </div>

                    {/* Model Selector */}
                    <select
                        value={settings?.activeModelId || ''}
                        onChange={(e) => handleModelChange(e.target.value)}
                        style={{
                            flex: 1, maxWidth: '180px', marginLeft: '8px',
                            padding: '6px 8px', fontSize: '13px', fontWeight: 500,
                            borderRadius: '8px', border: '1px solid var(--border-color)',
                            background: 'var(--surface)', cursor: 'pointer', outline: 'none',
                            color: 'var(--text-main)',
                            textOverflow: 'ellipsis'
                        }}
                    >
                        {enabledModels.length === 0 && <option value="">No models</option>}
                        {enabledModels.map(m => (
                            <option key={m.id} value={m.id}>{m.displayName}</option>
                        ))}
                    </select>

                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={handleNewChat} className="btn-icon" title="New Chat">
                            <Icons.Plus width={20} height={20} />
                        </button>
                        <button
                            onClick={handleToggleTheme}
                            className="btn-icon"
                            title={settings?.theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                        >
                            {settings?.theme === 'dark' || (settings?.theme === 'system' && systemTheme === 'dark') ? (
                                <Icons.Sun width={20} height={20} />
                            ) : (
                                <Icons.Moon width={20} height={20} />
                            )}
                        </button>
                        <button onClick={handleRefreshContext} className="btn-icon" title="Refresh Page Context">
                            <Icons.Refresh width={20} height={20} />
                        </button>
                        <button onClick={() => setShowSettings(!showSettings)} className="btn-icon" title="Settings" style={{ color: showSettings ? 'var(--primary)' : 'inherit', background: showSettings ? 'rgba(0,122,255,0.1)' : 'transparent' }}>
                            {showSettings ? <Icons.X width={20} height={20} /> : <Icons.Settings width={20} height={20} />}
                        </button>
                    </div>
                </div>
            </header>

            <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {showHistory && (
                    <>
                        <div onClick={() => setShowHistory(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 10 }} className="animate-fade-in"></div>
                        <HistorySidebar
                            sessions={sessions}
                            currentSessionId={currentSessionId}
                            onSelectSession={handleSelectSession}
                            onNewChat={handleNewChat}
                            onClose={() => setShowHistory(false)}
                        />
                    </>
                )}

                {showSettings ? (
                    <div style={{ height: '100%', overflowY: 'auto' }}>
                        <SettingsPanel
                            initialSettings={settings}
                            onSave={handleSaveSettings}
                            onCancel={() => setShowSettings(false)}
                        />
                    </div>
                ) : (
                    <>
                        <ChatWindow
                            messages={messages}
                            pageContext={pageContext}
                            onSendMessage={handleSendMessage}
                            isLoading={isLoading}
                            onAbort={handleAbort}
                            onRegenerate={handleRegenerate}
                            onEditLastMessage={handleEditLastMessage}
                            contextEnabled={contextEnabled}
                            onToggleContext={() => setContextEnabled(prev => !prev)}
                        />
                    </>
                )}

                {/* Agent Overlay */}
                {showAgent && (
                    <AgentController
                        pageContext={pageContext}
                        onClose={() => setShowAgent(false)}
                    />
                )}
            </main>
        </>
    );
};

// Mount React app
const container = document.getElementById('root');
if (container) {
    const root = createRoot(container);
    root.render(<App />);
}
