import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = new URL('.', import.meta.url).pathname

export default defineConfig({
  appType: 'spa',
  plugins: [
    react({
      // Use Babel only for JSX transform — fastest config
      babel: { babelrc: false, configFile: false },
    }),
  ],
  resolve: {
    // alias removed — not needed for this project
  },
  server: {
    // Required headers for SharedArrayBuffer (FFmpeg.wasm multithreading)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // Watch only src/ — exclude the huge public/ffmpeg wasm from the watcher
    watch: {
      ignored: ['**/public/ffmpeg/**', '**/node_modules/**'],
    },
    // Pre-bundle everything except ffmpeg wasm wrappers
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx', './src/pages/EditorPage.tsx'],
    },
    hmr: true,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'icons': ['lucide-react'],
        },
      },
    },
  },
  optimizeDeps: {
    // Keep ffmpeg out of pre-bundling (it uses dynamic imports + workers)
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    // Pre-bundle everything else eagerly so first-load is instant
    include: ['react', 'react-dom', 'react-router-dom', 'zustand', 'lucide-react'],
  },
})
