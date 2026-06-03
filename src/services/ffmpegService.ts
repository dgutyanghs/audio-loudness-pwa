/**
 * FFmpeg Service
 * Initializes and manages FFmpeg.wasm for audio processing.
 * Loads the multi-threaded ESM core from jsdelivr CDN (version 0.12.10).
 */

import { FFmpeg } from '@ffmpeg/ffmpeg'

class FFmpegService {
    private ffmpeg: FFmpeg | null = null
    private initialized = false
    private initPromise: Promise<void> | null = null

    /**
     * Initialize FFmpeg with multi-threaded WebWorker support.
     * Uses ESM core build from jsdelivr CDN for module worker compatibility.
     */
    async init(): Promise<void> {
        if (this.initialized && this.ffmpeg?.loaded) {
            return
        }

        if (this.initPromise) {
            return this.initPromise
        }

        this.initPromise = (async () => {
            const ffmpeg = new FFmpeg()

            // Handle FFmpeg progress events
            ffmpeg.on('progress', ({ progress, time }) => {
                console.log(`[FFmpeg] Progress: ${(progress * 100).toFixed(2)}%, Time: ${time}ms`)
            })

            // Log FFmpeg output for debugging
            ffmpeg.on('log', ({ message }) => {
                console.log(`[FFmpeg] ${message}`)
            })

            // Load FFmpeg core via jsdelivr CDN (ESM build for module worker compat)
            // Version 0.12.10 matches the locally installed @ffmpeg/core-mt
            const { toBlobURL } = await import('@ffmpeg/util')
            const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm'

            const [coreURL, wasmURL, workerURL] = await Promise.all([
                toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
                toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
                toBlobURL(`${baseURL}/ffmpeg-core.worker.js`, 'text/javascript'),
            ])

            console.log('[FFmpeg] Core loaded from CDN, initializing...')

            await ffmpeg.load({ coreURL, wasmURL, workerURL })

            console.log('[FFmpeg] Initialization complete')

            this.ffmpeg = ffmpeg
            this.initialized = true
        })()

        return this.initPromise
    }

    /**
     * Process video file with FFmpeg
     */
    async processVideo(
        inputFile: Blob,
        fileName: string,
        outputFileName: string,
        ffmpegArgs: string[]
    ): Promise<Blob> {
        if (!this.ffmpeg || !this.initialized) {
            throw new Error('FFmpeg not initialized')
        }

        try {
            // Write input file to FFmpeg's virtual file system
            const uint8Array = new Uint8Array(await inputFile.arrayBuffer())
            await this.ffmpeg.writeFile(fileName, uint8Array)

            try {
                // Run FFmpeg command (exec takes an array of args, not spread)
                await this.ffmpeg.exec(ffmpegArgs)

                // Read output file (readFile returns Promise<FileData> where FileData = Uint8Array | string)
                const outputData = await this.ffmpeg.readFile(outputFileName)
                // Create new Uint8Array to avoid SharedArrayBuffer compatibility issues with Blob
                const blob = new Blob([new Uint8Array(outputData as Uint8Array)], { type: inputFile.type })

                return blob
            } finally {
                // Always clean up files from virtual filesystem (swallow errors during cleanup)
                await this.ffmpeg.deleteFile(fileName).catch(() => {})
                await this.ffmpeg.deleteFile(outputFileName).catch(() => {})
            }
        } catch (error) {
            throw new Error(`FFmpeg processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
    }

    /**
     * Check if FFmpeg is loaded and ready
     */
    isReady(): boolean {
        return this.initialized && this.ffmpeg?.loaded === true
    }

    /**
     * Clean up FFmpeg resources
     */
    async cleanup(): Promise<void> {
        if (this.ffmpeg?.loaded) {
            try {
                this.ffmpeg.writeFile('delete_marker.tmp', new Uint8Array())
            } catch (error) {
                console.error('Error cleaning up FFmpeg:', error)
            }
        }
        this.initialized = false
        this.ffmpeg = null
    }
}

export const ffmpegService = new FFmpegService()
