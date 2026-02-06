import { FrontendToBackendMessage } from './types';

export function sendToBackend(msg: FrontendToBackendMessage) {
    chrome.runtime.sendMessage(msg);
}
