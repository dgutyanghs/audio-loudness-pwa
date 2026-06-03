/**
 * IndexedDB Storage Service
 * Manages persistent storage of file chunks and upload metadata
 */

const DB_NAME = 'LoudnessProcessorDB'
const DB_VERSION = 1
const CHUNKS_STORE = 'fileChunks'
const UPLOADS_STORE = 'uploadSessions'

export interface StoredChunk {
    id: string
    uploadId: string
    chunkIndex: number
    data: ArrayBuffer
    size: number
    timestamp: number
}

export interface UploadSession {
    uploadId: string
    fileName: string
    fileSize: number
    chunkSize: number
    totalChunks: number
    uploadedChunks: number[]
    status: 'in-progress' | 'completed' | 'failed'
    createdAt: number
    updatedAt: number
}

class StorageService {
    private db: IDBDatabase | null = null
    private initPromise: Promise<void> | null = null

    async init(): Promise<void> {
        if (this.db) return
        if (this.initPromise) return this.initPromise

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                this.db = request.result
                resolve()
            }

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result

                // Create chunks store
                if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
                    const chunksStore = db.createObjectStore(CHUNKS_STORE, { keyPath: 'id' })
                    chunksStore.createIndex('uploadId', 'uploadId', { unique: false })
                }

                // Create upload sessions store
                if (!db.objectStoreNames.contains(UPLOADS_STORE)) {
                    const uploadsStore = db.createObjectStore(UPLOADS_STORE, { keyPath: 'uploadId' })
                    uploadsStore.createIndex('status', 'status', { unique: false })
                }
            }
        })

        return this.initPromise
    }

    async saveChunk(chunk: StoredChunk): Promise<void> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([CHUNKS_STORE], 'readwrite')
            const store = transaction.objectStore(CHUNKS_STORE)
            const request = store.put(chunk)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })
    }

    async getChunk(chunkId: string): Promise<StoredChunk | undefined> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([CHUNKS_STORE], 'readonly')
            const store = transaction.objectStore(CHUNKS_STORE)
            const request = store.get(chunkId)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
    }

    async getUploadChunks(uploadId: string): Promise<StoredChunk[]> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([CHUNKS_STORE], 'readonly')
            const store = transaction.objectStore(CHUNKS_STORE)
            const index = store.index('uploadId')
            const request = index.getAll(uploadId)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
    }

    async deleteChunk(chunkId: string): Promise<void> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([CHUNKS_STORE], 'readwrite')
            const store = transaction.objectStore(CHUNKS_STORE)
            const request = store.delete(chunkId)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })
    }

    async deleteUploadChunks(uploadId: string): Promise<void> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        const chunks = await this.getUploadChunks(uploadId)
        for (const chunk of chunks) {
            await this.deleteChunk(chunk.id)
        }
    }

    async saveUploadSession(session: UploadSession): Promise<void> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([UPLOADS_STORE], 'readwrite')
            const store = transaction.objectStore(UPLOADS_STORE)
            const request = store.put(session)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })
    }

    async getUploadSession(uploadId: string): Promise<UploadSession | undefined> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([UPLOADS_STORE], 'readonly')
            const store = transaction.objectStore(UPLOADS_STORE)
            const request = store.get(uploadId)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
    }

    async getAllUploadSessions(): Promise<UploadSession[]> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([UPLOADS_STORE], 'readonly')
            const store = transaction.objectStore(UPLOADS_STORE)
            const request = store.getAll()

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve(request.result)
        })
    }

    async deleteUploadSession(uploadId: string): Promise<void> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([UPLOADS_STORE], 'readwrite')
            const store = transaction.objectStore(UPLOADS_STORE)
            const request = store.delete(uploadId)

            request.onerror = () => reject(request.error)
            request.onsuccess = () => resolve()
        })
    }

    async clearExpiredData(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
        await this.init()
        const now = Date.now()
        const sessions = await this.getAllUploadSessions()

        for (const session of sessions) {
            if (now - session.updatedAt > maxAgeMs) {
                await this.deleteUploadChunks(session.uploadId)
                await this.deleteUploadSession(session.uploadId)
            }
        }
    }

    async getStorageStats(): Promise<{ chunksCount: number; uploadsCount: number; totalSize: number }> {
        await this.init()
        if (!this.db) throw new Error('Database not initialized')

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction([CHUNKS_STORE], 'readonly')
            const store = transaction.objectStore(CHUNKS_STORE)
            const request = store.getAll()

            request.onerror = () => reject(request.error)
            request.onsuccess = () => {
                const chunks = request.result as StoredChunk[]
                const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0)
                resolve({
                    chunksCount: chunks.length,
                    uploadsCount: 0, // Will be calculated separately
                    totalSize,
                })
            }
        })
    }
}

export const storageService = new StorageService()
