/**
 * Context Cache Service
 * Caches page context with TTL to avoid redundant extractions
 */

import { PageContext } from '../shared/types';

interface CachedContext {
    context: PageContext;
    timestamp: number;
    url: string;
    tabId: number;
}

class ContextCacheService {
    private cache: Map<string, CachedContext> = new Map();
    private defaultTTL = 30000; // 30 seconds

    /**
     * Generate cache key from URL and tabId
     */
    private getCacheKey(url: string, tabId: number): string {
        return `${tabId}:${url}`;
    }

    /**
     * Store context in cache
     */
    set(context: PageContext, tabId: number, ttl?: number): void {
        const key = this.getCacheKey(context.url, tabId);
        this.cache.set(key, {
            context,
            timestamp: Date.now(),
            url: context.url,
            tabId
        });

        // Auto-cleanup after TTL
        setTimeout(() => {
            this.delete(context.url, tabId);
        }, ttl || this.defaultTTL);
    }

    /**
     * Get context from cache if fresh
     */
    get(url: string, tabId: number, maxAge?: number): PageContext | null {
        const key = this.getCacheKey(url, tabId);
        const cached = this.cache.get(key);

        if (!cached) {
            return null;
        }

        const age = Date.now() - cached.timestamp;
        const limit = maxAge || this.defaultTTL;

        if (age > limit) {
            this.cache.delete(key);
            return null;
        }

        return cached.context;
    }

    /**
     * Delete specific cache entry
     */
    delete(url: string, tabId: number): void {
        const key = this.getCacheKey(url, tabId);
        this.cache.delete(key);
    }

    /**
     * Clear all cache for a tab
     */
    clearTab(tabId: number): void {
        const keysToDelete: string[] = [];
        this.cache.forEach((value, key) => {
            if (value.tabId === tabId) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    /**
     * Clear entire cache
     */
    clearAll(): void {
        this.cache.clear();
    }

    /**
     * Get cache stats
     */
    getStats(): { size: number; entries: Array<{ url: string; age: number }> } {
        const entries: Array<{ url: string; age: number }> = [];
        const now = Date.now();
        
        this.cache.forEach((value) => {
            entries.push({
                url: value.url,
                age: Math.round((now - value.timestamp) / 1000)
            });
        });

        return {
            size: this.cache.size,
            entries
        };
    }

    /**
     * Check if context hash changed (for differential updates)
     */
    hasChanged(url: string, tabId: number, newHash: string): boolean {
        const cached = this.get(url, tabId);
        if (!cached || !cached.hash) return true;
        return cached.hash !== newHash;
    }
}

// Singleton instance
export const contextCache = new ContextCacheService();
