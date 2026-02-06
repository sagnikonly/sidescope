import { ChatSession } from '../shared/types';

const HISTORY_KEY = 'localSliderAssistant:history';

export async function loadHistory(): Promise<ChatSession[]> {
    const result = await chrome.storage.local.get(HISTORY_KEY);
    return (result[HISTORY_KEY] as ChatSession[]) || [];
}

export async function saveHistory(sessions: ChatSession[]): Promise<void> {
    await chrome.storage.local.set({ [HISTORY_KEY]: sessions });
}

export async function clearHistory(): Promise<void> {
    await chrome.storage.local.remove(HISTORY_KEY);
}
