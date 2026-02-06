/**
 * Enhanced Page Context Bridge with Caching
 * Improved performance, caching, and progressive loading
 */

import { PageContext } from '../shared/types';
import { contextCache } from './contextCache';

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// Capture screenshot of the visible tab
export async function captureScreenshot(): Promise<string | undefined> {
    try {
        const dataUrl = await chrome.tabs.captureVisibleTab({
            format: 'jpeg',
            quality: 70
        });
        return dataUrl;
    } catch (error) {
        return undefined;
    }
}

// Get basic info from tab object (instant, no content script needed)
export async function getBasicPageContext(): Promise<PageContext | undefined> {
    try {
        const tab = await getActiveTab();
        if (!tab) return undefined;
        
        return {
            url: tab.url || '',
            title: tab.title || '',
            mainContentSnippet: '(Loading page content...)',
            timestamp: Date.now()
        };
    } catch {
        return undefined;
    }
}

// Fallback: Direct script injection for content extraction
async function extractContentDirectly(
    tabId: number,
    quality: 'fast' | 'balanced' | 'thorough' = 'balanced'
): Promise<PageContext> {
    try {
        
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: (qual: string) => {
                // Quick extraction function
                const mainContent = document.querySelector('main, article, [role="main"], .main-content, #main-content');
                if (mainContent && mainContent.textContent && mainContent.textContent.trim().length > 200) {
                    return mainContent.textContent.trim().substring(0, qual === 'thorough' ? 8000 : 6000);
                }
                return document.body.innerText?.trim().substring(0, qual === 'thorough' ? 8000 : 6000) || '(No content found)';
            },
            args: [quality]
        });

        const content = results?.[0]?.result || '(Could not extract content)';
        
        // Get tab info
        const tab = await chrome.tabs.get(tabId);
        
        return {
            url: tab.url || '',
            title: tab.title || '',
            mainContentSnippet: content,
            timestamp: Date.now()
        };
    } catch (error) {
        const tab = await chrome.tabs.get(tabId);
        return {
            url: tab.url || '',
            title: tab.title || '',
            mainContentSnippet: '(Could not access page content - extension may not have permission)',
            timestamp: Date.now()
        };
    }
}

/**
 * Get full context from content script with caching and progressive loading
 */
export async function requestPageContextFromActiveTab(options?: {
    forceRefresh?: boolean;
    quality?: 'fast' | 'balanced' | 'thorough';
    includeScreenshot?: boolean;
    includeHtml?: boolean;
}): Promise<PageContext | undefined> {
    const {
        forceRefresh = false,
        quality = 'balanced',
        includeScreenshot = false,
        includeHtml = false
    } = options || {};

    try {
        const tab = await getActiveTab();
        if (!tab || !tab.id) {
            return undefined;
        }

        const tabId = tab.id;
        const url = tab.url || '';

        // Check if URL is internal page
        if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
            return {
                url,
                title: tab.title || 'Chrome Internal Page',
                mainContentSnippet: '(Cannot access content from chrome internal pages)',
                timestamp: Date.now()
            };
        }

        // Try cache first (if not forcing refresh)
        if (!forceRefresh) {
            const cached = contextCache.get(url, tabId, 30000); // 30s TTL
            if (cached) {
                
                // Add screenshot if requested and not in cache
                if (includeScreenshot && !cached.screenshot) {
                    const screenshot = await captureScreenshot();
                    if (screenshot) {
                        cached.screenshot = screenshot;
                    }
                }
                
                return cached;
            }
        }

        // Try to get full context from content script
        let context: PageContext | null = null;
        
        try {
            
            const response = await Promise.race([
                chrome.tabs.sendMessage(tabId, {
                    type: 'GET_PAGE_CONTEXT',
                    quality,
                    includeHtml
                }),
                new Promise<null>((_, reject) => 
                    setTimeout(() => reject(new Error('timeout')), 5000)
                )
            ]) as PageContext | null;

            if (response && response.mainContentSnippet && response.mainContentSnippet.length > 100) {
                context = response;
            }
        } catch (error) {
        }

        // Fallback to direct extraction if content script failed
        if (!context || !context.mainContentSnippet || context.mainContentSnippet.length < 100) {
            context = await extractContentDirectly(tabId, quality);
        }

        // Add screenshot if requested
        if (includeScreenshot) {
            const screenshot = await captureScreenshot();
            if (screenshot) {
                context.screenshot = screenshot;
            }
        }

        // Cache the result
        if (context) {
            contextCache.set(context, tabId, 30000); // 30s TTL
        }

        return context;
    } catch (error) {
        console.error('[PageContextBridge] Error getting context:', error);
        
        // Fallback to basic info
        const tab = await getActiveTab();
        return {
            url: tab?.url || '',
            title: tab?.title || '',
            mainContentSnippet: '(Could not access page content)',
            timestamp: Date.now()
        };
    }
}

/**
 * Clear context cache
 */
export function clearContextCache(): void {
    contextCache.clearAll();
}
