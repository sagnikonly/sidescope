import { FrontendToBackendMessage, BackendToFrontendMessage, AIRequestPayload } from './shared/types';
import { callAI } from './backend/aiClient';
import { loadSettings, saveSettings } from './backend/settingsStore';
import { requestPageContextFromActiveTab } from './backend/pageContextBridge';

// Open side panel when action button is clicked
chrome.action.onClicked.addListener((tab) => {
    if (tab.id) {
        chrome.sidePanel.open({ tabId: tab.id });
    }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    switch (command) {
        case 'open-side-panel':
            await chrome.sidePanel.open({ tabId: tab.id });
            break;
        case 'start-ocr':
            // Broadcast OCR command to side panel
            chrome.runtime.sendMessage({ type: 'TRIGGER_OCR' }).catch(() => { });
            break;
    }
});

chrome.runtime.onMessage.addListener((msg: FrontendToBackendMessage, sender, sendResponse) => {
    (async () => {
        try {
            switch (msg.type) {
                case 'LOAD_SETTINGS': {
                    const settings = await loadSettings();
                    const out: BackendToFrontendMessage = { type: 'SETTINGS', payload: settings };
                    sendResponse(out);
                    break;
                }
                case 'SAVE_SETTINGS': {
                    await saveSettings(msg.payload);
                    const out: BackendToFrontendMessage = { type: 'SETTINGS', payload: msg.payload };
                    sendResponse(out);
                    break;
                }
                case 'VALIDATE_API_KEY': {
                    const { validateApiKey } = await import('./backend/aiClient');
                    const result = await validateApiKey(msg.payload.providerId, msg.payload.apiKey);
                    const out: BackendToFrontendMessage = { type: 'API_KEY_VALID', payload: result };
                    sendResponse(out);
                    break;
                }
                case 'CANCEL_AI_REQUEST': {
                    const { cancelCurrentRequest } = await import('./backend/aiClient');
                    cancelCurrentRequest();
                    sendResponse({ success: true });
                    break;
                }
                case 'GET_PAGE_CONTEXT': {
                    const { forceRefresh, quality } = msg.payload || {};
                    const ctx = await requestPageContextFromActiveTab({ forceRefresh, quality });
                    if (ctx) {
                        const out: BackendToFrontendMessage = { type: 'PAGE_CONTEXT', payload: ctx };
                        sendResponse(out);
                    } else {
                        const out: BackendToFrontendMessage = { type: 'ERROR', payload: { message: 'Could not get page context' } };
                        sendResponse(out);
                    }
                    break;
                }
                case 'CLEAR_CONTEXT_CACHE': {
                    const { clearContextCache } = await import('./backend/pageContextBridge');
                    clearContextCache();
                    sendResponse({ success: true });
                    break;
                }
                case 'REQUEST_AI_RESPONSE': {
                    const aiPayload: AIRequestPayload = msg.payload;
                    try {
                        const aiResponse = await callAI(aiPayload);
                        const out: BackendToFrontendMessage = { type: 'AI_RESPONSE', payload: aiResponse };
                        // Broadcast to all listeners (e.g., the side panel)
                        chrome.runtime.sendMessage(out);
                        sendResponse(out);
                    } catch (aiErr: unknown) {
                        const errorMessage = aiErr instanceof Error ? aiErr.message : String(aiErr);
                        console.error('AI call error:', aiErr);
                        const errOut: BackendToFrontendMessage = { type: 'ERROR', payload: { message: errorMessage } };
                        chrome.runtime.sendMessage(errOut);
                        sendResponse(errOut);
                    }
                    break;
                }
                case 'LOAD_HISTORY': {
                    const { loadHistory } = await import('./backend/historyStore');
                    const sessions = await loadHistory();
                    const out: BackendToFrontendMessage = { type: 'HISTORY', payload: sessions };
                    sendResponse(out);
                    break;
                }
                case 'SAVE_HISTORY': {
                    const { saveHistory } = await import('./backend/historyStore');
                    await saveHistory(msg.payload);
                    const out: BackendToFrontendMessage = { type: 'HISTORY', payload: msg.payload };
                    sendResponse(out);
                    break;
                }
                case 'CLEAR_HISTORY': {
                    const { clearHistory } = await import('./backend/historyStore');
                    await clearHistory();
                    const out: BackendToFrontendMessage = { type: 'HISTORY', payload: [] };
                    sendResponse(out);
                    break;
                }
                case 'CAPTURE_SCREENSHOT': {
                    const { captureScreenshot } = await import('./backend/pageContextBridge');
                    const dataUrl = await captureScreenshot();
                    if (dataUrl) {
                        const out: BackendToFrontendMessage = { type: 'SCREENSHOT', payload: { dataUrl } };
                        sendResponse(out);
                    } else {
                        const out: BackendToFrontendMessage = { type: 'ERROR', payload: { message: 'Could not capture screenshot' } };
                        sendResponse(out);
                    }
                    break;
                }
                case 'EXECUTE_AGENT_ACTION': {
                    // Forward action to content script for execution
                    const { getActiveTab } = await import('./backend/pageContextBridge');
                    const tab = await getActiveTab();
                    if (!tab?.id) {
                        const out: BackendToFrontendMessage = { type: 'ERROR', payload: { message: 'No active tab' } };
                        sendResponse(out);
                        break;
                    }

                    try {
                        const result = await chrome.tabs.sendMessage(tab.id, {
                            type: 'EXECUTE_ACTION',
                            action: msg.payload
                        });
                        const out: BackendToFrontendMessage = { type: 'AGENT_ACTION_RESULT', payload: result };
                        sendResponse(out);
                    } catch (err: unknown) {
                        const errorMessage = err instanceof Error ? err.message : String(err);
                        const out: BackendToFrontendMessage = {
                            type: 'ERROR',
                            payload: { message: `Action failed: ${errorMessage}` }
                        };
                        sendResponse(out);
                    }
                    break;
                }
                case 'PROCESS_OCR': {
                    // Run Tesseract OCR on the provided image
                    const { performOCR } = await import('./backend/ocrService');
                    try {
                        const result = await performOCR(msg.payload.imageDataUrl);
                        const out: BackendToFrontendMessage = {
                            type: 'OCR_RESULT',
                            payload: { text: result.text, confidence: result.confidence }
                        };
                        sendResponse(out);
                    } catch (err: unknown) {
                        const errorMessage = err instanceof Error ? err.message : String(err);
                        const out: BackendToFrontendMessage = {
                            type: 'ERROR',
                            payload: { message: `OCR failed: ${errorMessage}` }
                        };
                        sendResponse(out);
                    }
                    break;
                }
                case 'START_OCR_CROP': {
                    // Inject crop overlay directly as inline function (more reliable than file injection)
                    const { getActiveTab, captureScreenshot } = await import('./backend/pageContextBridge');
                    const tab = await getActiveTab();
                    if (!tab?.id) {
                        console.error('[Background] ❌ No active tab found');
                        sendResponse({ success: false, error: 'No active tab' });
                        break;
                    }

                    try {
                        // Inject and run crop selection overlay directly
                        const [{ result: cropResult }] = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => {
                                return new Promise<{ x: number; y: number; width: number; height: number; cancelled?: boolean }>((resolve) => {
                                    // Remove any existing overlay
                                    document.getElementById('ocr-crop-overlay')?.remove();

                                    const overlay = document.createElement('div');
                                    overlay.id = 'ocr-crop-overlay';
                                    overlay.style.cssText = `
                                        position: fixed; inset: 0; z-index: 2147483647;
                                        background: rgba(0,0,0,0.3); cursor: crosshair;
                                    `;

                                    const selectionBox = document.createElement('div');
                                    selectionBox.style.cssText = `
                                        position: absolute; border: 2px dashed #007AFF;
                                        background: rgba(0,122,255,0.1); display: none;
                                    `;
                                    overlay.appendChild(selectionBox);

                                    const instructions = document.createElement('div');
                                    instructions.style.cssText = `
                                        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                                        background: rgba(0,0,0,0.8); color: white; padding: 12px 24px;
                                        border-radius: 8px; font: 14px system-ui; z-index: 2147483647;
                                    `;
                                    instructions.textContent = 'Drag to select area for OCR • ESC to cancel';
                                    overlay.appendChild(instructions);

                                    let startX = 0, startY = 0, isSelecting = false;

                                    overlay.onmousedown = (e) => {
                                        startX = e.clientX;
                                        startY = e.clientY;
                                        isSelecting = true;
                                        selectionBox.style.display = 'block';
                                        selectionBox.style.left = startX + 'px';
                                        selectionBox.style.top = startY + 'px';
                                        selectionBox.style.width = '0';
                                        selectionBox.style.height = '0';
                                    };

                                    overlay.onmousemove = (e) => {
                                        if (!isSelecting) return;
                                        const x = Math.min(e.clientX, startX);
                                        const y = Math.min(e.clientY, startY);
                                        const w = Math.abs(e.clientX - startX);
                                        const h = Math.abs(e.clientY - startY);
                                        selectionBox.style.left = x + 'px';
                                        selectionBox.style.top = y + 'px';
                                        selectionBox.style.width = w + 'px';
                                        selectionBox.style.height = h + 'px';
                                    };

                                    overlay.onmouseup = (e) => {
                                        if (!isSelecting) return;
                                        isSelecting = false;
                                        const x = Math.min(e.clientX, startX);
                                        const y = Math.min(e.clientY, startY);
                                        const width = Math.abs(e.clientX - startX);
                                        const height = Math.abs(e.clientY - startY);
                                        overlay.remove();
                                        if (width > 10 && height > 10) {
                                            resolve({ x, y, width, height });
                                        } else {
                                            resolve({ x: 0, y: 0, width: 0, height: 0, cancelled: true });
                                        }
                                    };

                                    const handleKeyDown = (e: KeyboardEvent) => {
                                        if (e.key === 'Escape') {
                                            overlay.remove();
                                            document.removeEventListener('keydown', handleKeyDown);
                                            resolve({ x: 0, y: 0, width: 0, height: 0, cancelled: true });
                                        }
                                    };
                                    document.addEventListener('keydown', handleKeyDown);
                                    document.body.appendChild(overlay);
                                });
                            }
                        });


                        if (!cropResult || cropResult.cancelled || cropResult.width < 10) {
                            sendResponse({ success: false, cancelled: true });
                            break;
                        }

                        // Take screenshot
                        const screenshot = await captureScreenshot();
                        if (!screenshot) {
                            console.error('[Background] ❌ Failed to capture screenshot');
                            sendResponse({ success: false, error: 'Failed to capture screenshot' });
                            break;
                        }

                        // Get device pixel ratio
                        const dpr = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: () => window.devicePixelRatio
                        }).then(r => r[0]?.result || 1);

                        // Crop the image
                        const [{ result: croppedImage }] = await chrome.scripting.executeScript({
                            target: { tabId: tab.id },
                            func: (dataUrl: string, crop: { x: number; y: number; width: number; height: number }, pixelRatio: number) => {
                                return new Promise<string>((resolve) => {
                                    const img = new Image();
                                    img.onload = () => {
                                        const canvas = document.createElement('canvas');
                                        canvas.width = crop.width * pixelRatio;
                                        canvas.height = crop.height * pixelRatio;
                                        const ctx = canvas.getContext('2d')!;
                                        ctx.drawImage(img,
                                            crop.x * pixelRatio, crop.y * pixelRatio,
                                            crop.width * pixelRatio, crop.height * pixelRatio,
                                            0, 0, canvas.width, canvas.height
                                        );
                                        const result = canvas.toDataURL('image/png');
                                        resolve(result);
                                    };
                                    img.src = dataUrl;
                                });
                            },
                            args: [screenshot, cropResult, dpr]
                        });

                        if (!croppedImage) {
                            console.error('[Background] ❌ Failed to crop image');
                            sendResponse({ success: false, error: 'Failed to crop image' });
                            break;
                        }

                        // Perform OCR using offscreen document (has window/DOM access)

                        try {
                            // Create offscreen document if it doesn't exist
                            // Using type assertion due to Chrome types not being up to date
                            type ContextType = 'OFFSCREEN_DOCUMENT';
                            const existingContexts = await chrome.runtime.getContexts({
                                contextTypes: ['OFFSCREEN_DOCUMENT' as ContextType]
                            });

                            if (existingContexts.length === 0) {
                                // Using type assertion for offscreen API
                                type OffscreenReason = 'BLOBS';
                                await chrome.offscreen.createDocument({
                                    url: 'offscreen.html',
                                    reasons: ['BLOBS' as OffscreenReason],
                                    justification: 'OCR processing using Tesseract.js'
                                });
                                // Give it a moment to initialize
                                await new Promise(resolve => setTimeout(resolve, 100));
                            }

                            // Send OCR request to offscreen document
                            const ocrResult = await chrome.runtime.sendMessage({
                                type: 'PERFORM_OCR',
                                imageDataUrl: croppedImage
                            });


                            if (ocrResult?.success) {
                                sendResponse({ success: true, text: ocrResult.text, confidence: ocrResult.confidence });
                            } else {
                                console.error('[Background] ❌ OCR failed:', ocrResult?.error);
                                sendResponse({ success: false, error: ocrResult?.error || 'OCR processing failed' });
                            }
                        } catch (ocrErr: unknown) {
                            const error = ocrErr instanceof Error ? ocrErr : new Error(String(ocrErr));
                            console.error('[Background] ❌ OCR processing failed:', error);
                            console.error('[Background] Error message:', error.message);
                            console.error('[Background] Error stack:', error.stack);
                            sendResponse({ success: false, error: error.message || 'OCR processing failed' });
                        }
                    } catch (err: unknown) {
                        const error = err instanceof Error ? err : new Error(String(err));
                        console.error('[Background] ❌ OCR crop failed:', error);
                        console.error('[Background] Error details:', error.message, error.stack);
                        sendResponse({ success: false, error: error.message || String(err) });
                    }
                    break;
                }
                case 'RUN_AGENT_STEP': {
                    // Run one step of the agent: send context to AI, get action
                    const { buildAgentPrompt, parseAgentResponse } = await import('./backend/agentService');
                    // Load settings to verify configuration and get custom prompt
                    const settings = await loadSettings();

                    const prompt = buildAgentPrompt(
                        msg.payload.task,
                        msg.payload.pageContext,
                        msg.payload.previousSteps || [],
                        settings.customSystemPrompt
                    );

                    try {
                        // Call AI with agent prompt
                        const aiPayload = {
                            messages: [{
                                id: crypto.randomUUID(),
                                role: 'user' as const,
                                content: prompt,
                                createdAt: Date.now()
                            }]
                        };

                        const aiResponse = await callAI(aiPayload);
                        const agentResponse = parseAgentResponse(aiResponse.message.content);

                        if (agentResponse) {
                            const step = {
                                id: crypto.randomUUID(),
                                thought: agentResponse.thought,
                                action: agentResponse.action,
                                timestamp: Date.now()
                            };
                            const out: BackendToFrontendMessage = { type: 'AGENT_STEP', payload: step };
                            sendResponse(out);
                        } else {
                            const out: BackendToFrontendMessage = {
                                type: 'ERROR',
                                payload: { message: 'Could not parse agent response' }
                            };
                            sendResponse(out);
                        }
                    } catch (err: unknown) {
                        const errorMessage = err instanceof Error ? err.message : String(err);
                        const out: BackendToFrontendMessage = {
                            type: 'ERROR',
                            payload: { message: `Agent step failed: ${errorMessage}` }
                        };
                        sendResponse(out);
                    }
                    break;
                }
            }


        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error('Background error:', err);
            const out: BackendToFrontendMessage = {
                type: 'ERROR',
                payload: { message: errorMessage }
            };
            sendResponse(out);
        }
    })();

    // Return true to indicate async response
    return true;
});

// --- Tab Change Detection ---
// When user switches tabs or tab updates, notify frontend to refresh context

import { getBasicPageContext } from './backend/pageContextBridge';

async function broadcastContextUpdate(immediate = false) {
    try {
        // If immediate, send basic info first (fast)
        if (immediate) {
            const basicCtx = await getBasicPageContext();
            if (basicCtx) {
                const out: BackendToFrontendMessage = { type: 'PAGE_CONTEXT', payload: basicCtx };
                chrome.runtime.sendMessage(out).catch(() => { });
            }
        }

        // Then get full context with quality setting
        const ctx = await requestPageContextFromActiveTab({ quality: 'balanced' });
        if (ctx) {
            const out: BackendToFrontendMessage = { type: 'PAGE_CONTEXT', payload: ctx };
            chrome.runtime.sendMessage(out).catch(() => { });
        }
    } catch (err) {
    }
}

// When user switches to a different tab - immediate response
chrome.tabs.onActivated.addListener((activeInfo) => {
    broadcastContextUpdate(true); // Immediate basic info
});

// When the current tab's URL or content changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Trigger on loading (URL changed) and complete (content ready)
    if (tab.active && (changeInfo.status === 'loading' || changeInfo.status === 'complete')) {
        broadcastContextUpdate(changeInfo.status === 'loading');
    }
});

