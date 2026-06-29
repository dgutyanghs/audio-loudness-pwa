/**
 * Loudness Processor Service
 * Normalizes audio in video files to specific LUFS levels using FFmpeg
 */

import { ffmpegService } from './ffmpegService'

type LoudnessPreset = '-5db' | '-8db' | '-12db' | '-14db'

interface LoudnessConfig {
    preset: LoudnessPreset
    integrated: number // LUFS target
    truePeak: number   // Maximum true peak level
    lra: number        // Loudness Range
}

const LOUDNESS_CONFIGS: Record<LoudnessPreset, LoudnessConfig> = {
    '-5db': {
        preset: '-5db',
        integrated: -5,  // Maximum loudness
        truePeak: -2,
        lra: 11,
    },
    '-8db': {
        preset: '-8db',
        integrated: -8,  // Strong loudness
        truePeak: -2,
        lra: 11,
    },
    '-12db': {
        preset: '-12db',
        integrated: -12,  // Normal loudness
        truePeak: -3,
        lra: 11,
    },
    '-14db': {
        preset: '-14db',
        integrated: -14,  // Moderate loudness
        truePeak: -3,
        lra: 11,
    },
}

class LoudnessProcessor {
    /**
     * Process video file to normalize loudness to target LUFS
     */
    async process(
        videoFile: Blob,
        fileName: string,
        loudnessPreset: LoudnessPreset,
        onProgress?: (progress: number) => void
    ): Promise<Blob> {
        // Initialize FFmpeg if needed
        if (!ffmpegService.isReady()) {
            onProgress?.(5)
            await ffmpegService.init()
        }

        const config = LOUDNESS_CONFIGS[loudnessPreset]
        if (!config) {
            throw new Error(`Unknown loudness preset: ${loudnessPreset}`)
        }

        onProgress?.(10)

        // Extract extension from fileName
        const fileExtension = fileName.split('.').pop() || 'mp4'
        const outputFileName = `output.${fileExtension}`

        // Build FFmpeg loudnorm filter string
        // loudnorm: EBU R128 loudness normalization
        // I: Integrated loudness (LUFS)
        // TP: True peak (dBFS)
        // LRA: Loudness range (LU)
        const loudnormFilter = `loudnorm=I=${config.integrated}:TP=${config.truePeak}:LRA=${config.lra}:print_format=json`

        // FFmpeg command for audio normalization
        // -i: input file
        // -af: audio filter
        // -c:a: audio codec (aac for compatibility)
        // -b:a: audio bitrate
        // -c:v: video codec (copy to speed up)
        // -y: overwrite output file
        const ffmpegArgs = [
            '-i',
            fileName,
            '-af',
            loudnormFilter,
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-c:v',
            'copy',
            '-y',
            outputFileName,
        ]

        onProgress?.(20)

        try {
            // Process the video
            const processedBlob = await ffmpegService.processVideo(
                videoFile,
                fileName,
                outputFileName,
                ffmpegArgs
            )

            onProgress?.(95)
            return processedBlob
        } catch (error) {
            throw new Error(
                `Failed to process video with loudness ${loudnessPreset}: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
        }
    }

    /**
     * Analyze loudness of a video file without modification.
     * Runs a first-pass loudnorm measurement and returns the detected
     * integrated LUFS, true peak, and loudness range.
     */
    async analyze(
        videoFile: Blob,
        fileName: string,
        onProgress?: (progress: number) => void
    ): Promise<{ integrated: number; truePeak: number; lra: number }> {
        if (!ffmpegService.isReady()) {
            onProgress?.(5)
            await ffmpegService.init()
        }

        onProgress?.(10)

        const result = await ffmpegService.runAnalysis(videoFile, fileName)

        onProgress?.(95)

        return result
    }

    /**
     * Get configuration for a loudness preset
     */
    getConfig(preset: LoudnessPreset): LoudnessConfig {
        return LOUDNESS_CONFIGS[preset]
    }

    /**
     * List all available loudness presets
     */
    getPresets(): LoudnessConfig[] {
        return Object.values(LOUDNESS_CONFIGS)
    }
}

export const loudnessProcessor = new LoudnessProcessor()
export type { LoudnessPreset, LoudnessConfig }
