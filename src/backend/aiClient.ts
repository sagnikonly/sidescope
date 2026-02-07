import { AIRequestPayload, AIResponsePayload, ChatMessage, DEFAULT_PROVIDERS, ContextPreferences, PageContext } from '../shared/types';
import { loadSettings } from './settingsStore';

// Global abort controller for request cancellation
let currentAbortController: AbortController | null = null;

/**
 * Check if user is offline
 */
export function isOffline(): boolean {
    return !navigator.onLine;
}

/**
 * Retry with exponential backoff
 */
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            // Don't retry on user cancellation or auth errors
            if (error instanceof Error) {
                if (error.name === 'AbortError' || error.message.includes('401') || error.message.includes('403')) {
                    throw error;
                }
            }

            // Don't retry on last attempt
            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('Max retries exceeded');
}

/**
 * Cancel current AI request
 */
export function cancelCurrentRequest(): void {
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
}

/**
 * Validate API key
 */
export async function validateApiKey(providerId: string, apiKey: string): Promise<{ valid: boolean; error?: string }> {
    const provider = DEFAULT_PROVIDERS.find(p => p.id === providerId);
    if (!provider) {
        return { valid: false, error: 'Provider not found' };
    }

    if (!apiKey || apiKey.trim().length === 0) {
        return { valid: false, error: 'API key is empty' };
    }

    // Try a simple test request
    try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (provider.authHeader === 'x-api-key') {
            headers['x-api-key'] = apiKey;
        } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        // Use provider-specific test models
        let testModel = 'gpt-4o-mini'; // Default for OpenAI-compatible
        if (providerId === 'gemini') {
            testModel = 'gemini-2.0-flash';
        } else if (providerId === 'moonshot' || providerId === 'moonshot-cn') {
            testModel = 'kimi-k2.5';
        } else if (providerId === 'jarvis') {
            testModel = 'claude-4-5-sonnet';
        } else if (providerId === 'openrouter') {
            testModel = 'openai/gpt-4o-mini';
        }

        const testBody = JSON.stringify({
            model: testModel,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 5
        });

        const res = await fetch(provider.baseUrl, {
            method: 'POST',
            headers,
            body: testBody,
            signal: AbortSignal.timeout(10000) // 10s timeout
        });

        if (res.status === 401 || res.status === 403) {
            return { valid: false, error: 'Invalid API key' };
        }

        if (res.ok || res.status === 400) { // 400 might mean model not found, but key is valid
            return { valid: true };
        }

        const text = await res.text();
        return { valid: false, error: `Validation failed: ${res.status} ${text.substring(0, 100)}` };
    } catch (error) {
        if (error instanceof Error) {
            return { valid: false, error: error.message };
        }
        return { valid: false, error: 'Unknown error during validation' };
    }
}

/**
 * Build context prompt based on preferences
 */
function buildContextPrompt(
    pageContext: PageContext,
    preferences: ContextPreferences,
    customSystemPrompt?: string
): string {
    let contextPrompt = '';

    // Add custom system prompt first if provided
    if (customSystemPrompt && customSystemPrompt.trim()) {
        contextPrompt += `${customSystemPrompt.trim()}\n\n`;
    }

    contextPrompt += `You are a helpful assistant with access to the current webpage. Use this context to answer questions:\n\n`;

    if (preferences.includeUrl && pageContext.url) {
        contextPrompt += `**Page URL:** ${pageContext.url}\n`;
    }

    if (preferences.includeTitle && pageContext.title) {
        contextPrompt += `**Page Title:** ${pageContext.title}\n`;
    }

    if (preferences.includeSelection && pageContext.selectionText) {
        contextPrompt += `**Selected Text:** ${pageContext.selectionText}\n`;
    }

    if (preferences.includeContent && pageContext.mainContentSnippet && pageContext.mainContentSnippet.length > 100) {
        // Truncate to save tokens
        const maxContentLength = 8000;
        const content = pageContext.mainContentSnippet.substring(0, maxContentLength);
        contextPrompt += `\n**Page Text Content:**\n${content}${pageContext.mainContentSnippet.length > maxContentLength ? '... (truncated)' : ''}\n`;
    }

    if (preferences.includeHtml && pageContext.htmlSource && pageContext.htmlSource.length > 100) {
        // Truncate HTML more aggressively
        const maxHtmlLength = 6000;
        const html = pageContext.htmlSource.substring(0, maxHtmlLength);
        contextPrompt += `\n**Page HTML Structure (cleaned):**\n\`\`\`html\n${html}${pageContext.htmlSource.length > maxHtmlLength ? '... (truncated)' : ''}\n\`\`\`\n`;
    }

    contextPrompt += `\nUse the above page content${preferences.includeHtml ? ' and HTML structure' : ''} to provide accurate, contextual answers.`;

    if (preferences.includeHtml) {
        contextPrompt += ` The HTML shows the page structure including classes, IDs, and data attributes that may be helpful.`;
    }

    contextPrompt += `\n\n**IMPORTANT - Mathematical Formulas:**\nWhen presenting mathematical formulas or equations, ALWAYS use LaTeX syntax:\n- For inline math: wrap in single dollar signs like $x^2 + y^2 = r^2$\n- For display math: wrap in double dollar signs like $$\\int_a^b f(x)dx$$\n- Use proper LaTeX commands: \\frac{}{}, \\int, \\sum, \\sqrt{}, etc.\n- Example: Instead of "x^2", write "$x^2$". Instead of "∫ x dx", write "$\\int x dx$"`;

    return contextPrompt;
}

/**
 * Main AI call function with retry, cancellation, and streaming support
 */
export async function callAI(request: AIRequestPayload): Promise<AIResponsePayload> {
    // Check offline status
    if (isOffline()) {
        throw new Error('You are offline. Please check your internet connection.');
    }

    const settings = await loadSettings();

    // 1. Find the active model
    const activeModel = settings.models.find(m => m.id === settings.activeModelId);

    if (!activeModel) {
        throw new Error(`No active model selected (ID: ${settings.activeModelId}). Please go to Settings and select a model.`);
    }
    if (!activeModel.enabled) {
        throw new Error(`Model "${activeModel.displayName}" is disabled. Please enable it or select another model.`);
    }

    // 2. Find the provider
    const provider = DEFAULT_PROVIDERS.find(p => p.id === activeModel.providerId);

    if (!provider) {
        throw new Error(`Provider "${activeModel.providerId}" not found.`);
    }

    // 3. Get API key and base URL
    const providerConfig = settings.providers[provider.id];
    const apiKey = providerConfig?.apiKey;
    const baseUrl = providerConfig?.customBaseUrl || provider.baseUrl;

    if (provider.requiresApiKey && !apiKey) {
        throw new Error(`API key for "${provider.name}" is not configured. Please go to Settings and add your API key.`);
    }

    // 4. Build messages
    const messagesForApi = request.messages.map(m => {
        if (m.attachments && m.attachments.length > 0) {
            return {
                role: m.role,
                content: [
                    { type: 'text', text: m.content || ' ' },
                    ...m.attachments.map(att => ({
                        type: 'image_url',
                        image_url: { url: att.content }
                    }))
                ]
            };
        } else {
            return { role: m.role, content: m.content };
        }
    });

    // 5. Add context if provided
    if (request.pageContext && request.contextPreferences) {
        const contextPrompt = buildContextPrompt(request.pageContext, request.contextPreferences, settings.customSystemPrompt);
        messagesForApi.unshift({
            role: 'system',
            content: contextPrompt
        });
    } else if (request.pageContext) {
        // Fallback to all-inclusive context if no preferences
        const defaultPreferences: ContextPreferences = {
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
        };
        const contextPrompt = buildContextPrompt(request.pageContext, defaultPreferences, settings.customSystemPrompt);
        messagesForApi.unshift({
            role: 'system',
            content: contextPrompt
        });
    } else if (settings.customSystemPrompt && settings.customSystemPrompt.trim()) {
        // If no page context but custom system prompt exists, add it
        messagesForApi.unshift({
            role: 'system',
            content: settings.customSystemPrompt.trim()
        });
    }

    // 6. Build request body
    const requestBody: Record<string, unknown> = {
        model: activeModel.backendName,
        messages: messagesForApi
    };

    // Add temperature if specified
    if (activeModel.temperature !== undefined) {
        requestBody.temperature = activeModel.temperature;
    }

    // Add thinking mode if enabled (for Claude models)
    if (activeModel.thinkingEnabled) {
        requestBody.thinking = {
            type: 'enabled',
            budget_tokens: activeModel.thinkingBudget || 10000
        };
    }

    // Add streaming if requested
    if (request.stream) {
        requestBody.stream = true;
    }

    const body = JSON.stringify(requestBody);

    // 7. Build headers
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) {
        if (provider.authHeader === 'x-api-key') {
            headers['x-api-key'] = apiKey;
        } else {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }
    }

    // 8. Create abort controller for cancellation
    currentAbortController = new AbortController();
    const signal = request.abortSignal || currentAbortController.signal;

    // 9. Make request with retry logic
    try {
        return await retryWithBackoff(async () => {
            const res = await fetch(baseUrl, {
                method: 'POST',
                headers,
                body,
                signal
            });

            if (!res.ok) {
                const text = await res.text();

                // Provide better error messages
                if (res.status === 401) {
                    throw new Error(`Authentication failed: Invalid API key for ${provider.name}`);
                } else if (res.status === 403) {
                    throw new Error(`Access forbidden: Please check your API key permissions for ${provider.name}`);
                } else if (res.status === 429) {
                    throw new Error(`Rate limit exceeded for ${provider.name}. Please try again later.`);
                } else if (res.status >= 500) {
                    throw new Error(`${provider.name} server error (${res.status}). Please try again.`);
                }

                throw new Error(`AI API error (${provider.name}): ${res.status} ${text.substring(0, 200)}`);
            }

            // Handle streaming response
            if (request.stream && res.body) {
                return handleStreamingResponse(res);
            }

            // Handle regular response
            const json = await res.json();
            return parseRegularResponse(json);
        }, 3, 1000);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Request cancelled by user');
        }
        throw error;
    } finally {
        currentAbortController = null;
    }
}

/**
 * Handle streaming response (for future implementation)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleStreamingResponse(_response: Response): Promise<AIResponsePayload> {
    // Streaming will be handled at the background script level
    throw new Error('Streaming not yet implemented in this context');
}

/**
 * Parse regular (non-streaming) response
 */
interface AIApiResponse {
    choices?: Array<{
        message?: {
            content: string | Array<{ type: string; thinking?: string; text?: string }>;
        };
    }>;
}

function parseRegularResponse(json: AIApiResponse): AIResponsePayload {
    // OpenAI-compatible response format
    const assistantMessageFromApi = json.choices?.[0]?.message;
    if (!assistantMessageFromApi) {
        throw new Error('AI API: no choices[0].message in response');
    }

    // Extract thinking content if present (Claude extended thinking)
    let thinkingContent: string | undefined;
    if (assistantMessageFromApi.content && Array.isArray(assistantMessageFromApi.content)) {
        // Handle Claude's content block format with thinking
        type ContentBlock = { type: string; thinking?: string; text?: string };
        const thinkingBlock = assistantMessageFromApi.content.find((block: ContentBlock) => block.type === 'thinking');
        const textBlock = assistantMessageFromApi.content.find((block: ContentBlock) => block.type === 'text');

        if (thinkingBlock) {
            thinkingContent = thinkingBlock.thinking;
        }

        const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: textBlock?.text || '',
            createdAt: Date.now(),
            source: 'ai',
            thinking: thinkingContent
        };

        return { message: assistantMessage, rawModelOutput: json };
    }

    const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantMessageFromApi.content,
        createdAt: Date.now(),
        source: 'ai'
    };

    return { message: assistantMessage, rawModelOutput: json };
}
