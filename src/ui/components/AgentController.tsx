/**
 * Agent Controller Component
 * Main UI for the browser automation agent
 * Shows task input, progress, and controls
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AgentState, AgentStep, PageContext, DEFAULT_AGENT_CONFIG, ActionResult, BrowserAction, BackendToFrontendMessage } from '../../shared/types';
import { Icons } from '../icons';

interface Props {
    pageContext?: PageContext;
    onClose: () => void;
}

export const AgentController: React.FC<Props> = ({ pageContext, onClose }) => {
    const [task, setTask] = useState('');
    const [agentState, setAgentState] = useState<AgentState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef(false);
    const stepsContainerRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new steps arrive
    useEffect(() => {
        if (stepsContainerRef.current) {
            stepsContainerRef.current.scrollTop = stepsContainerRef.current.scrollHeight;
        }
    }, [agentState?.steps]);

    const runAgentLoop = useCallback(async () => {
        if (!task.trim() || !pageContext) return;

        abortRef.current = false;
        setError(null);

        const initialState: AgentState = {
            isRunning: true,
            isPaused: false,
            currentTask: task,
            steps: [],
            stepCount: 0,
            maxSteps: DEFAULT_AGENT_CONFIG.maxSteps,
            startTime: Date.now(),
        };
        setAgentState(initialState);

        let currentSteps: AgentStep[] = [];
        let currentContext = pageContext;

        while (!abortRef.current && currentSteps.length < DEFAULT_AGENT_CONFIG.maxSteps) {
            try {
                // Step 1: Get AI decision

                const stepResponse = await new Promise<BackendToFrontendMessage>((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        type: 'RUN_AGENT_STEP',
                        payload: {
                            task,
                            pageContext: currentContext,
                            previousSteps: currentSteps
                        }
                    }, (response: BackendToFrontendMessage) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(response);
                        }
                    });
                });

                if (stepResponse.type === 'ERROR') {
                    throw new Error(stepResponse.payload.message);
                }

                if (stepResponse.type !== 'AGENT_STEP') {
                    throw new Error('Unexpected response type');
                }

                const step: AgentStep = stepResponse.payload as AgentStep;

                // Check if done
                if (step.action.type === 'done') {
                    step.result = { success: true };
                    currentSteps = [...currentSteps, step];
                    setAgentState(prev => prev ? {
                        ...prev,
                        steps: currentSteps,
                        stepCount: currentSteps.length,
                        isRunning: false
                    } : null);
                    break;
                }

                // Step 2: Execute action

                let actionResult: ActionResult;

                // Handle navigation specially - use chrome.tabs.update from background
                if (step.action.type === 'navigate') {
                    const url = step.action.url.startsWith('http') ? step.action.url : `https://${step.action.url}`;

                    try {
                        // Get current tab and navigate
                        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                        if (tabs[0]?.id) {
                            await chrome.tabs.update(tabs[0].id, { url });
                            // Wait for navigation to complete
                            await sleep(2000);
                            actionResult = { success: true };
                        } else {
                            actionResult = { success: false, error: 'No active tab found' };
                        }
                        } catch (navErr: unknown) {
                            const errorMessage = navErr instanceof Error ? navErr.message : String(navErr);
                            actionResult = { success: false, error: errorMessage };
                        }
                } else {
                    // Execute other actions via content script
                    actionResult = await new Promise<ActionResult>((resolve, reject) => {
                        chrome.runtime.sendMessage({
                            type: 'EXECUTE_AGENT_ACTION',
                            payload: step.action
                        }, (response) => {
                            if (chrome.runtime.lastError) {
                                reject(new Error(chrome.runtime.lastError.message));
                            } else if (response.type === 'ERROR') {
                                resolve({ success: false, error: response.payload.message });
                            } else {
                                resolve(response.payload);
                            }
                        });
                    });
                }

                step.result = actionResult;
                currentSteps = [...currentSteps, step];

                setAgentState(prev => prev ? {
                    ...prev,
                    steps: currentSteps,
                    stepCount: currentSteps.length
                } : null);

                // Step 3: Wait for page to settle, then get new context
                await sleep(DEFAULT_AGENT_CONFIG.stepDelayMs);

                // Refresh page context
                const contextResponse = await new Promise<BackendToFrontendMessage>((resolve) => {
                    chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT' }, resolve);
                });

                if (contextResponse.type === 'PAGE_CONTEXT') {
                    currentContext = contextResponse.payload;
                }


            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                console.error('[Agent] Error:', error);
                setError(error.message || String(err));
                setAgentState(prev => prev ? { ...prev, isRunning: false, error: error.message } : null);
                break;
            }
        }

        // Mark as not running when loop ends
        setAgentState(prev => prev ? { ...prev, isRunning: false } : null);
    }, [task, pageContext]);

    const handleStop = () => {
        abortRef.current = true;
        setAgentState(prev => prev ? { ...prev, isRunning: false } : null);
    };

    const handleClear = () => {
        setAgentState(null);
        setTask('');
        setError(null);
    };

    const isRunning = agentState?.isRunning ?? false;

    return (
        <div style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--bg-main)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 100,
        }}>
            {/* Header */}
            <div style={{
                padding: '16px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                color: 'white',
            }}>
                <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    🤖
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '16px' }}>Browser Agent</div>
                    <div style={{ fontSize: '12px', opacity: 0.9 }}>
                        {isRunning ? 'Running...' : 'Ready to automate'}
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none',
                        borderRadius: '8px',
                        padding: '8px',
                        cursor: 'pointer',
                        color: 'white',
                    }}
                >
                    <Icons.X width={20} height={20} />
                </button>
            </div>

            {/* Task Input */}
            {!agentState && (
                <div style={{ padding: '16px' }}>
                    <div style={{ marginBottom: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
                        What would you like me to do?
                    </div>
                    <textarea
                        value={task}
                        onChange={(e) => setTask(e.target.value)}
                        placeholder="e.g., Open Physics Wallah and click on Blood Relations chapter, then start the first lecture"
                        style={{
                            width: '100%',
                            minHeight: '100px',
                            padding: '12px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-color)',
                            fontSize: '14px',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            background: 'var(--surface-secondary)',
                        }}
                    />
                    <button
                        onClick={runAgentLoop}
                        disabled={!task.trim() || !pageContext}
                        style={{
                            marginTop: '12px',
                            width: '100%',
                            padding: '12px',
                            borderRadius: '12px',
                            border: 'none',
                            background: task.trim() && pageContext
                                ? 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)'
                                : '#E4E6EB',
                            color: task.trim() && pageContext ? 'white' : '#9CA3AF',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: task.trim() && pageContext ? 'pointer' : 'default',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                        }}
                    >
                        <span>▶</span> Start Agent
                    </button>

                    {!pageContext && (
                        <div style={{
                            marginTop: '12px',
                            padding: '10px',
                            background: 'rgba(245, 158, 11, 0.1)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#B45309',
                        }}>
                            ⚠️ Navigate to a webpage first to enable the agent
                        </div>
                    )}
                </div>
            )}

            {/* Agent Progress */}
            {agentState && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Current Task */}
                    <div style={{
                        padding: '12px 16px',
                        background: 'var(--surface-secondary)',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '13px',
                    }}>
                        <div style={{ fontWeight: 500, marginBottom: '4px' }}>Task:</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{agentState.currentTask}</div>
                    </div>

                    {/* Steps */}
                    <div
                        ref={stepsContainerRef}
                        style={{
                            flex: 1,
                            overflow: 'auto',
                            padding: '16px',
                        }}
                    >
                        {agentState.steps.map((step, index) => (
                            <StepCard key={step.id} step={step} index={index} />
                        ))}

                        {isRunning && (
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '12px',
                                color: 'var(--primary)',
                            }}>
                                <div className="agent-spinner" />
                                <span>Thinking...</span>
                            </div>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            margin: '0 16px 12px',
                            padding: '10px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: '#DC2626',
                        }}>
                            ❌ {error}
                        </div>
                    )}

                    {/* Controls */}
                    <div style={{
                        padding: '12px 16px',
                        borderTop: '1px solid var(--border-color)',
                        display: 'flex',
                        gap: '8px',
                    }}>
                        {isRunning ? (
                            <button
                                onClick={handleStop}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: '#EF4444',
                                    color: 'white',
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                ⏹ Stop Agent
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleClear}
                                    style={{
                                        flex: 1,
                                        padding: '10px',
                                        borderRadius: '10px',
                                        border: '1px solid var(--border-color)',
                                        background: 'white',
                                        color: 'var(--text-main)',
                                        fontSize: '13px',
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={runAgentLoop}
                                    style={{
                                        flex: 1,
                                        padding: '10px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                                        color: 'white',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    ▶ Run Again
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Step Card Component
const StepCard: React.FC<{ step: AgentStep; index: number }> = ({ step, index }) => {
    const isSuccess = step.result?.success;
    const actionDesc = formatAction(step.action);

    return (
        <div style={{
            marginBottom: '12px',
            padding: '12px',
            background: 'white',
            borderRadius: '12px',
            border: '1px solid var(--border-color)',
            boxShadow: 'var(--shadow-sm)',
        }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
            }}>
                <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: step.result
                        ? (isSuccess ? '#10B981' : '#EF4444')
                        : 'var(--primary)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 600,
                }}>
                    {step.result ? (isSuccess ? '✓' : '✗') : index + 1}
                </div>
                <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: step.result
                        ? (isSuccess ? '#059669' : '#DC2626')
                        : 'var(--text-main)',
                }}>
                    {actionDesc}
                </div>
            </div>
            <div style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                paddingLeft: '32px',
            }}>
                {step.thought}
            </div>
            {step.result?.error && (
                <div style={{
                    marginTop: '8px',
                    paddingLeft: '32px',
                    fontSize: '11px',
                    color: '#DC2626',
                }}>
                    Error: {step.result.error}
                </div>
            )}
        </div>
    );
};

function formatAction(action: BrowserAction): string {
    switch (action.type) {
        case 'click': return `Click "${action.selector}"`;
        case 'type': return `Type "${action.text}"`;
        case 'navigate': return `Navigate to ${action.url}`;
        case 'scroll': return action.selector ? `Scroll to "${action.selector}"` : `Scroll ${action.direction || 'down'}`;
        case 'wait': return action.selector ? `Wait for "${action.selector}"` : 'Wait';
        case 'done': return `Complete: ${action.summary}`;
        default: return action.type;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
