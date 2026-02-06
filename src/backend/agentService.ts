/**
 * Agent Service
 * Orchestrates the agent loop: AI decision -> Action execution -> State update
 * Optimized for minimal overhead
 */

import {
    AgentState, AgentStep, AgentResponse, AgentConfig,
    BrowserAction, PageContext, DEFAULT_AGENT_CONFIG
} from '../shared/types';

/** Agent system prompt for AI */
function getAgentSystemPrompt(customPrompt?: string): string {
    let prompt = '';
    
    // Add custom system prompt first if provided
    if (customPrompt && customPrompt.trim()) {
        prompt += `${customPrompt.trim()}\n\n`;
    }
    
    prompt += `You are an autonomous browser agent that can control a web browser to complete tasks.

## YOUR CAPABILITIES
You can perform these actions:
- navigate: Go to a URL
- click: Click on elements (buttons, links, etc.)
- type: Enter text in input fields
- scroll: Scroll the page up/down or to an element
- wait: Wait for an element to appear
- extract: Get data from the page
- hover: Hover over elements (for dropdowns)
- select: Choose from dropdown menus
- pressKey: Press keyboard keys
- done: Mark task as complete

## RESPONSE FORMAT
You MUST respond with valid JSON only, no other text:
{
  "thought": "Your reasoning about current state and next step",
  "action": { "type": "click", "selector": "text or CSS selector" },
  "done": false
}

## ACTION EXAMPLES
- Click: {"type":"click","selector":"Blood Relations"} or {"type":"click","selector":"#submit-btn"}
- Type: {"type":"type","selector":"Search","text":"my search query"}
- Navigate: {"type":"navigate","url":"https://example.com"}
- Scroll: {"type":"scroll","direction":"down"} or {"type":"scroll","selector":"Blood Relations"}
- Wait: {"type":"wait","selector":"Loading","timeout":3000}
- Done: {"type":"done","summary":"Successfully completed the task"}

## SELECTOR TIPS
- Use text content: "Blood Relations" finds element containing that text
- Use common attributes: "Search", "Submit", "Login"
- CSS selectors work too: "#my-id", ".my-class", "button"

## RULES
1. Analyze the page content/HTML to understand what's visible
2. Take one action at a time - observe result before next action
3. Use simple text selectors when possible (e.g., "Blood Relations" not complex CSS)
4. If an action fails, try an alternative approach
5. Mark done:true when task is complete with a summary
6. Be efficient - minimize number of steps
7. If stuck after 3 attempts, explain the issue in done summary`;
    
    return prompt;
}

/**
 * Build the complete prompt for the AI
 */
export function buildAgentPrompt(
    task: string,
    pageContext: PageContext,
    previousSteps: AgentStep[],
    customSystemPrompt?: string
): string {
    let prompt = getAgentSystemPrompt(customSystemPrompt) + '\n\n';

    // Add current page context
    prompt += '## CURRENT PAGE\n';
    prompt += `URL: ${pageContext.url}\n`;
    prompt += `Title: ${pageContext.title}\n`;

    if (pageContext.mainContentSnippet && pageContext.mainContentSnippet.length > 100) {
        prompt += `\nPage Content:\n${pageContext.mainContentSnippet.substring(0, 4000)}\n`;
    }

    if (pageContext.htmlSource && pageContext.htmlSource.length > 100) {
        // Trim HTML to save tokens
        prompt += `\nPage HTML (key elements):\n${pageContext.htmlSource.substring(0, 6000)}\n`;
    }

    // Add previous steps
    if (previousSteps.length > 0) {
        prompt += '\n## PREVIOUS ACTIONS\n';
        for (const step of previousSteps.slice(-5)) { // Only last 5 steps
            prompt += `- Thought: ${step.thought}\n`;
            prompt += `  Action: ${JSON.stringify(step.action)}\n`;
            prompt += `  Result: ${step.result?.success ? 'Success' : 'Failed: ' + step.result?.error}\n`;
        }
    }

    // Add the task
    prompt += `\n## YOUR TASK\n${task}\n`;
    prompt += '\n## YOUR RESPONSE (JSON only)\n';

    return prompt;
}

/**
 * Parse AI response to extract action
 */
export function parseAgentResponse(response: string): AgentResponse | null {
    try {
        // Try to extract JSON from the response
        let jsonStr = response.trim();

        // Handle markdown code blocks
        const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }

        // Try to find JSON object in response
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            jsonStr = objectMatch[0];
        }

        const parsed = JSON.parse(jsonStr);

        // Validate required fields
        if (!parsed.thought || !parsed.action) {
            console.error('[AgentService] Invalid response structure:', parsed);
            return null;
        }

        return {
            thought: parsed.thought,
            action: parsed.action as BrowserAction,
            done: parsed.done === true || parsed.action.type === 'done'
        };
    } catch (error) {
        console.error('[AgentService] Failed to parse response:', error, response);
        return null;
    }
}

/**
 * Create initial agent state
 */
export function createAgentState(task: string, config?: Partial<AgentConfig>): AgentState {
    const mergedConfig = { ...DEFAULT_AGENT_CONFIG, ...config };
    return {
        isRunning: true,
        isPaused: false,
        currentTask: task,
        steps: [],
        stepCount: 0,
        maxSteps: mergedConfig.maxSteps,
        startTime: Date.now(),
    };
}

/**
 * Add step to agent state
 */
export function addStep(state: AgentState, step: AgentStep): AgentState {
    return {
        ...state,
        steps: [...state.steps, step],
        stepCount: state.stepCount + 1,
    };
}

/**
 * Check if agent should stop
 */
export function shouldStopAgent(state: AgentState, config: AgentConfig): { stop: boolean; reason?: string } {
    // Check step limit
    if (state.stepCount >= state.maxSteps) {
        return { stop: true, reason: `Reached maximum steps (${state.maxSteps})` };
    }

    // Check timeout
    const elapsed = Date.now() - state.startTime;
    if (elapsed > config.timeoutMs) {
        return { stop: true, reason: `Timeout (${config.timeoutMs / 1000}s)` };
    }

    // Check if paused
    if (state.isPaused) {
        return { stop: true, reason: 'Paused by user' };
    }

    // Check if not running
    if (!state.isRunning) {
        return { stop: true, reason: 'Stopped by user' };
    }

    return { stop: false };
}

/**
 * Format agent step for display
 */
export function formatStepForDisplay(step: AgentStep): string {
    let actionDesc: string = step.action.type;

    switch (step.action.type) {
        case 'click':
            actionDesc = `Click "${step.action.selector}"`;
            break;
        case 'type':
            actionDesc = `Type "${step.action.text}" in "${step.action.selector}"`;
            break;
        case 'navigate':
            actionDesc = `Navigate to ${step.action.url}`;
            break;
        case 'scroll':
            actionDesc = step.action.selector
                ? `Scroll to "${step.action.selector}"`
                : `Scroll ${step.action.direction || 'down'}`;
            break;
        case 'wait':
            actionDesc = step.action.selector
                ? `Wait for "${step.action.selector}"`
                : `Wait ${step.action.timeout || 2000}ms`;
            break;
        case 'done':
            actionDesc = 'Task Complete';
            break;
    }

    const result = step.result?.success ? '✓' : '✗';
    return `${result} ${actionDesc}`;
}
