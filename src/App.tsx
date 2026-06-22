import { useState, useEffect } from 'react'
import './App.css'
import { useChunkedUpload } from './hooks/useChunkedUpload'
import { loudnessProcessor } from './services/loudnessProcessor'
import { ffmpegService } from './services/ffmpegService'
import { InstallGuide, useIsInstalled } from './components/InstallGuide'

interface FileInfo {
  file: File
  size: string
  duration?: number
}

type LoudnessPreset = '-8db' | '-10db' | '-12db' | '-16db'

interface LoudnessOption {
  value: LoudnessPreset
  label: string
  description: string
  lufs: string
}

const LOUDNESS_OPTIONS: LoudnessOption[] = [
  { value: '-8db', label: 'Loud (-8db)', description: 'Maximum loudness', lufs: '-8 LUFS' },
  { value: '-10db', label: 'Normal (-10db)', description: 'Strong loudness', lufs: '-10 LUFS' },
  { value: '-12db', label: 'Moderate (-12db)', description: 'Standard loudness', lufs: '-12 LUFS' },
  { value: '-16db', label: 'Quiet (-16db)', description: 'Moderate loudness', lufs: '-16 LUFS' },
]

function App() {
  const [uploadedFile, setUploadedFile] = useState<FileInfo | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLoudness, setSelectedLoudness] = useState<LoudnessPreset>('-12db')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processedFile, setProcessedFile] = useState<Blob | null>(null)
  const [detectedLoudness, setDetectedLoudness] = useState<{ integrated: number; truePeak: number; lra: number } | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const isInstalled = useIsInstalled()

  // Chunked upload state
  const uploadManager = useChunkedUpload()

  // ── Clean up FFmpeg worker when leaving the page ──
  // pagehide fires on tab close, navigation, or app backgrounding on iOS.
  // This prevents orphaned WASM workers from accumulating memory.
  useEffect(() => {
    const handlePageHide = () => {
      ffmpegService.terminateWorker()
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const validateFile = (file: File): boolean => {
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']

    if (!validTypes.some(type => file.type.startsWith(type.split('/')[0]))) {
      setError('❌ Invalid file type. Please upload a video file.')
      return false
    }

    setError(null)
    return true
  }

  const handleFileSelect = async (file: File) => {
    if (!validateFile(file)) return

    try {
      setError(null)

      // Clean up previous upload's IndexedDB data before starting a new one
      const previousId = uploadManager.state.uploadId
      if (previousId) {
        uploadManager.cleanup(previousId).catch(() => {})
      }

      // Start chunked upload
      const uploadId = await uploadManager.upload(file, {
        onProgress: (uploadedBytes, totalBytes) => {
          console.log(`Upload progress: ${(uploadedBytes / totalBytes) * 100}%`)
        },
        onChunkComplete: (chunkIndex, totalChunks) => {
          console.log(`Chunk ${chunkIndex}/${totalChunks} uploaded`)
        },
      })

      // Once upload is complete, reassemble and store file info
      await uploadManager.reassemble(uploadId)
      setUploadedFile({
        file,
        size: formatFileSize(file.size),
      })
      setProcessedFile(null)

      // Analyze the current loudness of the uploaded video
      setIsAnalyzing(true)
      setDetectedLoudness(null)
      try {
        const fileBlob = await uploadManager.reassemble(uploadId)
        const analysis = await loudnessProcessor.analyze(fileBlob, file.name)
        setDetectedLoudness(analysis)
      } catch (analyzeErr) {
        console.error('Loudness analysis failed:', analyzeErr)
        // Non-critical — don't block the user
      } finally {
        setIsAnalyzing(false)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed'
      setError(`❌ Upload failed: ${errorMsg}`)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFileSelect(e.target.files[0])
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0])
    }
  }

  const resetUpload = () => {
    // Free WASM memory — critical on iOS Safari to prevent memory-pressure crashes
    ffmpegService.terminateWorker()

    // Clean up IndexedDB chunks from the previous upload
    const previousUploadId = uploadManager.state.uploadId
    if (previousUploadId) {
      uploadManager.cleanup(previousUploadId).catch(() => {})
    }

    setUploadedFile(null)
    setError(null)
    setProcessedFile(null)
    setIsProcessing(false)
    setDetectedLoudness(null)
    setIsAnalyzing(false)
  }

  const handleProcessStart = async () => {
    if (!uploadedFile) return

    setIsProcessing(true)
    setError(null)

    try {
      // Get the uploaded file blob from storage
      const uploadId = uploadManager.state.uploadId
      if (!uploadId) {
        throw new Error('No upload found')
      }

      // Reassemble the file from chunks
      const fileBlob = await uploadManager.reassemble(uploadId)

      // Process with FFmpeg loudness normalization
      const processedBlob = await loudnessProcessor.process(
        fileBlob,
        uploadedFile.file.name,
        selectedLoudness,
        (progress) => {
          console.log(`Processing progress: ${Math.round(progress)}%`)
        }
      )

      setProcessedFile(processedBlob)
      setIsProcessing(false)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Processing failed'
      setError(`❌ Processing failed: ${errorMsg}`)
      setIsProcessing(false)
    }
  }

  const handleDownload = async () => {
    if (!processedFile || !uploadedFile) return

    const fileName = `processed_${uploadedFile.file.name}`
    const file = new File([processedFile], fileName, { type: processedFile.type || 'video/mp4' })

    // Use Share API if available (iOS shows "Save Video" → Photos, Android shows share sheet)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return
      } catch {
        // User cancelled or share failed — fall through to download fallback
      }
    }

    // Fallback: direct download via anchor (desktop, older browsers)
    const url = URL.createObjectURL(processedFile)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getLoudnessOption = (value: LoudnessPreset) =>
    LOUDNESS_OPTIONS.find(opt => opt.value === value)

  return (
    <div className="App">
      <header className="app-header">
        <h1>🔊 Audio Loudness Processor</h1>
        <p>Adjust audio loudness in videos • Works offline</p>
      </header>

      <main className="app-main">
        {/* Install banner — shown only when not already installed */}
        {!isInstalled && (
          <div className="install-banner" onClick={() => setShowInstallGuide(true)}>
            <span className="install-banner-icon">📲</span>
            <span className="install-banner-text">
              Install this app to your home screen for the best experience — full screen, offline, auto‑updating.
            </span>
            <span className="install-banner-arrow">›</span>
          </div>
        )}

        <section className="upload-section">
          <h2>Upload Video</h2>
          {!uploadedFile ? (
            <>
              {uploadManager.state.isUploading ? (
                <div className="upload-progress">
                  <h3>📤 Uploading...</h3>
                  <div className="progress-container">
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${uploadManager.state.progress}%` }}
                      />
                    </div>
                    <p>
                      {uploadManager.state.uploadedChunks}/{uploadManager.state.totalChunks} chunks uploaded ({Math.round(uploadManager.state.progress)}%)
                    </p>
                  </div>
                  <button
                    onClick={() => uploadManager.state.uploadId && uploadManager.cancel(uploadManager.state.uploadId)}
                    className="btn-secondary"
                  >
                    ❌ Cancel Upload
                  </button>
                </div>
              ) : (
                <div
                  className={`upload-placeholder ${dragActive ? 'drag-active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  <p>📁 Drag and drop your video here, or click to select</p>
                  <small>Supported: MP4, WebM, MOV</small>
                  <input
                    id="file-input"
                    type="file"
                    accept="video/*"
                    className="file-input"
                    onChange={handleInputChange}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="file-uploaded">
              <div className="file-info">
                <h3>✅ Video Loaded</h3>
                <p><strong>File:</strong> {uploadedFile.file.name}</p>
                <p><strong>Size:</strong> {uploadedFile.size}</p>
                <p><strong>Type:</strong> {uploadedFile.file.type || 'video'}</p>
              </div>

              {isAnalyzing ? (
                <div className="detected-loudness analyzing">
                  <span className="dl-spinner" />
                  <span>Analyzing audio loudness…</span>
                </div>
              ) : detectedLoudness ? (
                <div className="detected-loudness">
                  <span className="dl-icon">🎚️</span>
                  <div className="dl-values">
                    <span className="dl-main">Current loudness: <strong>{detectedLoudness.integrated} LUFS</strong></span>
                    <span className="dl-sub">True peak: {detectedLoudness.truePeak} dB &nbsp;·&nbsp; LRA: {detectedLoudness.lra} LU</span>
                  </div>
                </div>
              ) : null}

              <button onClick={resetUpload} className="btn-secondary">
                📤 Upload Different File
              </button>
            </div>
          )}
          {error && <div className="error-message">{error}</div>}
        </section>

        <section className="controls-section">
          <h2>Audio Controls</h2>

          <div className="loudness-tip">
            <span className="tip-icon">💡</span>
            <span>Loudness normalization won't cause sound distortion — not like volume adjustment.</span>
          </div>

          {uploadedFile && !processedFile ? (
            <div className="loudness-controls">
              <h3>Select Target Loudness</h3>
              <div className="loudness-options">
                {LOUDNESS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    className={`loudness-option ${selectedLoudness === option.value ? 'active' : ''}`}
                    onClick={() => setSelectedLoudness(option.value)}
                    disabled={isProcessing || isAnalyzing}
                  >
                    <div className="option-label">{option.label}</div>
                    <div className="option-desc">{option.description}</div>
                    <div className="option-lufs">{option.lufs}</div>
                  </button>
                ))}
              </div>

              <div className="processing-info">
                <div className="selected-info">
                  <p>
                    <strong>Selected:</strong> {getLoudnessOption(selectedLoudness)?.label}
                  </p>
                  <p><small>{getLoudnessOption(selectedLoudness)?.description}</small></p>
                </div>
              </div>

              <button
                onClick={handleProcessStart}
                className={`btn-primary ${isProcessing ? 'processing' : ''}`}
                disabled={isProcessing || isAnalyzing}
              >
                {isProcessing ? (
                  <>⚙️ Processing with FFmpeg...</>
                ) : isAnalyzing ? (
                  <>🔍 Analyzing audio loudness...</>
                ) : (
                  <>🚀 Process Video</>
                )}
              </button>
            </div>
          ) : processedFile ? (
            <div className="processing-complete">
              <h3>✅ Processing Complete!</h3>
              <p>Your video has been processed with loudness level: <strong>{getLoudnessOption(selectedLoudness)?.label}</strong></p>
              <button
                onClick={handleDownload}
                className="btn-download"
              >
                💾 Download Processed Video
              </button>
              <button
                onClick={resetUpload}
                className="btn-secondary"
                style={{ marginTop: '0.5rem' }}
              >
                📤 Process Another Video
              </button>
            </div>
          ) : (
            <p>📤 Upload a video to adjust audio loudness</p>
          )}
        </section>

        <section className="privacy-notice">
          <div className="privacy-content">
            <span className="privacy-icon">🔒</span>
            <div className="privacy-text">
              <strong>Your privacy matters.</strong> Everything runs <em>right here in your browser</em> — your videos and audio are never uploaded to any server. Once you close this page, all data is gone. No accounts, no tracking, no storage. Just fast, private, local processing.
            </div>
          </div>
        </section>

        <section className="status-section">
          <h2>Status</h2>
          <p>
            {uploadedFile
              ? isProcessing
                ? `⚙️ Processing: ${uploadedFile.file.name}`
                : processedFile
                  ? `✅ Done: ${uploadedFile.file.name}`
                  : `📋 Ready: ${uploadedFile.file.name}`
              : '⏳ Waiting for video upload...'}
          </p>
          <div className="storage-info">
            <p>🗄️ Storage: {uploadManager.state.memoryUsage.usedBytes > 0 ? `${Math.round(uploadManager.state.memoryUsage.usagePercent)}% used` : 'Ready'}</p>
            <p>FFmpeg Engine: Ready • Offline mode: ✅ • Chunked uploads: ✅</p>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-privacy">
            <span>🔒</span>
            <span>100% client-side processing — your files never leave your device.</span>
          </div>
          <div className="footer-built">
            <span>Your advice matters.</span>
            <span className="footer-dot">·</span>
            <span>Contact{' '}
              <a href="mailto:dgutyang@gmail.com" className="footer-email">Donnie</a>
            </span>
          </div>
        </div>
      </footer>

      <InstallGuide isOpen={showInstallGuide} onClose={() => setShowInstallGuide(false)} />
    </div>
  )
}

export default App
