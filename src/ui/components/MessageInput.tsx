import React, { useState, useRef, useEffect } from 'react';
import { Icons } from '../icons';

interface Props {
    onSend: (text: string, image?: string) => void;
    disabled?: boolean;
    isLoading?: boolean;
    onAbort?: () => void;
    contextEnabled?: boolean;
    onToggleContext?: () => void;
}

// Compress image to reduce size
function compressImage(dataUrl: string, maxWidth = 1280): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = dataUrl;
    });
}

export const MessageInput: React.FC<Props> = ({ onSend, disabled, isLoading, onAbort, contextEnabled, onToggleContext }) => {
    const [text, setText] = useState('');
    const [image, setImage] = useState<string | undefined>(undefined);
    const [isDragging, setIsDragging] = useState(false);
    const [isOcrProcessing, setIsOcrProcessing] = useState(false);
    const [showMenu, setShowMenu] = useState(false);

    // Refs
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
        }
    }, [text]);

    // Handle clipboard paste
    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) await processImageFile(file);
                    break;
                }
            }
        };

        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, []);

    const processImageFile = async (file: File) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const dataUrl = ev.target?.result as string;
            const compressed = await compressImage(dataUrl);
            setImage(compressed);
        };
        reader.readAsDataURL(file);
    };

    const handleSend = () => {
        if ((text.trim() || image) && !disabled) {
            onSend(text, image);
            setText('');
            setImage(undefined);
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await processImageFile(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            await processImageFile(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const removeImage = () => setImage(undefined);

    // Actions
    const handleOCR = async () => {
        if (isOcrProcessing) return;
        setIsOcrProcessing(true);
        setShowMenu(false); // Close menu on action

        try {
            // Route through background script which handles content script injection
            // Content script now performs OCR directly (has DOM access for Tesseract)
            interface OCRResult {
                success?: boolean;
                cancelled?: boolean;
                text?: string;
                confidence?: number;
                error?: string;
            }
            const result = await new Promise<OCRResult>((resolve) => {
                chrome.runtime.sendMessage({ type: 'START_OCR_CROP' }, (response) => {
                    resolve(response);
                });
            });


            if (result?.success && result.text) {
                const extractedText = result.text;

                // Insert text into input box
                const newText = text ? text + '\n\n' + extractedText : extractedText;
                setText(newText);

                // Focus the textarea FIRST (required for clipboard access)
                if (textareaRef.current) {
                    textareaRef.current.focus();
                }

                // Copy to clipboard (using fallback for extension compatibility)
                try {

                    // Fallback method using temporary textarea (more reliable in extensions)
                    const tempTextarea = document.createElement('textarea');
                    tempTextarea.value = extractedText;
                    tempTextarea.style.position = 'fixed';
                    tempTextarea.style.opacity = '0';
                    document.body.appendChild(tempTextarea);
                    tempTextarea.select();

                    const success = document.execCommand('copy');
                    document.body.removeChild(tempTextarea);

                    if (success) {
                    } else {
                    }
                } catch (clipboardErr) {
                    console.error('[MessageInput] ❌ Failed to copy to clipboard:', clipboardErr);
                }
            } else if (result?.cancelled) {
            } else if (result?.error) {
                console.error('[MessageInput] ❌ OCR error:', result.error);
            } else {
            }
        } catch (err) {
            console.error('[MessageInput] ❌ OCR failed with exception:', err);
        } finally {
            setIsOcrProcessing(false);
        }
    };

    const handleScreenshot = async () => {
        setShowMenu(false);
        try {
            interface ScreenshotResponse {
                type?: string;
                payload?: { dataUrl?: string };
            }
            const response = await new Promise<ScreenshotResponse>((resolve) => {
                chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, resolve);
            });
            if (response?.type === 'SCREENSHOT' && response.payload?.dataUrl) {
                setImage(response.payload.dataUrl);
            }
        } catch (err) {
            console.error('Failed to capture screenshot:', err);
        }
    };

    return (
        <div
            ref={containerRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
                padding: '16px',
                background: isDragging ? 'rgba(0,122,255,0.05)' : 'var(--input-bg)',
                backdropFilter: 'blur(10px)',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                gap: '12px',
                alignItems: 'flex-end',
                transition: 'background 0.2s',
                border: isDragging ? '2px dashed var(--primary)' : '2px solid transparent',
                position: 'relative'
            }}
        >
            {/* Drag Overlay */}
            {isDragging && (
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center',
                    background: 'var(--overlay-bg)', backdropFilter: 'blur(4px)',
                    color: 'var(--primary)', fontWeight: 500, zIndex: 50
                }}>
                    📷 Drop image here
                </div>
            )}

            {/* Plus Button with Menu */}
            <div
                className="action-menu-container"
                onMouseEnter={() => setShowMenu(true)}
                onMouseLeave={() => setShowMenu(false)}
                style={{ position: 'relative', zIndex: 40 }}
            >
                {/* Menu Popover */}
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '0',
                    marginBottom: '12px',
                    background: 'var(--glass-bg)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '16px',
                    padding: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.1), 0 0 0 1px rgba(0,0,0,0.05)',
                    visibility: showMenu ? 'visible' : 'hidden',
                    opacity: showMenu ? 1 : 0,
                    transform: showMenu ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.95)',
                    transformOrigin: 'bottom left',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    minWidth: '140px'
                }}>
                    {/* Context Toggle */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleContext?.();
                        }}
                        className="menu-item"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 12px',
                            background: contextEnabled ? 'rgba(0,122,255,0.1)' : 'transparent',
                            border: 'none', borderRadius: '10px',
                            cursor: 'pointer',
                            color: contextEnabled ? 'var(--primary)' : 'var(--text-main)',
                            fontSize: '13px', fontWeight: 500,
                            textAlign: 'left',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Icons.Globe width={18} height={18} />
                        <span>Context {contextEnabled ? 'On' : 'Off'}</span>
                    </button>

                    {/* OCR Scan */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleOCR();
                        }}
                        disabled={isOcrProcessing}
                        data-ocr-trigger="true"
                        className="menu-item"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none', borderRadius: '10px',
                            cursor: 'pointer',
                            color: 'var(--text-main)',
                            fontSize: '13px', fontWeight: 500,
                            textAlign: 'left',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        {isOcrProcessing ? (
                            <div style={{ width: '18px', height: '18px', border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        ) : (
                            <Icons.Scan width={18} height={18} />
                        )}
                        <span>Scan Text</span>
                    </button>

                    {/* Image Upload */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            fileInputRef.current?.click();
                            setShowMenu(false);
                        }}
                        className="menu-item"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none', borderRadius: '10px',
                            cursor: 'pointer',
                            color: 'var(--text-main)',
                            fontSize: '13px', fontWeight: 500,
                            textAlign: 'left',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <Icons.Image width={18} height={18} />
                        <span>Upload Image</span>
                    </button>

                    {/* Screenshot */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleScreenshot();
                        }}
                        className="menu-item"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '8px 12px',
                            background: 'transparent',
                            border: 'none', borderRadius: '10px',
                            cursor: 'pointer',
                            color: 'var(--text-main)',
                            fontSize: '13px', fontWeight: 500,
                            textAlign: 'left',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                        <Icons.Camera width={18} height={18} />
                        <span>Screenshot</span>
                    </button>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageSelect}
                        accept="image/*"
                        style={{ display: 'none' }}
                    />
                </div>

                {/* The Plus Button */}
                <button
                    type="button"
                    style={{
                        width: '36px', height: '36px',
                        borderRadius: '50%',
                        background: showMenu ? 'rgba(0,0,0,0.1)' : 'var(--surface-secondary)',
                        border: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                        color: showMenu ? 'var(--text-main)' : 'var(--text-secondary)',
                        transition: 'all 0.2s ease',
                        transform: showMenu ? 'rotate(45deg)' : 'rotate(0deg)'
                    }}
                >
                    <Icons.Plus width={20} height={20} />
                </button>
            </div>

            {/* Input Area */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--surface-secondary)',
                borderRadius: '20px',
                border: '1px solid var(--border-color)',
                padding: '2px', // Inner padding
                transition: 'all 0.2s'
            }}>
                {/* Image Preview inside input area */}
                {image && (
                    <div className="animate-slide-up" style={{ padding: '8px 8px 0 8px', position: 'relative', width: 'fit-content' }}>
                        <img src={image} alt="Preview" style={{ height: '80px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)' }} />
                        <button
                            onClick={removeImage}
                            style={{
                                position: 'absolute', top: '4px', right: '4px',
                                background: 'rgba(0,0,0,0.6)', color: 'white',
                                borderRadius: '50%', border: 'none', width: '20px', height: '20px',
                                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                backdropFilter: 'blur(4px)'
                            }}
                        >
                            <Icons.X width={12} height={12} />
                        </button>
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything..."
                    disabled={disabled}
                    style={{
                        width: '100%',
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        padding: '10px 14px',
                        fontSize: '15px',
                        resize: 'none',
                        fontFamily: 'inherit',
                        maxHeight: '150px',
                        lineHeight: '1.4',
                        color: 'var(--text-main)',
                        minHeight: '40px'
                    }}
                    rows={1}
                />
            </div>

            {/* Send Button */}
            {
                isLoading ? (
                    <button
                        onClick={onAbort}
                        style={{
                            width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                            background: 'var(--surface-secondary)',
                            color: 'var(--text-main)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0
                        }}
                    >
                        <div style={{ width: '10px', height: '10px', background: 'var(--text-main)', borderRadius: '2px' }} />
                    </button>
                ) : (
                    <button
                        onClick={handleSend}
                        disabled={disabled || (!text.trim() && !image)}
                        style={{
                            width: '36px', height: '36px', borderRadius: '50%', border: 'none',
                            background: (!text.trim() && !image) ? 'var(--surface-secondary)' : 'var(--primary-gradient)',
                            color: (!text.trim() && !image) ? 'var(--text-secondary)' : 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: (!text.trim() && !image) ? 'default' : 'pointer',
                            flexShrink: 0,
                            transition: 'all 0.2s',
                            transform: (!text.trim() && !image) ? 'scale(0.95)' : 'scale(1)',
                            opacity: (!text.trim() && !image) ? 0.7 : 1
                        }}
                    >
                        <Icons.Send width={18} height={18} style={{ marginLeft: '-2px', marginTop: '2px' }} />
                    </button>
                )
            }
        </div >
    );
};
