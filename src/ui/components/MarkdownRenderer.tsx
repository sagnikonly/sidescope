import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface Props {
    content: string;
}

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            style={{
                background: 'transparent',
                border: 'none',
                color: copied ? '#4ADE80' : '#888',
                cursor: 'pointer',
                fontSize: '12px',
                padding: '2px 6px',
                borderRadius: '4px',
                transition: 'all 0.2s'
            }}
        >
            {copied ? '✓ Copied' : 'Copy'}
        </button>
    );
};

/**
 * Convert LaTeX delimiters from standard format to markdown-compatible format
 * - Display math: \[...\] → $$...$$
 * - Inline math: \(...\) → $...$
 */
const convertLatexDelimiters = (text: string): string => {
    // Convert display math \[...\] to $$...$$
    let converted = text.replace(/\\\[([\s\S]*?)\\\]/g, (match, formula) => {
        return `$$${formula}$$`;
    });

    // Convert inline math \(...\) to $...$
    converted = converted.replace(/\\\(([\s\S]*?)\\\)/g, (match, formula) => {
        return `$${formula}$`;
    });

    return converted;
};

export const MarkdownRenderer: React.FC<Props> = ({ content }) => {
    // Preprocess content to convert LaTeX delimiters
    const processedContent = convertLatexDelimiters(content);

    return (
        <div className="markdown-content">
            <ReactMarkdown
                remarkPlugins={[remarkMath, remarkGfm]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match && !className;
                        const codeText = String(children).replace(/\n$/, '');

                        if (isInline) {
                            return (
                                <code
                                    style={{
                                        background: 'var(--surface-secondary)',
                                        padding: '2px 6px',
                                        borderRadius: '4px',
                                        fontSize: '0.9em',
                                        fontFamily: 'ui-monospace, "SF Mono", Monaco, Consolas, monospace'
                                    }}
                                    {...props}
                                >
                                    {children}
                                </code>
                            );
                        }

                        return (
                            <div style={{ margin: '12px 0', borderRadius: '10px', overflow: 'hidden', background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div style={{
                                    background: '#2D2D2D',
                                    color: '#bbb',
                                    fontSize: '12px',
                                    padding: '6px 12px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ fontWeight: 500 }}>{match?.[1] || 'code'}</span>
                                    <CopyButton text={codeText} />
                                </div>
                                <pre style={{ margin: 0, padding: '14px', overflowX: 'auto', color: '#f8f8f2', fontSize: '13px', lineHeight: '1.5' }}>
                                    <code className={className} {...props}>
                                        {children}
                                    </code>
                                </pre>
                            </div>
                        );
                    },
                    table: ({ children }) => (
                        <div style={{ overflowX: 'auto', margin: '12px 0', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                            <table style={{
                                width: '100%',
                                borderCollapse: 'collapse',
                                fontSize: '13px',
                                background: 'var(--surface)'
                            }}>
                                {children}
                            </table>
                        </div>
                    ),
                    thead: ({ children }) => (
                        <thead style={{ background: 'var(--surface-secondary)' }}>
                            {children}
                        </thead>
                    ),
                    th: ({ children }) => (
                        <th style={{
                            padding: '10px 12px',
                            textAlign: 'left',
                            fontWeight: 600,
                            borderBottom: '2px solid var(--border-color)',
                            whiteSpace: 'nowrap'
                        }}>
                            {children}
                        </th>
                    ),
                    td: ({ children }) => (
                        <td style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid var(--border-color)'
                        }}>
                            {children}
                        </td>
                    ),
                    tr: ({ children, ...props }) => (
                        <tr style={{ transition: 'background 0.2s' }} {...props}>
                            {children}
                        </tr>
                    ),
                    p: ({ children }) => <p style={{ margin: '0 0 10px 0', lineHeight: '1.6' }}>{children}</p>,
                    ul: ({ children }) => <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.6' }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: '1.6' }}>{children}</ol>,
                    li: ({ children }) => <li style={{ marginBottom: '4px' }}>{children}</li>,
                    blockquote: ({ children }) => (
                        <blockquote style={{
                            margin: '12px 0',
                            padding: '10px 16px',
                            borderLeft: '4px solid var(--primary)',
                            background: 'rgba(0,122,255,0.05)',
                            borderRadius: '0 8px 8px 0'
                        }}>
                            {children}
                        </blockquote>
                    ),
                    a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                            {children}
                        </a>
                    ),
                    hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '16px 0' }} />,
                    h1: ({ children }) => <h1 style={{ fontSize: '1.5em', fontWeight: 700, margin: '16px 0 8px 0' }}>{children}</h1>,
                    h2: ({ children }) => <h2 style={{ fontSize: '1.3em', fontWeight: 600, margin: '14px 0 6px 0' }}>{children}</h2>,
                    h3: ({ children }) => <h3 style={{ fontSize: '1.1em', fontWeight: 600, margin: '12px 0 6px 0' }}>{children}</h3>,
                }}
            >
                {processedContent}
            </ReactMarkdown>
            <style>{`
                .markdown-content p:last-child { margin-bottom: 0; }
                .markdown-content .katex-display { 
                    margin: 16px 0; 
                    overflow-x: auto; 
                    overflow-y: hidden;
                    padding: 8px 0;
                }
                .markdown-content .katex { 
                    font-size: 1.1em;
                }
                .markdown-content .katex-html {
                    white-space: normal;
                }
                .markdown-content p .katex {
                    font-size: 1em;
                }
                .markdown-content table tr:hover { background: rgba(0,0,0,0.02); }
                .markdown-content table tbody tr:last-child td { border-bottom: none; }
            `}</style>
        </div>
    );
};
