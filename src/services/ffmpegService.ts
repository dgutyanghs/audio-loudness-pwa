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
    private abortAnalysis: AbortController | null = null

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

        // Cancel any in-flight analysis before processing
        this.cancelRunningAnalysis()

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
     * Cancel any running analysis (called before a new analysis or processing starts).
     */
    cancelRunningAnalysis(): void {
        if (this.abortAnalysis) {
            this.abortAnalysis.abort()
            this.abortAnalysis = null
        }
    }

    /**
     * Analyze audio loudness using a first-pass loudnorm measurement.
     * Runs FFmpeg on a short segment to trigger loudnorm JSON output,
     * then parses the measured values from the captured logs.
     */
    async runAnalysis(
        inputFile: Blob,
        fileName: string
    ): Promise<{ integrated: number; truePeak: number; lra: number }> {
        if (!this.ffmpeg || !this.initialized) {
            throw new Error('FFmpeg not initialized')
        }

        // Cancel any in-flight analysis
        this.cancelRunningAnalysis()

        const abort = new AbortController()
        this.abortAnalysis = abort

        const logs: string[] = []
        const logHandler = ({ message }: { message: string }) => {
            logs.push(message)
        }

        this.ffmpeg.on('log', logHandler)

        const analysisOutput = '__analysis_tmp.mp4'

        try {
            // Write input file
            const uint8Array = new Uint8Array(await inputFile.arrayBuffer())
            if (abort.signal.aborted) return { integrated: 0, truePeak: 0, lra: 0 }
            await this.ffmpeg.writeFile(fileName, uint8Array)

            // Run loudnorm analysis — audio only, first 5 seconds (fast regardless of file size).
            // The loudnorm filter prints JSON to stderr with input_i, input_tp, input_lra.
            await this.ffmpeg.exec([
                '-i', fileName,
                '-af', 'loudnorm=I=-16:TP=-3:LRA=11:print_format=json',
                '-t', '5',             // analyze first 5 seconds only
                '-vn',                 // skip video entirely
                '-c:a', 'aac',
                '-b:a', '64k',
                '-y',
                analysisOutput,
            ])

            if (abort.signal.aborted) return { integrated: 0, truePeak: 0, lra: 0 }

            // Parse the loudnorm JSON from captured logs.
            // The JSON is printed across multiple log lines:
            //   [Parsed_loudnorm_0 @ ...]
            //   {
            //       "input_i" : "-21.09",
            //       ...
            //   }
            // We need to collect the lines between { and } and parse the full object.
            const jsonLines: string[] = []
            let inJson = false

            for (const log of logs) {
                if (!inJson && log.trim() === '{') {
                    inJson = true
                    jsonLines.length = 0
                    jsonLines.push('{')
                } else if (inJson) {
                    jsonLines.push(log)
                    if (log.trim() === '}') {
                        break
                    }
                }
            }

            if (jsonLines.length > 0) {
                try {
                    const parsed = JSON.parse(jsonLines.join('\n'))
                    if (parsed.input_i !== undefined) {
                        return {
                            integrated: Math.round(parseFloat(parsed.input_i) * 100) / 100,
                            truePeak: Math.round(parseFloat(parsed.input_tp) * 100) / 100,
                            lra: Math.round(parseFloat(parsed.input_lra) * 100) / 100,
                        }
                    }
                } catch {
                    // JSON parse failed — fall through to fallback
                }
            }

            // Fallback if no JSON found in logs
            return { integrated: 0, truePeak: 0, lra: 0 }
        } finally {
            this.ffmpeg.off('log', logHandler)
            this.abortAnalysis = null
            await this.ffmpeg.deleteFile(fileName).catch(() => {})
            await this.ffmpeg.deleteFile(analysisOutput).catch(() => {})
        }
    }

    /**
     * Terminate the FFmpeg Web Worker and free all WASM memory.
     * Call this between processing sessions to prevent memory accumulation
     * (critical on iOS Safari with its per-tab memory limits).
     */
    terminateWorker(): void {
        if (this.ffmpeg) {
            try {
                this.ffmpeg.terminate()
            } catch (error) {
                console.error('Error terminating FFmpeg worker:', error)
            }
        }
        this.ffmpeg = null
        this.initialized = false
        this.initPromise = null
        this.abortAnalysis = null
    }

    /**
     * Clean up FFmpeg resources. Delegates to terminateWorker()
     * for complete memory release.
     */
    async cleanup(): Promise<void> {
        this.terminateWorker()
    }
}

export const ffmpegService = new FFmpegService()
