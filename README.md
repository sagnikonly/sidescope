# SideScope - Context-Aware Browser Assistant

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=flat&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=flat&logo=vite&logoColor=white)

**SideScope** is a powerful Chrome Extension that puts a smart AI assistant right in your browser's side panel. Unlike standard chat interfaces, SideScope is **context-aware**—it can "see" what you're looking at, including page content, selected text, and even images via OCR, to provide relevant, in-flow assistance.

## ✨ Features

*   **🧠 Deep Context Awareness:** The AI understands your current tab. It can read:
    *   **Page Content:** Summarize articles or analyze long papers.
    *   **Selected Text:** Explain, translate, or refactor snippets of code/text you highlight.
    *   **Metadata:** Uses page title and URL for better context.
*   **👁️ Optical Character Recognition (OCR):** Built-in Tesseract.js integration allows you to select areas of the screen to extract text from images, videos, or protected PDFs.
*   **🤖 Multi-Model Support:** Bring your own API keys. Supports:
    *   **Anthropic:** Claude 3.5 Sonnet, Claude 3 Opus
    *   **OpenAI:** GPT-4o, GPT-4 Turbo
    *   **Google:** Gemini 1.5 Pro/Flash
    *   **OpenRouter:** Access to DeepSeek, Llama 3, and more.
*   **⚡ Fast & Lightweight:** Built with Vite and React for instant load times.
*   **🔒 Privacy Focused:** Your API keys are stored locally in your browser (`chrome.storage.local`). No intermediate servers.

## 🚀 Installation (Developer Mode)

Since this extension is not yet on the Chrome Web Store, you can install it in Developer Mode.

### Prerequisites
*   Node.js (v16 or higher)
*   npm (v7 or higher)
*   Google Chrome (or Brave/Edge)

### Steps

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/side-ai-extension.git
    cd side-ai-extension
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Build the Extension:**
    ```bash
    npm run build
    ```
    This will create a `dist` folder in the project root.

4.  **Load into Chrome:**
    1.  Open Chrome and navigate to `chrome://extensions`.
    2.  Toggle **Developer mode** in the top right corner.
    3.  Click **Load unpacked**.
    4.  Select the **`dist`** folder you just created.

## 🛠️ Usage

### Quick Start
1.  Click the **SideScope** icon in your extension toolbar, or press the shortcut path (Default: `Cmd+Shift+S` on Mac, `Ctrl+Shift+S` on Windows).
2.  The Side Panel will open on the right.
3.  **First Run:** Go to the ⚙️ **Settings** tab.
4.  Enter your API Key for your preferred provider (e.g., OpenAI or Anthropic).
5.  Select a Model from the dropdown.

### Chatting with Context
*   **General Chat:** Just type and ask questions.
*   **Page Q&A:** Ask "What is this article about?" or "Summarize the key points."
*   **Code Explanation:** Highlight a code snippet on a webpage, open the chat, and ask "Explain this code." The selected text is automatically attached to your prompt.

### Using OCR (Text form Images)
1.  Open the Side Panel.
2.  Click the **Crop/OCR** icon (or use the shortcut `Cmd+Shift+O`).
3.  Your cursor will turn into a crosshair. Click and drag to select an area of the webpage.
4.  SideScope will extract the text and automatically paste it into your chat input.

## 💻 Development

Run the dev server for hot-reloading (note: you may still need to reload the extension in `chrome://extensions` for background script changes).

```bash
npm run dev
```

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
