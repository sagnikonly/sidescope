// Offscreen document for OCR - Using Tesseract WITHOUT workers
import { createWorker } from 'tesseract.js';


// Listen for OCR requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PERFORM_OCR') {
        (async () => {
            try {

                // Create worker with local file paths - no CDN required!
                // workerBlobURL: false prevents CSP violations from Blob URL workers
                const worker = await createWorker('eng', 1, {
                    workerPath: chrome.runtime.getURL('tesseract/worker.min.js'),
                    corePath: chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
                    langPath: chrome.runtime.getURL('tesseract/lang-data'),
                    workerBlobURL: false,  // CRITICAL: Prevent Blob URL worker creation (CSP violation)
                    gzip: true,  // Language data files are gzipped
                });

                const { data } = await worker.recognize(message.imageDataUrl);

                await worker.terminate();

                sendResponse({
                    success: true,
                    text: data.text.trim(),
                    confidence: data.confidence
                });
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                console.error('[Offscreen] OCR failed:', error.message);
                sendResponse({
                    success: false,
                    error: error.message || String(err)
                });
            }
        })();

        return true; // Keep channel open for async response
    }
});
