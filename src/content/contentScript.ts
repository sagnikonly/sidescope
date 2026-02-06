/**
 * Enhanced Content Script with Smart Extraction + Image OCR
 * Includes quality scoring, chunking, metadata extraction, token management, and intelligent image OCR
 */

import { PageContext, ExecuteActionMessage, ContentQuality, ContentMetadata, ContentChunk, TokenBudget, ImageOCRResult } from '../shared/types';
import { executeAction } from './actionExecutor';
import { createCropOverlay, cropImage } from './cropOverlay';
import { findImportantImages, imageToDataURL } from './imageDetection';

// ========== UTILITY FUNCTIONS ==========

function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(36);
}

function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

// ========== CONTENT QUALITY SCORING ==========

function calculateContentQuality(): ContentQuality {
    let score = 50;
    let readability = 50;
    let density = 50;

    const mainContent = document.querySelector('main, article, [role="main"], .main-content, #main-content');
    const hasMainContent = !!mainContent && (mainContent.textContent?.length || 0) > 200;

    const navElements = document.querySelectorAll('nav, [role="navigation"], .nav, .menu');
    const hasNavigation = navElements.length > 0;

    const adSelectors = ['[class*="ad-"]', '[id*="ad-"]', '[class*="advertisement"]', '.banner', '.sidebar', '.widget'];
    let adCount = 0;
    adSelectors.forEach(selector => {
        adCount += document.querySelectorAll(selector).length;
    });
    const hasAds = adCount > 2;

    if (hasMainContent) score += 20;
    if (!hasAds) score += 15;
    if (hasNavigation) score += 5;

    const paragraphs = document.querySelectorAll('p');
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const lists = document.querySelectorAll('ul, ol');

    if (paragraphs.length > 3) readability += 20;
    if (headings.length > 2) readability += 15;
    if (lists.length > 0) readability += 10;

    const textLength = document.body.textContent?.length || 0;
    const wordCount = (document.body.textContent || '').split(/\s+/).length;
    const avgWordLength = textLength / Math.max(wordCount, 1);

    if (avgWordLength > 4) density += 20;
    if (wordCount > 300) density += 15;
    if (document.querySelectorAll('code, pre').length > 0) density += 15;

    return {
        score: Math.min(100, Math.max(0, score)),
        readability: Math.min(100, Math.max(0, readability)),
        density: Math.min(100, Math.max(0, density)),
        hasMainContent,
        hasNavigation,
        hasAds
    };
}

// ========== IMAGE OCR PROCESSING ==========

async function processImagesWithOCR(maxImages: number = 3): Promise<ImageOCRResult[]> {
    // Find important images
    const candidates = findImportantImages(maxImages);
    
    if (candidates.length === 0) {
        return [];
    }

    const results: ImageOCRResult[] = [];

    // Import Tesseract dynamically
    const Tesseract = await import('tesseract.js');

    for (const candidate of candidates) {
        try {
            // Convert image to data URL
            const dataURL = await imageToDataURL(candidate.element);

            // Run OCR (no logger for production)
            const ocrResult = await Tesseract.recognize(dataURL, 'eng');

            const ocrText = ocrResult.data.text.trim();
            
            // Only include if OCR found meaningful text (> 10 chars)
            if (ocrText.length > 10) {
                results.push({
                    imageUrl: candidate.url,
                    altText: candidate.altText,
                    width: candidate.width,
                    height: candidate.height,
                    importance: candidate.importance,
                    ocrText,
                    confidence: ocrResult.data.confidence,
                    reason: candidate.reason
                });
            }

        } catch (error) {
            console.error('[ImageOCR] Error processing image:', error);
            // Continue with next image
        }
    }

    return results;
}

// ========== METADATA EXTRACTION ==========

function extractMetadata(): ContentMetadata {
    const metadata: ContentMetadata = { type: 'unknown' };

    const getMetaContent = (name: string): string | undefined => {
        const meta = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
        return meta?.getAttribute('content') || undefined;
    };

    metadata.author = getMetaContent('author') || getMetaContent('og:author');
    metadata.description = getMetaContent('description') || getMetaContent('og:description');
    metadata.publishDate = getMetaContent('article:published_time') || getMetaContent('date');
    metadata.language = document.documentElement.lang || getMetaContent('og:locale');

    const keywordsStr = getMetaContent('keywords');
    if (keywordsStr) {
        metadata.keywords = keywordsStr.split(',').map(k => k.trim()).filter(Boolean);
    }

    const ogType = getMetaContent('og:type');
    if (ogType === 'article') {
        metadata.type = 'article';
    } else if (document.querySelector('[itemtype*="Product"]') || document.querySelector('.price, .product')) {
        metadata.type = 'ecommerce';
    } else if (document.querySelector('[class*="forum"], [class*="discussion"], [class*="comment"]')) {
        metadata.type = 'forum';
    } else if (document.querySelector('pre code') || document.querySelector('.documentation, [class*="docs"]')) {
        metadata.type = 'documentation';
    } else if (document.querySelector('[role="application"], [data-app]')) {
        metadata.type = 'app';
    }

    const wordCount = (document.body.textContent || '').split(/\s+/).length;
    metadata.readingTime = Math.ceil(wordCount / 200);

    // Count images
    const allImages = document.querySelectorAll('img');
    metadata.imageCount = allImages.length;

    return metadata;
}

// ========== CONTENT CHUNKING ==========

function extractContentChunks(maxChunks: number = 50): ContentChunk[] {
    const chunks: ContentChunk[] = [];

    // Headings
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach((heading) => {
        const level = parseInt(heading.tagName[1]);
        const text = heading.textContent?.trim() || '';
        if (text && text.length > 2) {
            chunks.push({
                type: 'heading',
                priority: 90 - (level * 10),
                text,
                tokens: estimateTokens(text),
                level
            });
        }
    });

    // Paragraphs
    const paragraphs = document.querySelectorAll('p');
    paragraphs.forEach((p, index) => {
        const text = p.textContent?.trim() || '';
        if (text && text.length > 30) {
            const priority = Math.max(40, 70 - Math.floor(index / 3) * 5);
            chunks.push({
                type: 'paragraph',
                priority,
                text,
                tokens: estimateTokens(text)
            });
        }
    });

    // Code blocks
    const codeBlocks = document.querySelectorAll('pre, code');
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

    // Lists
    const lists = document.querySelectorAll('ul, ol');
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

    // Blockquotes
    const quotes = document.querySelectorAll('blockquote');
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

    chunks.sort((a, b) => b.priority - a.priority);
    return chunks.slice(0, maxChunks);
}

// ========== BUILD OPTIMIZED CONTENT ==========

function buildOptimizedContent(chunks: ContentChunk[], maxTokens: number): string {
    let totalTokens = 0;
    const selectedChunks: ContentChunk[] = [];

    for (const chunk of chunks) {
        if (totalTokens + chunk.tokens <= maxTokens) {
            selectedChunks.push(chunk);
            totalTokens += chunk.tokens;
        } else {
            break;
        }
    }

    let content = '';
    let lastType: string | null = null;

    selectedChunks.forEach(chunk => {
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

// ========== EXTRACT SIMPLE TEXT (FAST MODE) ==========

function extractSimpleText(): string {
    const mainContent = document.querySelector('main, article, [role="main"], .main-content, #main-content');
    if (mainContent && mainContent.textContent && mainContent.textContent.trim().length > 200) {
        return mainContent.textContent.trim().substring(0, 8000);
    }
    return document.body.innerText?.trim().substring(0, 8000) || '(No content found)';
}

// ========== EXTRACT HTML SOURCE ==========

function extractHtmlSource(): string {
    try {
        const clone = document.documentElement.cloneNode(true) as HTMLElement;
        const elementsToRemove = clone.querySelectorAll('script, style, noscript, svg, iframe, link, meta, head');
        elementsToRemove.forEach(el => el.remove());

        const allElements = clone.querySelectorAll('*');
        allElements.forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.startsWith('on') || attr.name === 'style' ||
                    attr.name.startsWith('data-v-') || attr.name.startsWith('ng-')) {
                    el.removeAttribute(attr.name);
                }
            });
        });

        let html = clone.innerHTML;
        html = html.replace(/\s+/g, ' ').replace(/>\s+</g, '><').replace(/<!--.*?-->/g, '').trim();

        const maxLength = 15000;
        if (html.length > maxLength) {
            const cutPoint = html.lastIndexOf('>', maxLength);
            html = html.substring(0, cutPoint > maxLength - 1000 ? cutPoint + 1 : maxLength) + '... (truncated)';
        }

        return html;
    } catch (error) {
        console.error('[ContentScript] Error extracting HTML:', error);
        return '(Error extracting HTML source)';
    }
}

// ========== MAIN CONTEXT EXTRACTION (UPDATED) ==========

async function getPageContext(
    quality: 'fast' | 'balanced' | 'thorough' = 'balanced',
    includeImageOCR: boolean = true,
    maxImagesForOCR: number = 3
): Promise<PageContext> {
    const selection = window.getSelection();
    const selectionText = selection ? selection.toString().trim() : '';

    let mainContentSnippet: string;
    let chunks: ContentChunk[] | undefined;
    let contentQuality: ContentQuality | undefined;
    let metadata: ContentMetadata | undefined;
    let imageOCR: ImageOCRResult[] | undefined;

    // Extract based on quality setting
    if (quality === 'fast') {
        // Fast mode: basic text extraction only, no OCR
        mainContentSnippet = extractSimpleText();
    } else if (quality === 'balanced') {
        // Balanced mode: chunking + metadata + selective OCR
        chunks = extractContentChunks(30);
        mainContentSnippet = buildOptimizedContent(chunks, 6000);
        metadata = extractMetadata();
        contentQuality = calculateContentQuality();
        
        // Only OCR if enabled and likely useful (documentation, articles)
        if (includeImageOCR && metadata.imageCount && metadata.imageCount > 0) {
            if (metadata.type === 'documentation' || metadata.type === 'article') {
                imageOCR = await processImagesWithOCR(Math.min(maxImagesForOCR, 2)); // Max 2 for balanced
            }
        }
    } else {
        // Thorough mode: full extraction + more aggressive OCR
        chunks = extractContentChunks(50);
        mainContentSnippet = buildOptimizedContent(chunks, 8000);
        metadata = extractMetadata();
        contentQuality = calculateContentQuality();
        
        // OCR more images in thorough mode
        if (includeImageOCR && metadata.imageCount && metadata.imageCount > 0) {
            imageOCR = await processImagesWithOCR(maxImagesForOCR);
        }
    }

    // Update metadata with OCR count
    if (metadata && imageOCR) {
        metadata.importantImageCount = imageOCR.length;
    }

    // Calculate hash for change detection
    const hash = simpleHash(mainContentSnippet);

    // Calculate token budget
    const tokens: TokenBudget = {
        total: 0,
        used: {
            url: estimateTokens(window.location.href),
            title: estimateTokens(document.title),
            selection: selectionText ? estimateTokens(selectionText) : 0,
            content: estimateTokens(mainContentSnippet),
            html: 0,
            metadata: metadata ? estimateTokens(JSON.stringify(metadata)) : 0
        },
        remaining: 0,
        percentage: 0
    };
    
    // Add tokens from OCR text
    if (imageOCR && imageOCR.length > 0) {
        const ocrText = imageOCR.map(img => img.ocrText).join('\n');
        tokens.used.metadata += estimateTokens(ocrText); // Add to metadata section
    }
    
    tokens.total = Object.values(tokens.used).reduce((sum, val) => sum + val, 0);

    const context: PageContext = {
        url: window.location.href,
        title: document.title,
        selectionText: selectionText || undefined,
        mainContentSnippet,
        chunks,
        quality: contentQuality,
        metadata,
        imageOCR,
        hash,
        timestamp: Date.now(),
        tokens
    };

    return context;
}

// ========== MESSAGE HANDLERS ==========

interface ContentScriptMessage {
    type: string;
    quality?: 'fast' | 'balanced' | 'thorough';
    includeImageOCR?: boolean;
    maxImagesForOCR?: number;
    includeHtml?: boolean;
    action?: import('../shared/types').BrowserAction;
}

chrome.runtime.onMessage.addListener((message: ContentScriptMessage, sender, sendResponse) => {

    // Get page context
    if (message && message.type === 'GET_PAGE_CONTEXT') {
        (async () => {
            try {
                const quality = message.quality || 'balanced';
                const includeImageOCR = message.includeImageOCR !== false; // Default true
                const maxImagesForOCR = message.maxImagesForOCR || 3;
                
                const context = await getPageContext(quality, includeImageOCR, maxImagesForOCR);
                
                // Add HTML if requested (lazy loading)
                if (message.includeHtml) {
                    context.htmlSource = extractHtmlSource();
                    context.tokens!.used.html = estimateTokens(context.htmlSource);
                    context.tokens!.total += context.tokens!.used.html;
                }

                sendResponse(context);
            } catch (error) {
                console.error('[ContentScript] Error getting context:', error);
                sendResponse({
                    url: window.location.href,
                    title: document.title,
                    mainContentSnippet: '(Error getting page context)'
                });
            }
        })();
        return true;
    }

    // Execute action (for agent)
    if (message && message.type === 'EXECUTE_ACTION') {
        const actionMessage = message as ExecuteActionMessage;

        executeAction(actionMessage.action)
            .then(result => {
                sendResponse(result);
            })
            .catch(error => {
                console.error('[ContentScript] Action error:', error);
                sendResponse({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            });

        return true;
    }

    // Handle OCR crop selection
    if (message && message.type === 'START_CROP_SELECTION') {

        createCropOverlay()
            .then(async (cropResult) => {
                if (cropResult.cancelled) {
                    sendResponse({ success: false, cancelled: true });
                    return;
                }

                try {
                    interface ScreenshotResponse {
                        type?: string;
                        payload?: { dataUrl?: string };
                    }
                    const screenshotResponse = await new Promise<ScreenshotResponse>((resolve) => {
                        chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, resolve);
                    });

                    if (screenshotResponse?.type === 'SCREENSHOT' && screenshotResponse.payload?.dataUrl) {
                        const croppedImage = await cropImage(
                            screenshotResponse.payload.dataUrl,
                            cropResult,
                            window.devicePixelRatio
                        );

                        const Tesseract = await import('tesseract.js');
                        const ocrResult = await Tesseract.recognize(croppedImage, 'eng');

                        sendResponse({
                            success: true,
                            text: ocrResult.data.text.trim(),
                            confidence: ocrResult.data.confidence
                        });
                    } else {
                        sendResponse({ success: false, error: 'Failed to capture screenshot' });
                    }
                } catch (err: unknown) {
                    const errorMessage = err instanceof Error ? err.message : String(err);
                    console.error('[ContentScript] OCR error:', err);
                    sendResponse({ success: false, error: errorMessage });
                }
            })
            .catch(error => {
                console.error('[ContentScript] Crop selection error:', error);
                sendResponse({ success: false, error: error?.message || String(error) });
            });

        return true;
    }
});

