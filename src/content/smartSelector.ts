/**
 * Smart Selector Engine
 * Intelligently finds elements using multiple strategies
 * Optimized for reliability with modern SPAs
 */

interface ElementMatch {
    element: Element;
    score: number;
    method: string;
}

/**
 * Find an element using smart multi-strategy matching
 * @param selector - CSS selector, text content, or description
 * @param options - Search options
 */
export function smartFind(
    selector: string,
    options: { timeout?: number; visible?: boolean } = {}
): Element | null {
    const { visible = true } = options;

    // Try strategies in order of reliability
    const strategies: Array<() => Element | null> = [
        // 1. Direct CSS selector (if it looks like one)
        () => tryCSS(selector),

        // 2. Find by exact text content
        () => findByText(selector, { exact: true, visible }),

        // 3. Find by partial text (case insensitive)
        () => findByText(selector, { exact: false, visible }),

        // 4. Find by ARIA label
        () => findByAriaLabel(selector, visible),

        // 5. Find by placeholder
        () => findByPlaceholder(selector, visible),

        // 6. Find by title attribute
        () => findByTitle(selector, visible),

        // 7. Find by data attributes
        () => findByDataAttribute(selector, visible),

        // 8. Find by role + text
        () => findByRoleAndText(selector, visible),
    ];

    for (const strategy of strategies) {
        try {
            const element = strategy();
            if (element && (!visible || isVisible(element))) {
                return element;
            }
        } catch {
            // Strategy failed, try next
        }
    }

    return null;
}

/**
 * Try to use as CSS selector
 */
function tryCSS(selector: string): Element | null {
    // Only try if it looks like a CSS selector
    if (selector.startsWith('.') || selector.startsWith('#') ||
        selector.includes('[') || selector.includes('>') ||
        /^[a-z]+$/i.test(selector)) {
        try {
            return document.querySelector(selector);
        } catch {
            return null;
        }
    }
    return null;
}

/**
 * Find element by text content
 */
function findByText(
    text: string,
    options: { exact: boolean; visible: boolean }
): Element | null {
    const normalizedText = text.toLowerCase().trim();

    // Get all clickable/interactive elements
    const elements = document.querySelectorAll(
        'a, button, [role="button"], [role="link"], input[type="submit"], ' +
        'input[type="button"], [onclick], [tabindex], h1, h2, h3, h4, h5, h6, ' +
        'p, span, div, li, td, th, label'
    );

    let bestMatch: ElementMatch | null = null;

    for (const el of elements) {
        if (options.visible && !isVisible(el)) continue;

        const elText = (el.textContent || '').toLowerCase().trim();

        if (options.exact) {
            if (elText === normalizedText) {
                return el;
            }
        } else {
            // Fuzzy matching
            if (elText.includes(normalizedText) || normalizedText.includes(elText)) {
                const score = calculateMatchScore(normalizedText, elText);
                if (!bestMatch || score > bestMatch.score) {
                    bestMatch = { element: el, score, method: 'text' };
                }
            }
        }
    }

    return bestMatch?.element || null;
}

/**
 * Find by ARIA label
 */
function findByAriaLabel(text: string, visible: boolean): Element | null {
    const normalizedText = text.toLowerCase().trim();
    const elements = document.querySelectorAll('[aria-label]');

    for (const el of elements) {
        if (visible && !isVisible(el)) continue;
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        if (label.includes(normalizedText)) {
            return el;
        }
    }
    return null;
}

/**
 * Find by placeholder attribute
 */
function findByPlaceholder(text: string, visible: boolean): Element | null {
    const normalizedText = text.toLowerCase().trim();
    const elements = document.querySelectorAll('[placeholder]');

    for (const el of elements) {
        if (visible && !isVisible(el)) continue;
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        if (placeholder.includes(normalizedText)) {
            return el;
        }
    }
    return null;
}

/**
 * Find by title attribute
 */
function findByTitle(text: string, visible: boolean): Element | null {
    const normalizedText = text.toLowerCase().trim();
    const elements = document.querySelectorAll('[title]');

    for (const el of elements) {
        if (visible && !isVisible(el)) continue;
        const title = (el.getAttribute('title') || '').toLowerCase();
        if (title.includes(normalizedText)) {
            return el;
        }
    }
    return null;
}

/**
 * Find by data attributes
 */
function findByDataAttribute(text: string, visible: boolean): Element | null {
    const normalizedText = text.toLowerCase().trim();
    const allElements = document.querySelectorAll('*');

    for (const el of allElements) {
        if (visible && !isVisible(el)) continue;

        for (const attr of el.attributes) {
            if (attr.name.startsWith('data-')) {
                const value = attr.value.toLowerCase();
                if (value.includes(normalizedText)) {
                    return el;
                }
            }
        }
    }
    return null;
}

/**
 * Find by role and text combination
 */
function findByRoleAndText(text: string, visible: boolean): Element | null {
    const normalizedText = text.toLowerCase().trim();
    const roles = ['button', 'link', 'tab', 'menuitem', 'option'];

    for (const role of roles) {
        const elements = document.querySelectorAll(`[role="${role}"]`);
        for (const el of elements) {
            if (visible && !isVisible(el)) continue;
            const elText = (el.textContent || '').toLowerCase();
            if (elText.includes(normalizedText)) {
                return el;
            }
        }
    }
    return null;
}

/**
 * Check if element is visible
 */
export function isVisible(element: Element): boolean {
    const el = element as HTMLElement;
    if (!el.offsetParent && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
        return false;
    }

    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }

    return true;
}

/**
 * Calculate match score for fuzzy matching
 */
function calculateMatchScore(search: string, target: string): number {
    // Exact match
    if (search === target) return 100;

    // Target contains search exactly
    if (target.includes(search)) {
        return 80 + (search.length / target.length) * 20;
    }

    // Search contains target
    if (search.includes(target)) {
        return 60 + (target.length / search.length) * 20;
    }

    // Word-based matching
    const searchWords = search.split(/\s+/);
    const targetWords = target.split(/\s+/);
    let matchedWords = 0;

    for (const sw of searchWords) {
        if (targetWords.some(tw => tw.includes(sw) || sw.includes(tw))) {
            matchedWords++;
        }
    }

    return (matchedWords / searchWords.length) * 50;
}

/**
 * Wait for an element to appear
 */
export function waitForElement(
    selector: string,
    timeout: number = 5000
): Promise<Element | null> {
    return new Promise((resolve) => {
        const element = smartFind(selector);
        if (element) {
            resolve(element);
            return;
        }

        const observer = new MutationObserver(() => {
            const el = smartFind(selector);
            if (el) {
                observer.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
        });

        setTimeout(() => {
            observer.disconnect();
            resolve(smartFind(selector));
        }, timeout);
    });
}

/**
 * Get all interactive elements on the page
 */
export function getInteractiveElements(): Element[] {
    return Array.from(document.querySelectorAll(
        'a, button, input, select, textarea, [role="button"], [role="link"], ' +
        '[role="tab"], [role="menuitem"], [onclick], [tabindex]:not([tabindex="-1"])'
    )).filter(isVisible);
}
