import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Plugin to inject window polyfill for service worker context
function serviceWorkerWindowPolyfill(): Plugin {
  return {
    name: 'service-worker-window-polyfill',
    generateBundle(_, bundle) {
      const backgroundChunk = bundle['background.js'];
      if (backgroundChunk && backgroundChunk.type === 'chunk') {
        // Inject polyfill at the very beginning
        backgroundChunk.code = '/* Service worker polyfill */if(typeof window==="undefined"){globalThis.window=globalThis;}\n' + backgroundChunk.code;
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerWindowPolyfill()],
  build: {
    // Disable modulepreload polyfill - it uses window which doesn't exist in service workers
    modulePreload: false,
    rollupOptions: {
      input: {
        sidePanel: resolve(__dirname, 'src/ui/sidePanel.html'),
        background: resolve(__dirname, 'src/background.ts'),
        contentScript: resolve(__dirname, 'src/content/contentScript.ts'),
        offscreen: resolve(__dirname, 'src/offscreen.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background' || chunkInfo.name === 'contentScript' || chunkInfo.name === 'offscreen') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Manual chunks to split large bundle into smaller pieces
        manualChunks: {
          // Tesseract.js OCR library (~400KB)
          'vendor-tesseract': ['tesseract.js'],
          // KaTeX math rendering (~200KB with fonts handled separately)
          'vendor-katex': ['katex', 'rehype-katex', 'remark-math'],
          // React core
          'vendor-react': ['react', 'react-dom'],
          // Markdown processing
          'vendor-markdown': ['react-markdown', 'remark-gfm']
        }
      }
    },
    outDir: 'dist',
    emptyOutDir: true
  }
})
