import React, { useState } from 'react';
import { ExtensionSettings, AIModel, DEFAULT_PROVIDERS, ContextPreferences } from '../../shared/types';
import { Icons } from '../icons';

interface Props {
    initialSettings?: ExtensionSettings;
    onSave: (settings: ExtensionSettings) => void;
    onCancel: () => void;
}

const getDefaultSettings = (): ExtensionSettings => ({
    providers: {
        jarvis: { apiKey: '' },
        openrouter: { apiKey: '' },
        openai: { apiKey: '' },
        gemini: { apiKey: '' },
    },
    models: [],
    activeModelId: '',
    contextPreferences: {
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
    }
});

export const SettingsPanel: React.FC<Props> = ({ initialSettings, onSave, onCancel }) => {
    const [settings, setSettings] = useState<ExtensionSettings>(() => {
        const defaults = getDefaultSettings();
        if (!initialSettings) return defaults;
        return {
            ...defaults,
            ...initialSettings,
            contextPreferences: {
                ...defaults.contextPreferences!,
                ...initialSettings.contextPreferences
            }
        };
    });
    const [activeTab, setActiveTab] = useState<'providers' | 'models' | 'context' | 'prompts'>('providers');
    const [newModel, setNewModel] = useState({ providerId: 'jarvis', backendName: '', displayName: '' });
    const [validatingKey, setValidatingKey] = useState<string | null>(null);
    const [keyValidation, setKeyValidation] = useState<Record<string, { valid: boolean; error?: string }>>({});

    const handleProviderKeyChange = (providerId: string, apiKey: string) => {
        setSettings(prev => ({
            ...prev,
            providers: {
                ...prev.providers,
                [providerId]: { ...prev.providers[providerId], apiKey }
            }
        }));
        // Clear validation status when key changes
        setKeyValidation(prev => {
            const updated = { ...prev };
            delete updated[providerId];
            return updated;
        });
    };

    const handleValidateKey = async (providerId: string) => {
        const apiKey = settings.providers[providerId]?.apiKey;
        if (!apiKey) return;

        setValidatingKey(providerId);
        interface ValidateResponse {
            type?: string;
            payload?: { valid: boolean; error?: string };
        }
        chrome.runtime.sendMessage(
            { type: 'VALIDATE_API_KEY', payload: { providerId, apiKey } },
            (response: ValidateResponse) => {
                if (response?.type === 'API_KEY_VALID' && response.payload) {
                    setKeyValidation(prev => ({ ...prev, [providerId]: response.payload! }));
                }
                setValidatingKey(null);
            }
        );
    };

    const handleModelToggle = (modelId: string) => {
        setSettings(prev => ({
            ...prev,
            models: prev.models.map(m => m.id === modelId ? { ...m, enabled: !m.enabled } : m)
        }));
    };

    const handleModelFieldChange = (modelId: string, field: 'displayName' | 'backendName', value: string) => {
        setSettings(prev => ({
            ...prev,
            models: prev.models.map(m => m.id === modelId ? { ...m, [field]: value } : m)
        }));
    };

    const handleModelSettingChange = (modelId: string, field: 'temperature' | 'thinkingEnabled' | 'thinkingBudget', value: number | boolean | undefined) => {
        setSettings(prev => ({
            ...prev,
            models: prev.models.map(m => m.id === modelId ? { ...m, [field]: value } : m)
        }));
    };

    const handleAddModel = () => {
        if (!newModel.backendName.trim() || !newModel.displayName.trim()) return;
        const id = `custom-${Date.now()}`;
        const model: AIModel = {
            id,
            providerId: newModel.providerId,
            backendName: newModel.backendName.trim(),
            displayName: newModel.displayName.trim(),
            enabled: true,
        };
        setSettings(prev => ({ ...prev, models: [...prev.models, model] }));
        setNewModel({ providerId: 'jarvis', backendName: '', displayName: '' });
    };

    const handleDeleteModel = (modelId: string) => {
        setSettings(prev => ({
            ...prev,
            models: prev.models.filter(m => m.id !== modelId),
            activeModelId: prev.activeModelId === modelId ? '' : prev.activeModelId
        }));
    };

    const handleContextToggle = (key: keyof ContextPreferences) => {
        setSettings(prev => {
            const currentPrefs = prev.contextPreferences || getDefaultSettings().contextPreferences!;
            const currentVal = currentPrefs[key];
            
            if (typeof currentVal === 'boolean') {
                return {
                    ...prev,
                    contextPreferences: {
                        ...currentPrefs,
                        [key]: !currentVal
                    }
                };
            }
            return prev;
        });
    };

    const handleQualityChange = (quality: 'fast' | 'balanced' | 'thorough') => {
        setSettings(prev => {
            const currentPrefs = prev.contextPreferences || getDefaultSettings().contextPreferences!;
            return {
                ...prev,
                contextPreferences: {
                    ...currentPrefs,
                    quality
                }
            };
        });
    };
    
    // Safe accessor for render
    const contextPrefs = settings.contextPreferences || getDefaultSettings().contextPreferences!;

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '10px', borderRadius: '8px',
        border: '1px solid var(--border-color)', fontSize: '14px', outline: 'none',
        background: 'var(--surface)', transition: 'border-color 0.2s'
    };

    const tabStyle = (isActive: boolean): React.CSSProperties => ({
        padding: '10px 16px', background: isActive ? 'var(--primary)' : 'transparent',
        color: isActive ? 'white' : 'var(--text-secondary)', border: 'none', borderRadius: '8px',
        cursor: 'pointer', fontWeight: 500, fontSize: '14px', transition: 'all 0.2s'
    });

    return (
        <div className="animate-fade-in" style={{ padding: '24px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
            <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 600, margin: '0 0 8px 0' }}>Settings</h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>Configure AI Providers & Models</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'var(--surface-secondary)', padding: '4px', borderRadius: '12px' }}>
                <button style={tabStyle(activeTab === 'providers')} onClick={() => setActiveTab('providers')}>Providers</button>
                <button style={tabStyle(activeTab === 'models')} onClick={() => setActiveTab('models')}>Models</button>
                <button style={tabStyle(activeTab === 'context')} onClick={() => setActiveTab('context')}>Context</button>
                <button style={tabStyle(activeTab === 'prompts')} onClick={() => setActiveTab('prompts')}>Prompts</button>
            </div>

            {activeTab === 'providers' && (
                <div className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {DEFAULT_PROVIDERS.map(provider => {
                        const validation = keyValidation[provider.id];
                        const isValidating = validatingKey === provider.id;
                        const hasKey = settings.providers[provider.id]?.apiKey?.length > 0;
                        
                        return (
                            <div key={provider.id}>
                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>
                                    {provider.name}
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="password"
                                        value={settings.providers[provider.id]?.apiKey || ''}
                                        onChange={(e) => handleProviderKeyChange(provider.id, e.target.value)}
                                        placeholder={`API Key for ${provider.name}`}
                                        style={{
                                            ...inputStyle,
                                            borderColor: validation ? (validation.valid ? '#22c55e' : '#ef4444') : 'var(--border-color)'
                                        }}
                                    />
                                    {hasKey && (
                                        <button
                                            onClick={() => handleValidateKey(provider.id)}
                                            disabled={isValidating}
                                            className="btn-secondary"
                                            style={{
                                                minWidth: '80px',
                                                opacity: isValidating ? 0.6 : 1,
                                                cursor: isValidating ? 'wait' : 'pointer'
                                            }}
                                        >
                                            {isValidating ? 'Testing...' : validation?.valid ? '✓ Valid' : 'Test'}
                                        </button>
                                    )}
                                </div>
                                {validation && !validation.valid && validation.error && (
                                    <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#ef4444' }}>
                                        ⚠️ {validation.error}
                                    </p>
                                )}
                                <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>{provider.baseUrl}</p>
                            </div>
                        );
                    })}
                </div>
            )}

            {activeTab === 'models' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Add New Model */}
                    <div className="card" style={{ padding: '16px' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Add New Model</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <select
                                value={newModel.providerId}
                                onChange={(e) => setNewModel(prev => ({ ...prev, providerId: e.target.value }))}
                                style={{ ...inputStyle, cursor: 'pointer' }}
                            >
                                {DEFAULT_PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <input
                                type="text"
                                value={newModel.backendName}
                                onChange={(e) => setNewModel(prev => ({ ...prev, backendName: e.target.value }))}
                                placeholder="Backend Name (e.g., gpt-4o)"
                                style={inputStyle}
                            />
                            <input
                                type="text"
                                value={newModel.displayName}
                                onChange={(e) => setNewModel(prev => ({ ...prev, displayName: e.target.value }))}
                                placeholder="Display Name (e.g., GPT-4 Turbo)"
                                style={inputStyle}
                            />
                            <button onClick={handleAddModel} className="btn-primary" style={{ width: '100%' }}>+ Add Model</button>
                        </div>
                    </div>

                    {/* Model List */}
                    <div className="card" style={{ padding: '16px' }}>
                        <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 600 }}>Your Models</h4>
                        {settings.models.length === 0 ? (
                            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No models configured yet.</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {settings.models.map(model => {
                                    const provider = DEFAULT_PROVIDERS.find(p => p.id === model.providerId);
                                    return (
                                        <div key={model.id} style={{ padding: '12px', background: 'var(--surface-secondary)', borderRadius: '10px', opacity: model.enabled ? 1 : 0.6 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={model.enabled}
                                                        onChange={() => handleModelToggle(model.id)}
                                                        style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                                                    />
                                                    <span style={{ fontSize: '12px', background: 'var(--primary)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>{provider?.name || model.providerId}</span>
                                                </div>
                                                <button onClick={() => handleDeleteModel(model.id)} className="btn-icon" style={{ width: '24px', height: '24px', color: '#EF4444' }}>
                                                    <Icons.X width={14} height={14} />
                                                </button>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <input type="text" value={model.displayName} onChange={(e) => handleModelFieldChange(model.id, 'displayName', e.target.value)} placeholder="Display Name" style={{ ...inputStyle, padding: '8px', fontSize: '13px' }} />
                                                <input type="text" value={model.backendName} onChange={(e) => handleModelFieldChange(model.id, 'backendName', e.target.value)} placeholder="Backend Name" style={{ ...inputStyle, padding: '8px', fontSize: '13px' }} />
                                            </div>

                                            {/* Model Settings Section */}
                                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-color)' }}>
                                                {/* Temperature Control */}
                                                <div style={{ marginBottom: '12px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                        <label style={{ fontSize: '12px', fontWeight: 500 }}>Temperature</label>
                                                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                                            {model.temperature !== undefined ? model.temperature.toFixed(1) : 'Default'}
                                                        </span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="2"
                                                            step="0.1"
                                                            value={model.temperature ?? 1}
                                                            onChange={(e) => handleModelSettingChange(model.id, 'temperature', parseFloat(e.target.value))}
                                                            disabled={model.temperature === undefined}
                                                            style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                                                        />
                                                        <button
                                                            onClick={() => handleModelSettingChange(model.id, 'temperature', model.temperature === undefined ? 1.0 : undefined)}
                                                            style={{
                                                                fontSize: '10px', padding: '3px 6px', borderRadius: '4px',
                                                                border: '1px solid var(--border-color)', background: model.temperature === undefined ? 'var(--primary)' : 'transparent',
                                                                color: model.temperature === undefined ? 'white' : 'var(--text-secondary)', cursor: 'pointer'
                                                            }}
                                                        >
                                                            {model.temperature === undefined ? 'Default' : 'Use Default'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Thinking Mode Control */}
                                                <div style={{ background: 'var(--surface)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                        <div>
                                                            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary)' }}>🧠 Thinking Mode</label>
                                                            <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Enable extended reasoning (if supported)</p>
                                                        </div>
                                                        <input
                                                            type="checkbox"
                                                            checked={model.thinkingEnabled || false}
                                                            onChange={(e) => handleModelSettingChange(model.id, 'thinkingEnabled', e.target.checked)}
                                                            style={{ width: '18px', height: '18px', accentColor: '#7c3aed' }}
                                                        />
                                                    </div>
                                                    {model.thinkingEnabled && (
                                                        <div style={{ marginTop: '10px' }}>
                                                            <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Budget (tokens)</label>
                                                            <input
                                                                type="number"
                                                                value={model.thinkingBudget || 10000}
                                                                onChange={(e) => handleModelSettingChange(model.id, 'thinkingBudget', parseInt(e.target.value) || 10000)}
                                                                min="1000"
                                                                max="100000"
                                                                step="1000"
                                                                style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px', marginTop: '4px', background: 'var(--surface-secondary)' }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'context' && (
                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)' }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600 }}>Page Context Settings</h4>
                        <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Control what information is sent to the AI</p>
                    </div>

                    {/* Quality Selection */}
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'var(--surface-secondary)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-main)' }}>
                            Extraction Quality
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {(['fast', 'balanced', 'thorough'] as const).map(qual => (
                                <button
                                    key={qual}
                                    onClick={() => handleQualityChange(qual)}
                                    style={{
                                        flex: 1,
                                        padding: '8px',
                                        fontSize: '12px',
                                        border: '1px solid',
                                        borderColor: contextPrefs.quality === qual ? 'var(--primary)' : 'var(--border-color)',
                                        background: contextPrefs.quality === qual ? 'var(--primary)' : 'var(--surface)',
                                        color: contextPrefs.quality === qual ? 'white' : 'var(--text-main)',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontWeight: contextPrefs.quality === qual ? 600 : 400,
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    {qual === 'fast' && '⚡ Fast'}
                                    {qual === 'balanced' && '⚖️ Balanced'}
                                    {qual === 'thorough' && '🔍 Thorough'}
                                </button>
                            ))}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                            {contextPrefs.quality === 'fast' && 'Basic text only (fastest, fewer tokens)'}
                            {contextPrefs.quality === 'balanced' && 'Smart chunking + metadata (recommended)'}
                            {contextPrefs.quality === 'thorough' && 'Full extraction + analysis (most tokens)'}
                        </div>
                    </div>

                    {/* Context Items */}
                    <div style={{ padding: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            <CheckboxItem
                                label="URL"
                                checked={contextPrefs.includeUrl}
                                onChange={() => handleContextToggle('includeUrl')}
                                description="Page URL"
                            />
                            <CheckboxItem
                                label="Title"
                                checked={contextPrefs.includeTitle}
                                onChange={() => handleContextToggle('includeTitle')}
                                description="Page title"
                            />
                            <CheckboxItem
                                label="Selection"
                                checked={contextPrefs.includeSelection}
                                onChange={() => handleContextToggle('includeSelection')}
                                description="Selected text"
                            />
                            <CheckboxItem
                                label="Content"
                                checked={contextPrefs.includeContent}
                                onChange={() => handleContextToggle('includeContent')}
                                description="Page text"
                            />
                            <CheckboxItem
                                label="Metadata"
                                checked={contextPrefs.includeMetadata}
                                onChange={() => handleContextToggle('includeMetadata')}
                                description="Author, date, type"
                                badge="Smart"
                            />
                            <CheckboxItem
                                label="Image OCR"
                                checked={contextPrefs.includeImageOCR}
                                onChange={() => handleContextToggle('includeImageOCR')}
                                description="Extract text from images"
                                badge="Smart"
                            />
                            <CheckboxItem
                                label="HTML"
                                checked={contextPrefs.includeHtml}
                                onChange={() => handleContextToggle('includeHtml')}
                                description="HTML structure"
                                badge="Heavy"
                            />
                            <CheckboxItem
                                label="Screenshot"
                                checked={contextPrefs.includeScreenshot}
                                onChange={() => handleContextToggle('includeScreenshot')}
                                description="Page screenshot"
                                badge="Vision"
                            />
                            <CheckboxItem
                                label="Use Cache"
                                checked={contextPrefs.useCache}
                                onChange={() => handleContextToggle('useCache')}
                                description="Cache for 30s"
                            />
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'prompts' && (
                <div className="card" style={{ padding: '20px' }}>
                    <div style={{ marginBottom: '16px' }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600 }}>Custom System Prompt</h4>
                        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Add custom instructions or rules that will be sent to the AI with every request. This helps personalize the AI's behavior.
                        </p>
                    </div>
                    <textarea
                        value={settings.customSystemPrompt || ''}
                        onChange={(e) => setSettings(prev => ({ ...prev, customSystemPrompt: e.target.value }))}
                        placeholder="Example: You are a helpful assistant that always responds in a friendly tone. When explaining technical concepts, use simple analogies. Always provide code examples when relevant."
                        style={{
                            width: '100%',
                            minHeight: '200px',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid var(--border-color)',
                            fontSize: '13px',
                            fontFamily: 'inherit',
                            lineHeight: '1.6',
                            resize: 'vertical',
                            outline: 'none',
                            background: 'var(--surface)',
                            transition: 'border-color 0.2s'
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                    />
                    <div style={{ marginTop: '12px', padding: '12px', background: 'var(--surface-secondary)', borderRadius: '8px' }}>
                        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                            <strong>Tips:</strong> Be specific about tone, style, and formatting preferences. 
                            You can include instructions like "always use bullet points", "explain like I'm a beginner", 
                            or "focus on practical examples".
                        </p>
                    </div>
                </div>
            )}

            {/* Active Model Selector */}
            <div className="card" style={{ padding: '16px', marginTop: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>Active Model</label>
                <select
                    value={settings.activeModelId}
                    onChange={(e) => setSettings(prev => ({ ...prev, activeModelId: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                >
                    <option value="">-- Select a Model --</option>
                    {settings.models.filter(m => m.enabled).map(m => (
                        <option key={m.id} value={m.id}>{m.displayName}</option>
                    ))}
                </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                <button onClick={onCancel} className="btn-secondary">Cancel</button>
                <button onClick={() => onSave(settings)} className="btn-primary">Save Changes</button>
            </div>
        </div>
    );
};

interface CheckboxItemProps {
    label: string;
    checked: boolean;
    onChange: () => void;
    description: string;
    badge?: string;
}

const CheckboxItem: React.FC<CheckboxItemProps> = ({ 
    label, 
    checked, 
    onChange, 
    description,
    badge 
}) => {
    return (
        <label style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '6px',
            transition: 'background 0.15s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-secondary)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
            <input
                type="checkbox"
                checked={checked}
                onChange={onChange}
                style={{
                    marginTop: '2px',
                    cursor: 'pointer',
                    width: '16px',
                    height: '16px',
                    accentColor: 'var(--primary)'
                }}
            />
            <div style={{ flex: 1 }}>
                <div style={{ 
                    fontSize: '13px', 
                    fontWeight: 500,
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                }}>
                    {label}
                    {badge && (
                        <span style={{
                            fontSize: '9px',
                            background: 'var(--text-secondary)',
                            color: 'white',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            fontWeight: 600
                        }}>
                            {badge}
                        </span>
                    )}
                </div>
                <div style={{ 
                    fontSize: '11px', 
                    color: 'var(--text-secondary)',
                    marginTop: '2px'
                }}>
                    {description}
                </div>
            </div>
        </label>
    );
};