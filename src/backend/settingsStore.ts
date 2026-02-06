import { ExtensionSettings, AIModel, ProviderConfig } from '../shared/types';

const SETTINGS_KEY = 'localSliderAssistant:settings';

const DEFAULT_MODELS: AIModel[] = [
    { id: 'jarvis-claude-sonnet', providerId: 'jarvis', backendName: 'claude-4-5-sonnet', displayName: 'Claude 4.5 Sonnet (Jarvis)', enabled: true },
    { id: 'openrouter-sonnet', providerId: 'openrouter', backendName: 'anthropic/claude-3.5-sonnet', displayName: 'Claude 3.5 Sonnet', enabled: false },
    { id: 'openrouter-gpt4o', providerId: 'openrouter', backendName: 'openai/gpt-4o', displayName: 'GPT-4o', enabled: false },
    { id: 'openai-gpt4o', providerId: 'openai', backendName: 'gpt-4o', displayName: 'GPT-4o (OpenAI)', enabled: false },
    { id: 'gemini-flash', providerId: 'gemini', backendName: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', enabled: false },
];

const DEFAULT_PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
    jarvis: { apiKey: '' }, // Users must configure their own API key
    openrouter: { apiKey: '' },
    openai: { apiKey: '' },
    gemini: { apiKey: '' },
};

export function getDefaultSettings(): ExtensionSettings {
    return {
        providers: JSON.parse(JSON.stringify(DEFAULT_PROVIDER_CONFIGS)),
        models: JSON.parse(JSON.stringify(DEFAULT_MODELS)),
        activeModelId: 'jarvis-claude-sonnet',
        theme: 'system',
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
        },
        customSystemPrompt: '',
    };
}

export async function loadSettings(): Promise<ExtensionSettings> {
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    const saved = result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined;
    const defaults = getDefaultSettings();


    // If nothing saved, return defaults
    if (!saved || Object.keys(saved).length === 0) {
        return defaults;
    }

    // Merge providers
    const providers: Record<string, ProviderConfig> = { ...defaults.providers };
    if (saved.providers && typeof saved.providers === 'object') {
        for (const pid in saved.providers) {
            if (providers[pid]) {
                providers[pid] = { ...providers[pid], ...saved.providers[pid] };
            } else {
                providers[pid] = saved.providers[pid];
            }
        }
    }

    // Merge models: if saved has models array with items, use it; otherwise use defaults
    let models = defaults.models;
    if (saved.models && Array.isArray(saved.models) && saved.models.length > 0) {
        models = saved.models;
    }

    // Active model: use saved if it exists AND the model is in the list
    let activeModelId = defaults.activeModelId;
    if (saved.activeModelId && models.some(m => m.id === saved.activeModelId)) {
        activeModelId = saved.activeModelId;
    }

    // Theme: use saved or default
    const theme = saved.theme || defaults.theme;

    const merged = { providers, models, activeModelId, theme };
    return merged;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

// Clear settings (for debugging)
export async function clearSettings(): Promise<void> {
    await chrome.storage.local.remove(SETTINGS_KEY);
}
