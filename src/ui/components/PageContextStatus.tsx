import React, { useState, useEffect, useRef } from 'react';
import { PageContext } from '../../shared/types';
import { Icons } from '../icons';

interface Props {
    pageContext?: PageContext;
}

export const PageContextStatus: React.FC<Props> = ({ pageContext }) => {
    const [expanded, setExpanded] = useState(false);
    const [extractionAge, setExtractionAge] = useState<number | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Update extraction age every second when expanded
    useEffect(() => {
        if (!pageContext?.timestamp) {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- Necessary for synchronizing derived state
            setExtractionAge(null);
            return;
        }

        // Calculate initial age
        setExtractionAge(Math.round((Date.now() - pageContext.timestamp) / 1000));

        // Update every second if expanded
        if (expanded) {
            intervalRef.current = setInterval(() => {
                setExtractionAge(Math.round((Date.now() - pageContext.timestamp!) / 1000));
            }, 1000);
        }

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, [pageContext?.timestamp, expanded]);

    if (!pageContext) return null;

    const contentLength = pageContext.mainContentSnippet?.length || 0;
    const hasContent = contentLength > 100;
    const tokens = pageContext.tokens?.total || 0;
    const quality = pageContext.quality?.score || 0;
    const metadata = pageContext.metadata;

    return (
        <div style={{ padding: '0 16px', marginTop: '12px' }}>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    padding: '8px 12px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
                    <div style={{ 
                        width: '6px', 
                        height: '6px', 
                        borderRadius: '50%', 
                        background: quality > 70 ? '#10B981' : quality > 40 ? '#F59E0B' : '#EF4444',
                        boxShadow: `0 0 0 2px ${quality > 70 ? 'rgba(16, 185, 129, 0.2)' : quality > 40 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`
                    }}></div>
                    <span style={{ fontWeight: 500, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {pageContext.title || 'Untitled Page'}
                    </span>
                    {pageContext.timestamp && (
                        <span style={{
                            fontSize: '9px',
                            background: '#28a745',
                            color: 'white',
                            padding: '2px 4px',
                            borderRadius: '3px',
                            fontWeight: 600
                        }}>
                            CACHED
                        </span>
                    )}
                    <span style={{ fontSize: '10px', opacity: 0.6 }}>
                        {tokens > 0 ? `${(tokens / 1000).toFixed(1)}K tokens` : `${Math.round(contentLength / 100) / 10}K chars`}
                    </span>
                    <Icons.Link width={14} height={14} style={{ opacity: 0.5 }} />
                </div>

                {expanded && (
                    <div className="animate-fade-in" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--surface-secondary)', color: 'var(--text-secondary)' }}>
                        <div style={{ marginBottom: '8px', wordBreak: 'break-all', opacity: 0.8 }}>{pageContext.url}</div>
                        
                        {/* Quality Metrics */}
                        {pageContext.quality && (
                            <div style={{ 
                                padding: '6px', 
                                background: 'var(--surface-secondary)', 
                                borderRadius: '6px', 
                                marginBottom: '8px',
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1fr',
                                gap: '8px',
                                fontSize: '11px'
                            }}>
                                <div>
                                    <div style={{ opacity: 0.6 }}>Quality</div>
                                    <div style={{ fontWeight: 600, color: quality > 70 ? '#10B981' : quality > 40 ? '#F59E0B' : '#EF4444' }}>
                                        {quality}%
                                    </div>
                                </div>
                                <div>
                                    <div style={{ opacity: 0.6 }}>Readability</div>
                                    <div style={{ fontWeight: 600 }}>{pageContext.quality.readability}%</div>
                                </div>
                                <div>
                                    <div style={{ opacity: 0.6 }}>Density</div>
                                    <div style={{ fontWeight: 600 }}>{pageContext.quality.density}%</div>
                                </div>
                            </div>
                        )}

                        {/* Metadata */}
                        {metadata && (
                            <div style={{ 
                                padding: '6px', 
                                background: 'rgba(59, 130, 246, 0.05)', 
                                borderRadius: '6px', 
                                borderLeft: '2px solid #3B82F6',
                                marginBottom: '8px',
                                fontSize: '11px'
                            }}>
                                <div style={{ fontWeight: 500, marginBottom: '4px', color: '#3B82F6' }}>📋 Metadata</div>
                                {metadata.type && (
                                    <div style={{ opacity: 0.8 }}>Type: {metadata.type}</div>
                                )}
                                {metadata.author && (
                                    <div style={{ opacity: 0.8 }}>Author: {metadata.author}</div>
                                )}
                                {metadata.readingTime && (
                                    <div style={{ opacity: 0.8 }}>Reading: ~{metadata.readingTime} min</div>
                                )}
                            </div>
                        )}

                        {/* Image OCR Results */}
                        {pageContext.imageOCR && pageContext.imageOCR.length > 0 && (
                            <div style={{ 
                                padding: '6px', 
                                background: 'rgba(139, 92, 246, 0.05)', 
                                borderRadius: '6px', 
                                borderLeft: '2px solid #8B5CF6',
                                marginBottom: '8px',
                                fontSize: '11px'
                            }}>
                                <div style={{ fontWeight: 500, marginBottom: '6px', color: '#8B5CF6' }}>
                                    🖼️ Text from {pageContext.imageOCR.length} image{pageContext.imageOCR.length > 1 ? 's' : ''}
                                </div>
                                {pageContext.imageOCR.map((img, idx) => (
                                    <div key={idx} style={{ 
                                        marginBottom: '4px', 
                                        padding: '4px', 
                                        background: 'rgba(139, 92, 246, 0.05)',
                                        borderRadius: '4px'
                                    }}>
                                        <div style={{ opacity: 0.6, fontSize: '10px' }}>
                                            {img.altText || `Image ${idx + 1}`} ({img.width}x{img.height}, {Math.round(img.confidence)}% confidence)
                                        </div>
                                        <div style={{ opacity: 0.9, marginTop: '2px' }}>
                                            {img.ocrText.substring(0, 100)}{img.ocrText.length > 100 ? '...' : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Selection */}
                        {pageContext.selectionText && (
                            <div style={{ 
                                padding: '6px', 
                                background: 'var(--surface-secondary)', 
                                borderRadius: '6px', 
                                fontStyle: 'italic', 
                                borderLeft: '2px solid var(--primary)', 
                                marginBottom: '8px',
                                fontSize: '11px'
                            }}>
                                Selected: "{pageContext.selectionText.substring(0, 80)}..."
                            </div>
                        )}

                        {/* Content Preview */}
                        {hasContent && (
                            <div style={{ 
                                padding: '6px', 
                                background: 'rgba(16, 185, 129, 0.05)', 
                                borderRadius: '6px', 
                                borderLeft: '2px solid #10B981',
                                fontSize: '11px'
                            }}>
                                <div style={{ fontWeight: 500, marginBottom: '4px', color: '#10B981' }}>
                                    📄 Content extracted ({tokens > 0 ? `${tokens} tokens` : `${Math.round(contentLength / 1000)}K chars`})
                                </div>
                                <div style={{ opacity: 0.7 }}>
                                    {pageContext.mainContentSnippet?.substring(0, 150)}...
                                </div>
                            </div>
                        )}

                        {/* Timestamp */}
                        {extractionAge !== null && (
                            <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '6px' }}>
                                Extracted {extractionAge}s ago
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

