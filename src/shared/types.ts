export type Role = 'user' | 'assistant' | 'system';

export interface ChatMessage {
    id: string;
    role: Role;
    content: string;
    createdAt: number;
    source?: 'user-input' | 'page-context' | 'ai';
    thinking?: string;  // Extended thinking content from Claude models
    attachments?: {
        type: 'image';
        content: string;
    }[];
}

// Content metadata extracted from page
export interface ContentMetadata {
    author?: string;
    publishDate?: string;
    description?: string;
    keywords?: string[];
    type?: 'article' | 'documentation' | 'forum' | 'ecommerce' | 'app' | 'unknown';
    language?: string;
    readingTime?: number; // estimated minutes
    imageCount?: number; // total images on page
    importantImageCount?: number; // images that were OCR'd
}

// OCR result from an image
export interface ImageOCRResult {
    imageUrl: string;
    altText?: string;
    width: number;
    height: number;
    importance: number; // 0-100 score
    ocrText: string;
    confidence: number;
    reason: string; // why this image was selected
}

// Semantic content chunk
export interface ContentChunk {
    type: 'heading' | 'paragraph' | 'code' | 'list' | 'quote';
    priority: number; // 0-100, higher = more important
    text: string;
    tokens: number; // estimated
    level?: number; // for headings: 1-6
}

// Content quality metrics
export interface ContentQuality {
    score: number; // 0-100, overall quality
    readability: number; // 0-100, how readable
    density: number; // 0-100, information density
    hasMainContent: boolean;
    hasNavigation: boolean;
    hasAds: boolean;
}

// Enhanced page context with quality metrics
export interface PageContext {
    url: string;
    title: string;
    selectionText?: string;
    mainContentSnippet?: string;
    htmlSource?: string;
    screenshot?: string;

    // New enhanced fields
    metadata?: ContentMetadata;
    quality?: ContentQuality;
    chunks?: ContentChunk[];
    hash?: string; // content hash for change detection
    timestamp?: number; // when extracted
    tokens?: TokenBudget;
    imageOCR?: ImageOCRResult[]; // OCR results from important images
}

// Token budget tracking
export interface TokenBudget {
    total: number;
    used: {
        url: number;
        title: number;
        selection: number;
        content: number;
        html: number;
        metadata: number;
    };
    remaining: number;
    percentage: number; // 0-100
}


export interface AIRequestPayload {
    messages: ChatMessage[];
    pageContext?: PageContext;
    contextPreferences?: ContextPreferences;
    stream?: boolean;
    abortSignal?: AbortSignal;
}

export interface AIResponsePayload {
    message: ChatMessage;
    rawModelOutput?: unknown;
    streaming?: boolean;
    done?: boolean;
}

export interface ChatSession {
    id: string;
    title: string;
    messages: ChatMessage[];
    updatedAt: number;
}

// --- Multi-Provider Types ---

export interface AIProvider {
    id: string;           // 'openrouter' | 'gemini' | 'openai' | 'jarvis'
    name: string;         // Display name e.g., "OpenRouter"
    baseUrl: string;      // Default API endpoint
    requiresApiKey: boolean;
    authHeader?: 'Authorization' | 'x-api-key'; // How to pass the key
}

export interface AIModel {
    id: string;
    providerId: string;
    backendName: string;   // For API calls (e.g., 'gpt-4o')
    displayName: string;   // For UI (e.g., 'GPT-4o')
    enabled: boolean;
    // Model-specific parameters
    temperature?: number;        // 0.0 - 2.0, undefined = model default
    thinkingEnabled?: boolean;   // Enable extended thinking (Claude models)
    thinkingBudget?: number;     // Max tokens for thinking (e.g., 10000)
}

export interface ProviderConfig {
    apiKey: string;
    customBaseUrl?: string; // For overriding the default (e.g., for Jarvis)
}

export interface ContextPreferences {
    includeUrl: boolean;
    includeTitle: boolean;
    includeSelection: boolean;
    includeContent: boolean;
    includeHtml: boolean;
    includeScreenshot: boolean;
    includeMetadata: boolean;
    includeImageOCR: boolean; // NEW: OCR important images

    // Quality/performance settings
    quality: 'fast' | 'balanced' | 'thorough'; // extraction thoroughness
    maxTokens: number; // token budget limit
    useCache: boolean; // use cached context
    cacheTTL: number; // cache time-to-live in seconds
    maxImagesForOCR: number; // max images to OCR (default: 3)
}

export interface ExtensionSettings {
    providers: Record<string, ProviderConfig>;
    models: AIModel[];
    activeModelId: string;
    theme?: 'light' | 'dark' | 'system';
    contextPreferences?: ContextPreferences;
    customSystemPrompt?: string; // Custom system prompt/rules for AI behavior
}

// --- Messages ---

export type FrontendToBackendMessage =
    | { type: 'LOAD_SETTINGS' }
    | { type: 'SAVE_SETTINGS'; payload: ExtensionSettings }
    | { type: 'GET_PAGE_CONTEXT'; payload?: { forceRefresh?: boolean; quality?: 'fast' | 'balanced' | 'thorough' } }
    | { type: 'CLEAR_CONTEXT_CACHE' }
    | { type: 'CAPTURE_SCREENSHOT' }
    | { type: 'REQUEST_AI_RESPONSE'; payload: AIRequestPayload }
    | { type: 'CANCEL_AI_REQUEST' }
    | { type: 'VALIDATE_API_KEY'; payload: { providerId: string; apiKey: string } }
    | { type: 'LOAD_HISTORY' }
    | { type: 'SAVE_HISTORY'; payload: ChatSession[] }
    | { type: 'CLEAR_HISTORY' }
    | { type: 'EXECUTE_AGENT_ACTION'; payload: BrowserAction }
    | { type: 'RUN_AGENT_STEP'; payload: AgentRequestPayload }
    | { type: 'PROCESS_OCR'; payload: { imageDataUrl: string } }
    | { type: 'START_OCR_CROP' };



export type BackendToFrontendMessage =
    | { type: 'SETTINGS'; payload: ExtensionSettings }
    | { type: 'PAGE_CONTEXT'; payload: PageContext }
    | { type: 'AI_RESPONSE'; payload: AIResponsePayload }
    | { type: 'AI_RESPONSE_CHUNK'; payload: { content: string; messageId: string } }
    | { type: 'AI_RESPONSE_DONE'; payload: { messageId: string } }
    | { type: 'ERROR'; payload: { message: string } }
    | { type: 'OFFLINE'; payload: { isOffline: boolean } }
    | { type: 'API_KEY_VALID'; payload: { valid: boolean; error?: string } }
    | { type: 'HISTORY'; payload: ChatSession[] }
    | { type: 'SCREENSHOT'; payload: { dataUrl: string } }
    | { type: 'AGENT_ACTION_RESULT'; payload: ActionResult }
    | { type: 'AGENT_STEP'; payload: AgentStep }
    | { type: 'OCR_RESULT'; payload: { text: string; confidence: number } };

// --- Browser Agent Types ---

/** Actions the agent can perform in the browser */
export type BrowserAction =
    | { type: 'navigate'; url: string }
    | { type: 'click'; selector: string; text?: string }
    | { type: 'type'; selector: string; text: string; clearFirst?: boolean }
    | { type: 'scroll'; direction?: 'up' | 'down'; selector?: string }
    | { type: 'wait'; selector?: string; timeout?: number }
    | { type: 'extract'; selector: string; attribute?: string }
    | { type: 'hover'; selector: string }
    | { type: 'select'; selector: string; value: string }
    | { type: 'pressKey'; key: string }
    | { type: 'done'; summary: string };

/** Result of executing an action */
export interface ActionResult {
    success: boolean;
    error?: string;
    data?: unknown;
    screenshot?: string;
}

/** A single step in the agent's execution */
export interface AgentStep {
    id: string;
    thought: string;
    action: BrowserAction;
    result?: ActionResult;
    timestamp: number;
}

/** Agent response from AI */
export interface AgentResponse {
    thought: string;
    action: BrowserAction;
    done: boolean;
}

/** Current state of the agent */
export interface AgentState {
    isRunning: boolean;
    isPaused: boolean;
    currentTask: string;
    steps: AgentStep[];
    stepCount: number;
    maxSteps: number;
    startTime: number;
    error?: string;
}

/** Agent configuration */
export interface AgentConfig {
    maxSteps: number;
    stepDelayMs: number;
    timeoutMs: number;
    retryCount: number;
    autoApprove: boolean;
    highlightElements: boolean;
}

/** Message to content script for action execution */
export interface ExecuteActionMessage {
    type: 'EXECUTE_ACTION';
    action: BrowserAction;
}

/** Agent request payload */
export interface AgentRequestPayload {
    task: string;
    pageContext: PageContext;
    previousSteps?: AgentStep[];
}

// --- Default Providers (static reference) ---

export const DEFAULT_PROVIDERS: AIProvider[] = [
    { id: 'jarvis', name: 'Jarvis', baseUrl: 'https://ai.jarvisbazar.com/v1/chat/completions', requiresApiKey: true, authHeader: 'Authorization' },
    { id: 'openrouter', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1/chat/completions', requiresApiKey: true, authHeader: 'Authorization' },
    { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1/chat/completions', requiresApiKey: true, authHeader: 'Authorization' },
    { id: 'gemini', name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', requiresApiKey: true, authHeader: 'Authorization' },
    { id: 'moonshot', name: 'Moonshot AI (Global)', baseUrl: 'https://api.moonshot.ai/v1/chat/completions', requiresApiKey: true, authHeader: 'Authorization' },
    { id: 'moonshot-cn', name: 'Moonshot AI (China)', baseUrl: 'https://api.moonshot.cn/v1/chat/completions', requiresApiKey: true, authHeader: 'Authorization' },
];

/** Default agent configuration */
export const DEFAULT_AGENT_CONFIG: AgentConfig = {
    maxSteps: 20,
    stepDelayMs: 500,
    timeoutMs: 60000,
    retryCount: 2,
    autoApprove: true,
    highlightElements: true,
};
