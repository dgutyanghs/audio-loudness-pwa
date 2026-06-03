/**
 * useChunkedUpload Hook
 * React hook for managing chunked file uploads with progressive upload
 */

import { useState, useCallback, useEffect } from 'react'
import { chunkService, UploadProgress, ChunkUploadOptions } from '../services/chunkService'
import { storageService } from '../services/storageService'

export interface UploadState {
    uploadId: string | null
    isUploading: boolean
    progress: number // 0-100
    uploadedChunks: number
    totalChunks: number
    error: string | null
    currentFile: File | null
    memoryUsage: {
        quotaBytes: number
        usedBytes: number
        availableBytes: number
        usagePercent: number
    }
}

export interface UseChunkedUploadReturn {
    state: UploadState
    upload: (file: File, options?: ChunkUploadOptions) => Promise<string>
    resume: (uploadId: string, file: File, options?: ChunkUploadOptions) => Promise<string>
    cancel: (uploadId: string) => void
    cleanup: (uploadId: string) => Promise<void>
    reassemble: (uploadId: string) => Promise<Blob>
    getProgress: (uploadId: string) => Promise<UploadProgress | null>
    clearError: () => void
    updateMemoryStats: () => Promise<void>
}

export const useChunkedUpload = (): UseChunkedUploadReturn => {
    const [state, setState] = useState<UploadState>({
        uploadId: null,
        isUploading: false,
        progress: 0,
        uploadedChunks: 0,
        totalChunks: 0,
        error: null,
        currentFile: null,
        memoryUsage: {
            quotaBytes: 0,
            usedBytes: 0,
            availableBytes: 0,
            usagePercent: 0,
        },
    })

    // Initialize storage on mount
    useEffect(() => {
        storageService.init().catch(err => {
            setState(prev => ({
                ...prev,
                error: `Failed to initialize storage: ${err.message}`,
            }))
        })
    }, [])

    // Update memory stats periodically
    useEffect(() => {
        const interval = setInterval(() => {
            updateMemoryStats()
        }, 5000)

        return () => clearInterval(interval)
    }, [])

    const updateMemoryStats = useCallback(async () => {
        try {
            const memoryUsage = await chunkService.getMemoryStats()
            setState(prev => ({
                ...prev,
                memoryUsage,
            }))
        } catch (err) {
            console.error('Failed to update memory stats:', err)
        }
    }, [])

    const upload = useCallback(
        async (file: File, options: ChunkUploadOptions = {}): Promise<string> => {
            try {
                // Check browser support
                if (!chunkService.isSupported()) {
                    throw new Error('Browser does not support required features for chunked upload')
                }

                setState(prev => ({
                    ...prev,
                    isUploading: true,
                    error: null,
                    currentFile: file,
                }))

                // Upload all chunks (this will prepare chunks internally)
                const uploadId = await chunkService.uploadFileChunks(file, {
                    onProgress: (uploadedBytes, totalBytes) => {
                        const totalChunks = Math.ceil(totalBytes / (5 * 1024 * 1024))
                        const progress = (uploadedBytes / totalBytes) * 100
                        setState(prev => ({
                            ...prev,
                            progress: Math.min(progress, 99),
                            uploadedChunks: Math.floor((uploadedBytes / totalBytes) * totalChunks),
                            totalChunks: totalChunks,
                        }))
                        options.onProgress?.(uploadedBytes, totalBytes)
                    },
                    onChunkComplete: (chunkIndex, totalChunks) => {
                        setState(prev => ({
                            ...prev,
                            uploadedChunks: chunkIndex,
                            totalChunks,
                        }))
                        options.onChunkComplete?.(chunkIndex, totalChunks)
                    },
                })

                setState(prev => ({
                    ...prev,
                    isUploading: false,
                    progress: 100,
                    uploadId,
                }))

                await updateMemoryStats()
                return uploadId
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'Upload failed'
                setState(prev => ({
                    ...prev,
                    isUploading: false,
                    error: errorMsg,
                }))
                throw err
            }
        },
        []
    )

    const resume = useCallback(
        async (uploadId: string, file: File, options: ChunkUploadOptions = {}): Promise<string> => {
            try {
                setState(prev => ({
                    ...prev,
                    isUploading: true,
                    error: null,
                    uploadId,
                    currentFile: file,
                }))

                const progress = await chunkService.getUploadProgress(uploadId)
                if (progress) {
                    setState(prev => ({
                        ...prev,
                        uploadedChunks: progress.uploadedChunks,
                        totalChunks: progress.totalChunks,
                        progress: progress.progress,
                    }))
                }

                const resumeUploadId = await chunkService.resumeUpload(uploadId, file, options)

                setState(prev => ({
                    ...prev,
                    isUploading: false,
                    progress: 100,
                    uploadId: resumeUploadId,
                }))

                await updateMemoryStats()
                return resumeUploadId
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : 'Resume failed'
                setState(prev => ({
                    ...prev,
                    isUploading: false,
                    error: errorMsg,
                }))
                throw err
            }
        },
        []
    )

    const cancel = useCallback((uploadId: string) => {
        chunkService.cancelUpload(uploadId)
        setState(prev => ({
            ...prev,
            isUploading: false,
            error: 'Upload cancelled',
        }))
    }, [])

    const cleanup = useCallback(async (uploadId: string) => {
        try {
            await chunkService.cleanupUpload(uploadId)
            setState(prev => ({
                ...prev,
                uploadId: null,
                isUploading: false,
                progress: 0,
                uploadedChunks: 0,
                totalChunks: 0,
                currentFile: null,
            }))
            await updateMemoryStats()
        } catch (err) {
            console.error('Cleanup failed:', err)
        }
    }, [])

    const reassemble = useCallback(async (uploadId: string): Promise<Blob> => {
        try {
            const file = await chunkService.reassembleFile(uploadId)
            return file
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Reassemble failed'
            setState(prev => ({
                ...prev,
                error: errorMsg,
            }))
            throw err
        }
    }, [])

    const getProgress = useCallback(
        async (uploadId: string): Promise<UploadProgress | null> => {
            try {
                return await chunkService.getUploadProgress(uploadId)
            } catch (err) {
                console.error('Failed to get progress:', err)
                return null
            }
        },
        []
    )

    const clearError = useCallback(() => {
        setState(prev => ({
            ...prev,
            error: null,
        }))
    }, [])

    return {
        state,
        upload,
        resume,
        cancel,
        cleanup,
        reassemble,
        getProgress,
        clearError,
        updateMemoryStats,
    }
}
