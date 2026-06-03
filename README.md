# Audio Loudness Processor - PWA for iPhone 14 Plus

A Progressive Web App (PWA) that allows users to upload videos and adjust audio loudness using **FFmpeg.wasm** (client-side processing). Works offline, optimized for iPhone 14 Plus.

## ✨ Features

- 🎬 **Video Upload**: Drag-and-drop or file picker (iOS compatible)
- 🔊 **Audio Loudness Adjustment**:
  - Basic volume amplification (0.5x - 2.0x)
  - LUFS Normalization (EBU R 128 standard, -23 LUFS)
- 📱 **PWA Support**:
  - Installable on home screen (iOS Safari 15.4+)
  - Works offline with Service Worker caching
  - ~50-60MB cache for FFmpeg.wasm
- 🚀 **Performance**:
  - Client-side processing (no backend needed)
  - Web Worker offload (non-blocking UI)
  - Optimized for 400MB video max (iOS memory constraints)
- 🎨 **iOS Optimized**:
  - Responsive design for iPhone 14 Plus (6.68")
  - Touch-friendly controls (44×44px min)
  - Dark mode support
  - Native homescreen splash screens

## 🏗️ Project Structure

```
src/
├── index.tsx              # App entry point
├── App.tsx                # Root component
├── index.css              # Global styles
├── App.css                # App styles
├── serviceWorkerRegister.ts # PWA registration
│
├── pages/                 # Page components
│   ├── HomePage.tsx
│   └── ProcessingPage.tsx
│
├── components/            # Reusable components
│   ├── FileUpload.tsx
│   ├── AudioControls.tsx
│   ├── ProgressBar.tsx
│   ├── LoudnessMeter.tsx
│   └── DownloadButton.tsx
│
├── hooks/                 # Custom React hooks
│   ├── useFFmpeg.ts       # FFmpeg lifecycle
│   └── useAudioProcessor.ts # Audio processing logic
│
├── services/              # Business logic
│   └── audioProcessor.ts  # FFmpeg filter generation
│
├── utils/                 # Utility functions
│   ├── fileValidation.ts
│   ├── memoryMonitor.ts
│   └── downloadHelper.ts
│
└── workers/               # Web Workers
    └── ffmpeg.worker.ts   # FFmpeg offload thread

public/
├── index.html
├── manifest.json          # PWA manifest
├── sw.js                  # Service Worker
└── icons/                 # Icon files (placeholder)

```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ (with npm or yarn)
- Modern browser (Chrome, Firefox, Safari 15.4+)
- iPhone 14 Plus (for testing on device)

### Installation

1. **Clone/Navigate to project**:
   ```bash
   cd /home/donnie/Documents/githubonDocuments/loudness
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```
   Opens at `http://localhost:3000`

### Building

```bash
npm run build      # Build for production
npm run preview    # Preview production build locally
```

## 📱 Installation on iPhone 14 Plus

1. Open Safari on iPhone
2. Navigate to deployed URL
3. Tap Share button (↑)
4. Scroll down and tap "Add to Home Screen"
5. Name: "Audio Loudness"
6. Tap "Add"
7. App now appears on homescreen as standalone app

## 🧪 Testing

### Unit Tests
```bash
npm run test
```

### Type Checking
```bash
npm run type-check
```

### Linting
```bash
npm run lint
```

## 🔧 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | UI framework |
| **Audio Processing** | FFmpeg.wasm | Video/audio modification |
| **Offline** | Service Workers | Caching & offline mode |
| **File Upload** | react-dropzone | Drag-and-drop UX |
| **Build** | Vite | Fast builds |
| **Deployment** | Cloudflare Pages | Global CDN |

## 📈 Performance Targets

- **First Load**: < 10 seconds (Service Worker cache miss)
- **Processing 50MB**: < 60 seconds on iPhone 14 Plus
- **Memory Peak**: < 300MB
- **Service Worker Cache**: ~50-60MB

## 🔌 FFmpeg Commands Reference

### Volume Amplification
```bash
-filter:a "volume=1.5"   # Increase by 1.5x
-filter:a "volume=0.5"   # Decrease by 0.5x
```

### LUFS Normalization (EBU R 128)
```bash
-filter:a "loudnorm=I=-23:TP=-2:LRA=11"  # Normalize to -23 LUFS
-filter:a "loudnorm=I=-14:TP=-1:LRA=7"   # Normalize to -14 LUFS
```

## 📝 Development Phases

- [x] **Phase 1**: Project setup & PWA config
- [ ] **Phase 2**: FFmpeg integration layer
- [ ] **Phase 3**: File upload & memory management
- [ ] **Phase 4**: Audio processing UI
- [ ] **Phase 5**: Processing pipeline & download
- [ ] **Phase 6**: Service Worker & offline support
- [ ] **Phase 7**: PWA installation & iOS optimization
- [ ] **Phase 8**: Cloudflare Workers backend (optional)
- [ ] **Phase 9**: Testing & deployment

## 🐛 Known Limitations

- **iOS Storage**: 50-600MB quota per app (aggressive cleanup recommended)
- **Max Video Size**: 400MB (iPhone 14 Plus RAM limit)
- **LUFS Accuracy**: FFmpeg `loudnorm` filter (approximation of ITU-R BS.1770-5)
- **iOS PWA State**: App data resets after 7 days of inactivity
- **Background Processing**: Not supported on iOS (app must stay open)

## 🚀 Deployment

### Cloudflare Pages
```bash
npm run build
# Deploy dist/ folder to Cloudflare Pages
```

See `wrangler.toml` for Cloudflare configuration.

## 📄 License

MIT

## 🙋 Support

For issues or questions, check the plan at `/memories/session/plan.md` or review the implementation phases.

---

**Last Updated**: Phase 1 (Project Setup)
**Status**: 🟢 Development Ready
