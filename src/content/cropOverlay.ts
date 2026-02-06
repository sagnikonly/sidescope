// Crop Overlay - Allows user to select a region of the page for OCR

interface CropResult {
    x: number;
    y: number;
    width: number;
    height: number;
    cancelled?: boolean;
}

export function createCropOverlay(): Promise<CropResult> {
    return new Promise((resolve) => {
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.id = 'ocr-crop-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.3);
            cursor: crosshair;
            z-index: 2147483647;
            user-select: none;
        `;

        // Selection box
        const selectionBox = document.createElement('div');
        selectionBox.style.cssText = `
            position: fixed;
            border: 2px dashed #007AFF;
            background: rgba(0, 122, 255, 0.1);
            pointer-events: none;
            display: none;
            z-index: 2147483647;
        `;

        // Instruction tooltip
        const tooltip = document.createElement('div');
        tooltip.textContent = 'Click and drag to select area for OCR • Press ESC to cancel';
        tooltip.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 14px;
            font-weight: 500;
            z-index: 2147483647;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;

        overlay.appendChild(selectionBox);
        overlay.appendChild(tooltip);
        document.body.appendChild(overlay);

        let startX = 0;
        let startY = 0;
        let isSelecting = false;

        const cleanup = () => {
            overlay.remove();
            document.removeEventListener('keydown', handleKeyDown);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                cleanup();
                resolve({ x: 0, y: 0, width: 0, height: 0, cancelled: true });
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        overlay.addEventListener('mousedown', (e) => {
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;
            selectionBox.style.display = 'block';
            selectionBox.style.left = startX + 'px';
            selectionBox.style.top = startY + 'px';
            selectionBox.style.width = '0';
            selectionBox.style.height = '0';
        });

        overlay.addEventListener('mousemove', (e) => {
            if (!isSelecting) return;

            const currentX = e.clientX;
            const currentY = e.clientY;

            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        });

        overlay.addEventListener('mouseup', (e) => {
            if (!isSelecting) return;
            isSelecting = false;

            const currentX = e.clientX;
            const currentY = e.clientY;

            const x = Math.min(startX, currentX);
            const y = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            cleanup();

            // Minimum selection size
            if (width < 10 || height < 10) {
                resolve({ x: 0, y: 0, width: 0, height: 0, cancelled: true });
                return;
            }

            resolve({ x, y, width, height });
        });
    });
}

// Crop an image based on selection coordinates
export function cropImage(
    imageDataUrl: string,
    crop: CropResult,
    devicePixelRatio: number = window.devicePixelRatio
): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            // Account for device pixel ratio
            const scaledX = crop.x * devicePixelRatio;
            const scaledY = crop.y * devicePixelRatio;
            const scaledWidth = crop.width * devicePixelRatio;
            const scaledHeight = crop.height * devicePixelRatio;

            canvas.width = scaledWidth;
            canvas.height = scaledHeight;

            ctx.drawImage(
                img,
                scaledX, scaledY, scaledWidth, scaledHeight,
                0, 0, scaledWidth, scaledHeight
            );

            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to load image for cropping'));
        img.src = imageDataUrl;
    });
}
