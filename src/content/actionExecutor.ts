/**
 * Action Executor
 * Executes browser actions with visual feedback and error handling
 * Lightweight and optimized for performance
 */

import { BrowserAction, ActionResult } from '../shared/types';
import { smartFind, waitForElement } from './smartSelector';

// Highlight color for visual feedback
const HIGHLIGHT_COLOR = '#3B82F6';
const HIGHLIGHT_DURATION = 1500;

/**
 * Execute a browser action
 */
export async function executeAction(action: BrowserAction): Promise<ActionResult> {

    try {
        switch (action.type) {
            case 'navigate':
                return await executeNavigate(action.url);

            case 'click':
                return await executeClick(action.selector, action.text);

            case 'type':
                return await executeType(action.selector, action.text, action.clearFirst);

            case 'scroll':
                return await executeScroll(action.direction, action.selector);

            case 'wait':
                return await executeWait(action.selector, action.timeout);

            case 'extract':
                return await executeExtract(action.selector, action.attribute);

            case 'hover':
                return await executeHover(action.selector);

            case 'select':
                return await executeSelect(action.selector, action.value);

            case 'pressKey':
                return await executePressKey(action.key);

            case 'done':
                return { success: true, data: { summary: action.summary } };

            default: {
                const unknownAction = action as { type: string };
                return { success: false, error: `Unknown action type: ${unknownAction.type}` };
            }
        }
    } catch (error) {
        console.error('[ActionExecutor] Error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/**
 * Navigate to URL - returns special result for background script to handle
 */
async function executeNavigate(url: string): Promise<ActionResult> {
    // Navigation must be handled by background script, not content script
    // Return special result with URL
    return {
        success: true,
        data: {
            needsNavigation: true,
            url: url.startsWith('http') ? url : `https://${url}`
        }
    };
}

/**
 * Click an element
 */
async function executeClick(selector: string, text?: string): Promise<ActionResult> {
    // Use text hint to improve matching
    const searchTerm = text || selector;

    let element = smartFind(searchTerm);

    // If not found, wait a bit for dynamic content
    if (!element) {
        element = await waitForElement(searchTerm, 3000);
    }

    if (!element) {
        return { success: false, error: `Element not found: "${searchTerm}"` };
    }

    // Highlight element
    highlightElement(element as HTMLElement);

    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(300);

    // Click the element
    if (element instanceof HTMLElement) {
        element.click();
    } else {
        // For SVG and other non-HTMLElement elements
        const clickableElement = element as unknown as { click?: () => void };
        clickableElement.click?.();
    }

    return { success: true };
}

/**
 * Type text into an input
 */
async function executeType(
    selector: string,
    text: string,
    clearFirst?: boolean
): Promise<ActionResult> {
    let element = smartFind(selector) as HTMLInputElement | HTMLTextAreaElement | null;

    if (!element) {
        element = await waitForElement(selector, 3000) as HTMLInputElement | null;
    }

    if (!element) {
        return { success: false, error: `Input not found: "${selector}"` };
    }

    if (!(element instanceof HTMLInputElement) && !(element instanceof HTMLTextAreaElement)) {
        // Try to find input within the element
        const input = (element as HTMLElement).querySelector('input, textarea') as HTMLInputElement | null;
        if (!input) {
            return { success: false, error: 'Element is not an input field' };
        }
        element = input;
    }

    // Highlight and focus
    highlightElement(element);
    element.focus();

    // Clear if requested
    if (clearFirst) {
        element.value = '';
    }

    // Type text character by character for better compatibility
    element.value = text;

    // Dispatch events for React/Vue/Angular compatibility
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true };
}

/**
 * Scroll the page
 */
async function executeScroll(
    direction?: 'up' | 'down',
    selector?: string
): Promise<ActionResult> {
    if (selector) {
        // Scroll to element
        const element = smartFind(selector);
        if (element) {
            highlightElement(element as HTMLElement);
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return { success: true };
        }
        return { success: false, error: `Element not found: "${selector}"` };
    }

    // Scroll page
    const amount = direction === 'up' ? -400 : 400;
    window.scrollBy({ top: amount, behavior: 'smooth' });
    return { success: true };
}

/**
 * Wait for element or timeout
 */
async function executeWait(selector?: string, timeout?: number): Promise<ActionResult> {
    const waitTime = timeout || 2000;

    if (selector) {
        const element = await waitForElement(selector, waitTime);
        if (element) {
            return { success: true };
        }
        return { success: false, error: `Element did not appear: "${selector}"` };
    }

    await sleep(waitTime);
    return { success: true };
}

/**
 * Extract data from element
 */
async function executeExtract(selector: string, attribute?: string): Promise<ActionResult> {
    const element = smartFind(selector);

    if (!element) {
        return { success: false, error: `Element not found: "${selector}"` };
    }

    highlightElement(element as HTMLElement);

    let data: string;
    if (attribute) {
        data = element.getAttribute(attribute) || '';
    } else {
        data = element.textContent?.trim() || '';
    }

    return { success: true, data };
}

/**
 * Hover over element
 */
async function executeHover(selector: string): Promise<ActionResult> {
    const element = smartFind(selector) as HTMLElement | null;

    if (!element) {
        return { success: false, error: `Element not found: "${selector}"` };
    }

    highlightElement(element);

    // Trigger hover events
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    return { success: true };
}

/**
 * Select option from dropdown
 */
async function executeSelect(selector: string, value: string): Promise<ActionResult> {
    const element = smartFind(selector) as HTMLSelectElement | null;

    if (!element) {
        return { success: false, error: `Element not found: "${selector}"` };
    }

    if (!(element instanceof HTMLSelectElement)) {
        return { success: false, error: 'Element is not a select dropdown' };
    }

    highlightElement(element);

    // Find option by value or text
    let found = false;
    for (const option of element.options) {
        if (option.value === value || option.text.toLowerCase().includes(value.toLowerCase())) {
            element.value = option.value;
            found = true;
            break;
        }
    }

    if (!found) {
        return { success: false, error: `Option not found: "${value}"` };
    }

    element.dispatchEvent(new Event('change', { bubbles: true }));
    return { success: true };
}

/**
 * Press a keyboard key
 */
async function executePressKey(key: string): Promise<ActionResult> {
    const event = new KeyboardEvent('keydown', {
        key,
        code: key,
        bubbles: true,
    });

    document.activeElement?.dispatchEvent(event);
    return { success: true };
}

/**
 * Highlight element with visual feedback
 */
function highlightElement(element: HTMLElement): void {
    const originalOutline = element.style.outline;
    const originalOutlineOffset = element.style.outlineOffset;
    const originalTransition = element.style.transition;

    element.style.transition = 'outline 0.2s ease-in-out';
    element.style.outline = `3px solid ${HIGHLIGHT_COLOR}`;
    element.style.outlineOffset = '2px';

    setTimeout(() => {
        element.style.outline = originalOutline;
        element.style.outlineOffset = originalOutlineOffset;
        element.style.transition = originalTransition;
    }, HIGHLIGHT_DURATION);
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
