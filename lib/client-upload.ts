import type { DrawingStatus } from '@/lib/schema'
import { CHUNK_SIZE, uploadResumeKey } from '@/lib/upload'

export type DrawingDto = {
  id: string
  name: string
  ext: string
  size: number
  status: DrawingStatus
  error: string | null
  createdAt: number
  hasPreview: boolean
}

export type UploadProgress = {
  fileName: string
  uploadId: string
  drawingId: string
  loaded: number
  total: number
  status: 'uploading' | 'paused' | 'completing' | 'done' | 'error'
  error?: string
}

type InitResponse = {
  uploadId: string
  drawingId: string
  chunkSize: number
  totalChunks: number
}

async function initUpload(file: File): Promise<InitResponse> {
  const res = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Init failed (${res.status})`)
  }
  return res.json()
}

async function getUploadStatus(uploadId: string) {
  const res = await fetch(`/api/uploads/${uploadId}`)
  if (!res.ok) throw new Error('Cannot resume upload')
  return res.json() as Promise<{
    received: number[]
    totalChunks: number
    chunkSize: number
    totalSize: number
    drawingId: string
  }>
}

function saveResume(file: File, uploadId: string) {
  try {
    localStorage.setItem(
      uploadResumeKey(file.name, file.size, file.lastModified),
      uploadId
    )
  } catch {
    /* ignore */
  }
}

function loadResume(file: File): string | null {
  try {
    return localStorage.getItem(
      uploadResumeKey(file.name, file.size, file.lastModified)
    )
  } catch {
    return null
  }
}

function clearResume(file: File) {
  try {
    localStorage.removeItem(
      uploadResumeKey(file.name, file.size, file.lastModified)
    )
  } catch {
    /* ignore */
  }
}

export type UploadController = {
  pause: () => void
  resume: () => void
  promise: Promise<string>
}

/**
 * Chunked upload with pause/resume and localStorage checkpoint.
 * Returns drawingId when complete.
 */
export function uploadFileChunked(
  file: File,
  onProgress: (p: UploadProgress) => void
): UploadController {
  let paused = false
  let pauseWaiters: Array<() => void> = []

  const waitIfPaused = () =>
    new Promise<void>((resolve) => {
      if (!paused) {
        resolve()
        return
      }
      pauseWaiters.push(resolve)
    })

  const ctrl: UploadController = {
    pause: () => {
      paused = true
      onProgress({
        fileName: file.name,
        uploadId: currentUploadId,
        drawingId: currentDrawingId,
        loaded: currentLoaded,
        total: file.size,
        status: 'paused',
      })
    },
    resume: () => {
      paused = false
      const waiters = pauseWaiters
      pauseWaiters = []
      waiters.forEach((w) => w())
    },
    promise: Promise.resolve(''),
  }

  let currentUploadId = ''
  let currentDrawingId = ''
  let currentLoaded = 0

  ctrl.promise = (async () => {
    let uploadId = loadResume(file)
    let chunkSize = CHUNK_SIZE
    let totalChunks = Math.ceil(file.size / chunkSize)
    let received = new Set<number>()

    if (uploadId) {
      try {
        const status = await getUploadStatus(uploadId)
        received = new Set(status.received)
        chunkSize = status.chunkSize
        totalChunks = status.totalChunks
        currentDrawingId = status.drawingId
        currentUploadId = uploadId
      } catch {
        uploadId = null
        clearResume(file)
      }
    }

    if (!uploadId) {
      const init = await initUpload(file)
      uploadId = init.uploadId
      chunkSize = init.chunkSize
      totalChunks = init.totalChunks
      currentDrawingId = init.drawingId
      currentUploadId = uploadId
      saveResume(file, uploadId)
    }

    const markLoaded = () => {
      let loaded = 0
      for (let i = 0; i < totalChunks; i++) {
        if (!received.has(i)) continue
        if (i === totalChunks - 1) {
          loaded += file.size - chunkSize * (totalChunks - 1)
        } else {
          loaded += chunkSize
        }
      }
      currentLoaded = loaded
      onProgress({
        fileName: file.name,
        uploadId: currentUploadId,
        drawingId: currentDrawingId,
        loaded,
        total: file.size,
        status: paused ? 'paused' : 'uploading',
      })
    }

    markLoaded()

    for (let i = 0; i < totalChunks; i++) {
      if (received.has(i)) continue
      await waitIfPaused()
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.size)
      const blob = file.slice(start, end)
      const res = await fetch(`/api/uploads/${uploadId}/chunks/${i}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: blob,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Chunk ${i} failed`)
      }
      received.add(i)
      markLoaded()
    }

    onProgress({
      fileName: file.name,
      uploadId: currentUploadId,
      drawingId: currentDrawingId,
      loaded: file.size,
      total: file.size,
      status: 'completing',
    })

    const complete = await fetch(`/api/uploads/${uploadId}/complete`, {
      method: 'POST',
    })
    if (!complete.ok) {
      const err = await complete.json().catch(() => ({}))
      throw new Error(err.error || 'Complete failed')
    }

    clearResume(file)
    onProgress({
      fileName: file.name,
      uploadId: currentUploadId,
      drawingId: currentDrawingId,
      loaded: file.size,
      total: file.size,
      status: 'done',
    })
    return currentDrawingId
  })().catch((err: Error) => {
    onProgress({
      fileName: file.name,
      uploadId: currentUploadId,
      drawingId: currentDrawingId,
      loaded: currentLoaded,
      total: file.size,
      status: 'error',
      error: err.message,
    })
    throw err
  })

  return ctrl
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(ts: number, locale: string) {
  return new Date(ts).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US')
}
