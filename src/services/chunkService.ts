/**
 * Chunk Service
 * Handles file chunking, upload coordination, and chunk reassembly
 */

import { storageService, StoredChunk, UploadSession } from './storageService'

export interface ChunkUploadOptions {
    chunkSize?: number // Default: 5MB
    onProgress?: (uploadedBytes: number, totalBytes: number) => void
    onChunkComplete?: (chunkIndex: number, totalChunks: number) => void
}

export interface UploadProgress {
    uploadId: string
    fileName: string
    totalSize: number
    uploadedSize: number
    progress: number // 0-100
    uploadedChunks: number
    totalChunks: number
    status: 'in-progress' | 'completed' | 'failed'
}

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024 // 5MB

class ChunkService {
    private activeUploads = new Map<string, AbortController>()

    /**
     * Split a file into chunks and prepare for upload
     */
    async prepareFileChunks(
        file: File,
        options: ChunkUploadOptions = {}
    ): Promise<{ uploadId: string; chunks: Blob[] }> {
        const chunkSize = options.chunkSize || DEFAULT_CHUNK_SIZE
        const chunks: Blob[] = []
        let offset = 0

        while (offset < file.size) {
            const end = Math.min(offset + chunkSize, file.size)
            chunks.push(file.slice(offset, end))
            offset = end
        }

        const uploadId = this.generateUploadId()
        const session: UploadSession = {
            uploadId,
            fileName: file.name,
            fileSize: file.size,
            chunkSize,
            totalChunks: chunks.length,
            uploadedChunks: [],
            status: 'in-progress',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        }

        await storageService.saveUploadSession(session)
        return { uploadId, chunks }
    }

    /**
     * Upload a single chunk
     */
    async uploadChunk(
        uploadId: string,
        chunkIndex: number,
        chunkData: Blob
    ): Promise<void> {
        const chunkId = `${uploadId}-chunk-${chunkIndex}`
        const arrayBuffer = await chunkData.arrayBuffer()

        const chunk: StoredChunk = {
            id: chunkId,
            uploadId,
            chunkIndex,
            data: arrayBuffer,
            size: chunkData.size,
            timestamp: Date.now(),
        }

        await storageService.saveChunk(chunk)

        // Update session
        const session = await storageService.getUploadSession(uploadId)
        if (session) {
            const uploadedChunks = new Set([...session.uploadedChunks, chunkIndex])
            session.uploadedChunks = Array.from(uploadedChunks)
            session.updatedAt = Date.now()

            if (session.uploadedChunks.length === session.totalChunks) {
                session.status = 'completed'
            }

            await storageService.saveUploadSession(session)
        }
    }

    /**
     * Upload all chunks for a file
     */
    async uploadFileChunks(
        file: File,
        options: ChunkUploadOptions = {}
    ): Promise<string> {
        const { uploadId, chunks } = await this.prepareFileChunks(file, options)
        const abortController = new AbortController()
        this.activeUploads.set(uploadId, abortController)

        try {
            let uploadedBytes = 0

            for (let i = 0; i < chunks.length; i++) {
                if (abortController.signal.aborted) {
                    throw new Error('Upload cancelled')
                }

                const chunk = chunks[i]
                await this.uploadChunk(uploadId, i, chunk)

                uploadedBytes += chunk.size
                options.onProgress?.(uploadedBytes, file.size)
                options.onChunkComplete?.(i + 1, chunks.length)
            }

            return uploadId
        } catch (error) {
            const session = await storageService.getUploadSession(uploadId)
            if (session) {
                session.status = 'failed'
                await storageService.saveUploadSession(session)
            }
            throw error
        } finally {
            this.activeUploads.delete(uploadId)
        }
    }

    /**
     * Cancel an active upload
     */
    cancelUpload(uploadId: string): void {
        const abortController = this.activeUploads.get(uploadId)
        if (abortController) {
            abortController.abort()
            this.activeUploads.delete(uploadId)
        }
    }

    /**
     * Reassemble chunks into a complete file
     */
    async reassembleFile(uploadId: string): Promise<Blob> {
        const session = await storageService.getUploadSession(uploadId)
        if (!session) {
            throw new Error(`Upload session not found: ${uploadId}`)
        }

        if (session.status !== 'completed') {
            throw new Error(`Upload not completed: ${session.status}`)
        }

        const chunks = await storageService.getUploadChunks(uploadId)
        chunks.sort((a, b) => a.chunkIndex - b.chunkIndex)

        const buffers = chunks.map(chunk => chunk.data)
        return new Blob(buffers, { type: 'application/octet-stream' })
    }

    /**
     * Get upload progress
     */
    async getUploadProgress(uploadId: string): Promise<UploadProgress | null> {
        const session = await storageService.getUploadSession(uploadId)
        if (!session) {
            return null
        }

        const uploadedSize = session.uploadedChunks.length * session.chunkSize
        const progress = Math.min((uploadedSize / session.fileSize) * 100, 100)

        return {
            uploadId,
            fileName: session.fileName,
            totalSize: session.fileSize,
            uploadedSize,
            progress,
            uploadedChunks: session.uploadedChunks.length,
            totalChunks: session.totalChunks,
            status: session.status,
        }
    }

    /**
     * Resume an incomplete upload
     */
    async resumeUpload(
        uploadId: string,
        file: File,
        options: ChunkUploadOptions = {}
    ): Promise<string> {
        const session = await storageService.getUploadSession(uploadId)
        if (!session) {
            throw new Error(`Upload session not found: ${uploadId}`)
        }

        const chunks = this.splitIntoChunks(file, session.chunkSize)
        const abortController = new AbortController()
        this.activeUploads.set(uploadId, abortController)

        try {
            let uploadedBytes = session.uploadedChunks.length * session.chunkSize

            for (let i = 0; i < chunks.length; i++) {
                if (session.uploadedChunks.includes(i)) {
                    continue // Skip already uploaded chunks
                }

                if (abortController.signal.aborted) {
                    throw new Error('Upload cancelled')
                }

                const chunk = chunks[i]
                await this.uploadChunk(uploadId, i, chunk)

                uploadedBytes += chunk.size
                options.onProgress?.(uploadedBytes, file.size)
                options.onChunkComplete?.(i + 1, chunks.length)
            }

            return uploadId
        } catch (error) {
            session.status = 'failed'
            await storageService.saveUploadSession(session)
            throw error
        } finally {
            this.activeUploads.delete(uploadId)
        }
    }

    /**
     * Clean up completed upload
     */
    async cleanupUpload(uploadId: string): Promise<void> {
        await storageService.deleteUploadChunks(uploadId)
        await storageService.deleteUploadSession(uploadId)
    }

    /**
     * Get memory usage stats
     */
    async getMemoryStats(): Promise<{
        quotaBytes: number
        usedBytes: number
        availableBytes: number
        usagePercent: number
    }> {
        const stats = await storageService.getStorageStats()

        if ('storage' in navigator && 'estimate' in navigator.storage) {
            const estimate = await navigator.storage.estimate()
            return {
                quotaBytes: estimate.quota || 0,
                usedBytes: estimate.usage || 0,
                availableBytes: (estimate.quota || 0) - (estimate.usage || 0),
                usagePercent: ((estimate.usage || 0) / (estimate.quota || 1)) * 100,
            }
        }

        return {
            quotaBytes: 0,
            usedBytes: stats.totalSize,
            availableBytes: 0,
            usagePercent: 0,
        }
    }

    /**
     * Helper: Check if browser supports required features
     */
    isSupported(): boolean {
        return (
            'indexedDB' in window &&
            'Blob' in window &&
            'ArrayBuffer' in window
        )
    }

    /**
     * Helper: Generate unique upload ID
     */
    private generateUploadId(): string {
        return `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }

    /**
     * Helper: Split file into chunks
     */
    private splitIntoChunks(file: File, chunkSize: number): Blob[] {
        const chunks: Blob[] = []
        let offset = 0

        while (offset < file.size) {
            const end = Math.min(offset + chunkSize, file.size)
            chunks.push(file.slice(offset, end))
            offset = end
        }

        return chunks
    }
}

export const chunkService = new ChunkService()
