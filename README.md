# 🎬 EasyVideoEditor

> ⚠️ **Alpha Version** — This project is in early development. Expect bugs, incomplete features, and breaking changes.

**Free browser-based video editor.** Trim, merge, add transitions and effects — no install, no registration, no watermarks. All processing runs locally via WebAssembly (FFmpeg.wasm).

🌐 **Live demo:** [videoeditor.6io.io](https://videoeditor.6io.io)  
🤖 **Main site:** [6io.io](https://6io.io) — AI video & image generation / генерация ИИ видео и картинок

---

## 🇷🇺 Описание

Бесплатный онлайн видео редактор, работающий прямо в браузере. Обрезка, склейка, переходы, регулировка скорости и громкости — без установки программ, без регистрации, без водяных знаков. Все вычисления происходят локально на устройстве пользователя через WebAssembly (FFmpeg.wasm). Файлы никуда не загружаются.

> ⚠️ **Альфа-версия** — проект в ранней стадии разработки. Возможны баги, неполная функциональность и изменения без обратной совместимости.

---

## ✨ Features / Возможности

| Feature | Description |
|---------|-------------|
| ✂️ Trim | Precise trim with visual preview / Точная обрезка с предпросмотром |
| 🔗 Merge | Combine multiple clips / Склейка нескольких клипов |
| 🎞️ Transitions | Crossfade, fade-to-black/white, dissolve, wipe, slide / Плавные переходы |
| ⏩ Speed | 0.25× to 4× playback speed / Скорость от 0.25× до 4× |
| 🔊 Volume | 0–200% per clip, fade in/out / Громкость 0–200%, плавное появление/затухание |
| 🎨 Effects | Brightness, contrast, saturation, grayscale, sepia, hue, opacity / Визуальные эффекты |
| 📝 Text | Overlay text with custom fonts, colors, stroke / Текстовые наложения |
| 🖥️ Preview | Real-time preview with transitions / Предпросмотр в реальном времени |
| 📦 Export | MP4 (H.264 + AAC) / Экспорт в MP4 |
| 🔒 Privacy | 100% client-side — files never leave your device / Полная конфиденциальность |
| 📴 Offline | Works without internet after first load / Работает без интернета |
| 🌍 i18n | Russian & English interface / Интерфейс на русском и английском |

## 📸 Screenshot

*Coming soon / Скоро будет добавлен*

---

## 🛠️ Tech Stack

- **React 18** + **TypeScript 5**
- **Vite 6** — build tool
- **Tailwind CSS 3** — styling
- **Zustand** — state management
- **FFmpeg.wasm** (`@ffmpeg/ffmpeg 0.12`) — video processing in the browser
- **react-router-dom** — client-side routing
- **lucide-react** — icons

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm** (or pnpm / yarn)

### Install & Run

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/EasyVideoEditor.git
cd EasyVideoEditor

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
```

Output will be in the `dist/` folder.

---

## 📁 Project Structure

```
├── index.html              # Entry HTML with SEO meta tags
├── public/
│   ├── ffmpeg/             # FFmpeg.wasm core files
│   ├── sitemap.xml
│   ├── robots.txt
│   └── favicon.svg
├── src/
│   ├── main.tsx            # App entry point
│   ├── App.tsx             # Router (Landing / Editor)
│   ├── index.css           # Tailwind imports
│   ├── lib/
│   │   ├── ffmpeg.ts       # FFmpeg.wasm wrapper
│   │   ├── i18n.ts         # Internationalization (RU/EN)
│   │   ├── export-engine.ts # Export pipeline
│   │   └── preview-engine.ts # Real-time preview
│   ├── components/         # UI components
│   ├── pages/
│   │   ├── LandingPage.tsx # Landing / marketing page
│   │   └── EditorPage.tsx  # Main editor interface
│   └── store/
│       └── editor-store.ts # Zustand store
├── tailwind.config.js
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## ⚠️ Known Limitations (Alpha)

- Large files (>500 MB) may cause memory issues depending on device RAM
- Export speed depends on device performance (runs in browser via WASM)
- Some video codecs may not be fully supported by FFmpeg.wasm
- Mobile experience is functional but optimized for desktop

---

## 🗺️ Roadmap

- [ ] Drag & drop media import
- [ ] Undo/redo improvements
- [ ] More transition types
- [ ] Audio waveform visualization
- [ ] Keyboard shortcuts guide
- [ ] PWA / Service Worker for offline support
- [ ] Performance optimizations for large projects

---

## 📄 License

MIT

---

## 🤝 Contributing

Contributions are welcome! Since this is an alpha version, please open an issue first to discuss any changes you'd like to make.

---

<p align="center">
  Made with ❤️ — all processing stays on your device
</p>
