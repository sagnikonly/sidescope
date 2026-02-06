/**
 * Smart Image Detection for OCR
 * Identifies important images (diagrams, screenshots, charts) vs decorative (logos, icons)
 */

interface ImageCandidate {
    element: HTMLImageElement;
    url: string;
    altText: string;
    width: number;
    height: number;
    importance: number;
    reason: string;
}

/**
 * Score an image's importance (0-100)
 * Higher score = more likely to contain important text/information
 */
function scoreImageImportance(img: HTMLImageElement): { score: number; reason: string } {
    let score = 50; // Base score
    const reasons: string[] = [];

    const alt = (img.alt || '').toLowerCase();
    const src = (img.src || '').toLowerCase();
    const className = (img.className || '').toLowerCase();
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    // === POSITIVE SIGNALS (Increase importance) ===

    // Size-based scoring
    if (width >= 400 && height >= 300) {
        score += 25;
        reasons.push('large-size');
    } else if (width >= 200 && height >= 150) {
        score += 15;
        reasons.push('medium-size');
    }

    // In main content area
    const mainContent = img.closest('main, article, [role="main"], .content, .post, .entry');
    if (mainContent) {
        score += 20;
        reasons.push('in-main-content');
    }

    // In figure element (usually important)
    const figure = img.closest('figure');
    if (figure) {
        score += 20;
        reasons.push('in-figure');
        
        // Check for caption
        const caption = figure.querySelector('figcaption');
        if (caption && caption.textContent && caption.textContent.trim().length > 10) {
            score += 10;
            reasons.push('has-caption');
        }
    }

    // Descriptive alt text suggests important content
    const meaningfulAltWords = ['diagram', 'chart', 'graph', 'screenshot', 'code', 'example', 
                                'architecture', 'flow', 'structure', 'interface', 'result', 
                                'output', 'table', 'data', 'comparison', 'illustration'];
    if (meaningfulAltWords.some(word => alt.includes(word))) {
        score += 25;
        reasons.push('meaningful-alt-text');
    }

    // Source URL patterns for screenshots/diagrams
    const importantSrcPatterns = ['screenshot', 'diagram', 'chart', 'graph', 'code', 'example',
                                  'tutorial', 'guide', 'demo', 'result', 'output'];
    if (importantSrcPatterns.some(pattern => src.includes(pattern))) {
        score += 20;
        reasons.push('important-src-pattern');
    }

    // Class names indicating importance
    const importantClassPatterns = ['diagram', 'chart', 'screenshot', 'code-image', 'content-image',
                                    'documentation', 'example', 'tutorial'];
    if (importantClassPatterns.some(pattern => className.includes(pattern))) {
        score += 15;
        reasons.push('important-class');
    }

    // === NEGATIVE SIGNALS (Decrease importance) ===

    // Too small (likely icon/thumbnail)
    if (width < 100 || height < 100) {
        score -= 30;
        reasons.push('too-small');
    }

    // Decorative indicators in alt text
    const decorativeAltWords = ['logo', 'icon', 'avatar', 'profile', 'thumbnail', 'banner',
                               'decoration', 'bullet', 'arrow', 'button', 'badge'];
    if (decorativeAltWords.some(word => alt.includes(word))) {
        score -= 40;
        reasons.push('decorative-alt');
    }

    // Source URL patterns for decorative images
    const decorativeSrcPatterns = ['logo', 'icon', 'avatar', 'emoji', 'badge', 'button',
                                   'banner', 'ad', 'sponsor', 'social', 'thumbnail'];
    if (decorativeSrcPatterns.some(pattern => src.includes(pattern))) {
        score -= 35;
        reasons.push('decorative-src');
    }

    // Class names indicating decorative
    const decorativeClassPatterns = ['logo', 'icon', 'avatar', 'thumbnail', 'badge', 'banner',
                                     'ad', 'advertisement', 'sponsor', 'social-icon'];
    if (decorativeClassPatterns.some(pattern => className.includes(pattern))) {
        score -= 35;
        reasons.push('decorative-class');
    }

    // In header/footer/navigation (usually logos/icons)
    const decorativeContainer = img.closest('header, footer, nav, aside, [role="navigation"], .header, .footer, .nav, .sidebar');
    if (decorativeContainer) {
        score -= 25;
        reasons.push('in-decorative-container');
    }

    // SVG images (usually icons/logos, not photos/screenshots)
    if (src.includes('.svg')) {
        score -= 20;
        reasons.push('svg-format');
    }

    // Very wide or very tall (likely banner/decoration)
    const aspectRatio = width / height;
    if (aspectRatio > 4 || aspectRatio < 0.25) {
        score -= 15;
        reasons.push('extreme-aspect-ratio');
    }

    // Ensure score stays in range
    score = Math.max(0, Math.min(100, score));

    return {
        score,
        reason: reasons.join(', ')
    };
}

/**
 * Find important images on the page that should be OCR'd
 */
export function findImportantImages(maxImages: number = 3): ImageCandidate[] {
    const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
    const candidates: ImageCandidate[] = [];


    for (const img of images) {
        // Skip if image not loaded or has no src
        if (!img.src || !img.complete) continue;

        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        // Skip tiny images immediately
        if (width < 50 || height < 50) continue;

        const { score, reason } = scoreImageImportance(img);

        // Only consider images with score > 40
        if (score > 40) {
            candidates.push({
                element: img,
                url: img.src,
                altText: img.alt || '',
                width,
                height,
                importance: score,
                reason
            });
        }
    }

    // Sort by importance (highest first)
    candidates.sort((a, b) => b.importance - a.importance);

    // Take top N
    const selected = candidates.slice(0, maxImages);

    selected.forEach((img, i) => {
    });

    return selected;
}

/**
 * Convert image to data URL for OCR processing
 */
export async function imageToDataURL(img: HTMLImageElement): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            // Create canvas
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Set canvas size to image size
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;

            // Draw image
            ctx.drawImage(img, 0, 0);

            // Convert to data URL
            const dataURL = canvas.toDataURL('image/png');
            resolve(dataURL);
        } catch (error) {
            reject(error);
        }
    });
}
