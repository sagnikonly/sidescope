/**
 * Content Extraction Utilities
 * Smart content extraction with quality scoring, chunking, and metadata
 */

import { ContentQuality, ContentChunk, ContentMetadata, TokenBudget } from '../shared/types';

/**
 * Simple fast hash function for change detection
 */
export function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

/**
 * Calculate content quality score
 */
export function calculateContentQuality(doc: Document): ContentQuality {
    let score = 50; // Base score
    let readability = 50;
    let density = 50;

    // Detect main content
    const mainContent = doc.querySelector('main, article, [role="main"], .main-content, #main-content');
    const hasMainContent = !!mainContent && (mainContent.textContent?.length || 0) > 200;

    // Detect navigation
    const navElements = doc.querySelectorAll('nav, [role="navigation"], .nav, .menu');
    const hasNavigation = navElements.length > 0;

    // Detect ads/clutter
    const adSelectors = [
        '[class*="ad-"]', '[id*="ad-"]', '[class*="advertisement"]',
        '.banner', '.sidebar', '.widget', '[class*="sponsor"]'
    ];
    let adCount = 0;
    adSelectors.forEach(selector => {
        adCount += doc.querySelectorAll(selector).length;
    });
    const hasAds = adCount > 2;

    // Calculate scores
    if (hasMainContent) score += 20;
    if (!hasAds) score += 15;
    if (hasNavigation) score += 5;

    // Readability based on text structure
    const paragraphs = doc.querySelectorAll('p');
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const lists = doc.querySelectorAll('ul, ol');

    if (paragraphs.length > 3) readability += 20;
    if (headings.length > 2) readability += 15;
    if (lists.length > 0) readability += 10;

    // Information density
    const textLength = doc.body.textContent?.length || 0;
    const wordCount = (doc.body.textContent || '').split(/\s+/).length;
    const avgWordLength = textLength / Math.max(wordCount, 1);

    if (avgWordLength > 4) density += 20; // Longer words = more technical content
    if (wordCount > 300) density += 15; // Substantial content
    if (doc.querySelectorAll('code, pre').length > 0) density += 15; // Has code

    return {
        score: Math.min(100, Math.max(0, score)),
        readability: Math.min(100, Math.max(0, readability)),
        density: Math.min(100, Math.max(0, density)),
        hasMainContent,
        hasNavigation,
        hasAds
    };
}

/**
 * Extract metadata from page
 */
export function extractMetadata(doc: Document): ContentMetadata {
    const metadata: ContentMetadata = {
        type: 'unknown'
    };

    // Get Open Graph / Meta tags
    const getMetaContent = (name: string): string | undefined => {
        const meta = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
        return meta?.getAttribute('content') || undefined;
    };

    metadata.author = getMetaContent('author') || getMetaContent('og:author');
    metadata.description = getMetaContent('description') || getMetaContent('og:description');
    metadata.publishDate = getMetaContent('article:published_time') || getMetaContent('date');
    metadata.language = doc.documentElement.lang || getMetaContent('og:locale');

    // Extract keywords
    const keywordsStr = getMetaContent('keywords');
    if (keywordsStr) {
        metadata.keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
    }

    // Detect content type
    const ogType = getMetaContent('og:type');
    if (ogType === 'article') {
        metadata.type = 'article';
    } else if (doc.querySelector('[itemtype*="Product"]') || doc.querySelector('.price, .product')) {
        metadata.type = 'ecommerce';
    } else if (doc.querySelector('[class*="forum"], [class*="discussion"], [class*="comment"]')) {
        metadata.type = 'forum';
    } else if (doc.querySelector('pre code') || doc.querySelector('.documentation, [class*="docs"]')) {
        metadata.type = 'documentation';
    } else if (doc.querySelector('[role="application"], [data-app]')) {
        metadata.type = 'app';
    }

    // Estimate reading time (rough: 200 words per minute)
    const wordCount = (doc.body.textContent || '').split(/\s+/).length;
    metadata.readingTime = Math.ceil(wordCount / 200);

    return metadata;
}

/**
 * Extract content as semantic chunks with priority scoring
 */
export function extractContentChunks(doc: Document, maxChunks: number = 50): ContentChunk[] {
    const chunks: ContentChunk[] = [];

    // Extract headings with hierarchy
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading) => {
        const level = parseInt(heading.tagName[1]);
        const text = heading.textContent?.trim() || '';
        if (text && text.length > 2) {
            chunks.push({
                type: 'heading',
                priority: 90 - (level * 10), // h1=80, h2=70, etc.
                text,
                tokens: estimateTokens(text),
                level
            });
        }
    });

    // Extract paragraphs (prioritize first paragraphs)
    const paragraphs = doc.querySelectorAll('p');
    paragraphs.forEach((p, index) => {
        const text = p.textContent?.trim() || '';
        if (text && text.length > 30) { // Skip very short paragraphs
            const priority = Math.max(40, 70 - Math.floor(index / 3) * 5); // First paragraphs higher priority
            chunks.push({
                type: 'paragraph',
                priority,
                text,
                tokens: estimateTokens(text)
            });
        }
    });

    // Extract code blocks (high priority for docs)
    const codeBlocks = doc.querySelectorAll('pre, code');
    codeBlocks.forEach((code) => {
        const text = code.textContent?.trim() || '';
        if (text && text.length > 10) {
            chunks.push({
                type: 'code',
                priority: 75,
                text,
                tokens: estimateTokens(text)
            });
        }
    });

    // Extract lists
    const lists = doc.querySelectorAll('ul, ol');
    lists.forEach((list) => {
        const text = list.textContent?.trim() || '';
        if (text && text.length > 20) {
            chunks.push({
                type: 'list',
                priority: 60,
                text,
                tokens: estimateTokens(text)
            });
        }
    });

    // Extract blockquotes
    const quotes = doc.querySelectorAll('blockquote');
    quotes.forEach((quote) => {
        const text = quote.textContent?.trim() || '';
        if (text && text.length > 20) {
            chunks.push({
                type: 'quote',
                priority: 55,
                text,
                tokens: estimateTokens(text)
            });
        }
    });

    // Sort by priority and limit
    chunks.sort((a, b) => b.priority - a.priority);
    return chunks.slice(0, maxChunks);
}

/**
 * Build optimized content from chunks based on token budget
 */
export function buildOptimizedContent(chunks: ContentChunk[], maxTokens: number): string {
    let totalTokens = 0;
    const selectedChunks: ContentChunk[] = [];

    // Pack chunks by priority until budget exhausted
    for (const chunk of chunks) {
        if (totalTokens + chunk.tokens <= maxTokens) {
            selectedChunks.push(chunk);
            totalTokens += chunk.tokens;
        } else {
            break;
        }
    }

    // Build content maintaining structure
    let content = '';
    let lastType: string | null = null;

    selectedChunks.forEach(chunk => {
        // Add spacing between different types
        if (lastType && lastType !== chunk.type) {
            content += '\n\n';
        }

        if (chunk.type === 'heading') {
            content += '\n## ' + chunk.text + '\n';
        } else if (chunk.type === 'code') {
            content += '\n```\n' + chunk.text + '\n```\n';
        } else if (chunk.type === 'quote') {
            content += '\n> ' + chunk.text + '\n';
        } else {
            content += chunk.text + '\n';
        }

        lastType = chunk.type;
    });

    return content.trim();
}

/**
 * Calculate token budget breakdown
 */
export function calculateTokenBudget(
    url: string,
    title: string,
    selection: string | undefined,
    content: string,
    html: string,
    metadata: ContentMetadata | undefined
): TokenBudget {
    const used = {
        url: estimateTokens(url),
        title: estimateTokens(title),
        selection: selection ? estimateTokens(selection) : 0,
        content: estimateTokens(content),
        html: estimateTokens(html),
        metadata: metadata ? estimateTokens(JSON.stringify(metadata)) : 0
    };

    const total = Object.values(used).reduce((sum, val) => sum + val, 0);

    return {
        total,
        used,
        remaining: 0, // Will be calculated based on model limits
        percentage: 0 // Will be calculated based on max tokens setting
    };
}
