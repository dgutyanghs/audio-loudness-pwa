import { useState } from 'react'
import './App.css'
import { useChunkedUpload } from './hooks/useChunkedUpload'
import { loudnessProcessor } from './services/loudnessProcessor'

interface FileInfo {
  file: File
  size: string
  duration?: number
}

type LoudnessPreset = '-10db' | '-12db' | '-16db' | '-23db'

interface LoudnessOption {
  value: LoudnessPreset
  label: string
  description: string
  lufs: string
}

const LOUDNESS_OPTIONS: LoudnessOption[] = [
  { value: '-10db', label: 'Loud (-10db)', description: 'Maximum loudness', lufs: '-10 LUFS' },
  { value: '-12db', label: 'Normal (-12db)', description: 'Standard loudness', lufs: '-12 LUFS' },
  { value: '-16db', label: 'Moderate (-16db)', description: 'Moderate loudness', lufs: '-16 LUFS' },
  { value: '-23db', label: 'Quiet (-23db)', description: 'EBU R 128 standard', lufs: '-23 LUFS' },
]

function App() {
  const [uploadedFile, setUploadedFile] = useState<FileInfo | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLoudness, setSelectedLoudness] = useState<LoudnessPreset>('-23db')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processedFile, setProcessedFile] = useState<Blob | null>(null)

  // Chunked upload state
  const uploadManager = useChunkedUpload()

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
    setUploadedFile(null)
    setError(null)
    setProcessedFile(null)
    setIsProcessing(false)
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

  const handleDownload = () => {
    if (!processedFile || !uploadedFile) return

    const url = URL.createObjectURL(processedFile)
    const a = document.createElement('a')
    a.href = url
    a.download = `processed_${uploadedFile.file.name}`
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
        <p>Adjust audio loudness in videos using FFmpeg • Works offline on iOS</p>
      </header>

      <main className="app-main">
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
              <button onClick={resetUpload} className="btn-secondary">
                📤 Upload Different File
              </button>
            </div>
          )}
          {error && <div className="error-message">{error}</div>}
        </section>

        <section className="controls-section">
          <h2>Audio Controls</h2>
          {uploadedFile && !processedFile ? (
            <div className="loudness-controls">
              <h3>Select Target Loudness</h3>
              <div className="loudness-options">
                {LOUDNESS_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    className={`loudness-option ${selectedLoudness === option.value ? 'active' : ''}`}
                    onClick={() => setSelectedLoudness(option.value)}
                    disabled={isProcessing}
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
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>⚙️ Processing with FFmpeg...</>
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
        <p>Built with React + FFmpeg.wasm | iOS PWA | Phase 4: Real FFmpeg Integration ✅</p>
      </footer>
    </div>
  )
}

export default App
