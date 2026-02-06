// OCR Service using Tesseract.js for on-device text extraction

import Tesseract from 'tesseract.js';

let worker: Tesseract.Worker | null = null;

// Initialize the Tesseract worker (lazy initialization)
async function getWorker(): Promise<Tesseract.Worker> {
    if (!worker) {
        worker = await Tesseract.createWorker('eng', 1, {
            // No logger for production
        });
    }
    return worker;
}

export interface OCRResult {
    text: string;
    confidence: number;
}

// Perform OCR on an image
export async function performOCR(imageDataUrl: string): Promise<OCRResult> {

    const tesseractWorker = await getWorker();
    const result = await tesseractWorker.recognize(imageDataUrl);


    return {
        text: result.data.text.trim(),
        confidence: result.data.confidence
    };
}

// Cleanup worker when no longer needed
export async function terminateOCR(): Promise<void> {
    if (worker) {
        await worker.terminate();
        worker = null;
    }
}
