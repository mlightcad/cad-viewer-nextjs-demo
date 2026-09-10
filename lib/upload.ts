import path from 'node:path'

export const CHUNK_SIZE = 2 * 1024 * 1024 // 2 MiB
export const MAX_FILE_SIZE = 200 * 1024 * 1024 // 200 MiB
export const ALLOWED_EXTS = new Set(['dwg', 'dxf'])

export function getFileExt(fileName: string): string | null {
  const ext = path.extname(fileName).slice(1).toLowerCase()
  return ALLOWED_EXTS.has(ext) ? ext : null
}

export function validateUploadMeta(fileName: string, fileSize: number) {
  const ext = getFileExt(fileName)
  if (!ext) {
    return { ok: false as const, error: 'Only .dwg and .dxf files are allowed' }
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { ok: false as const, error: 'Invalid file size' }
  }
  if (fileSize > MAX_FILE_SIZE) {
    return {
      ok: false as const,
      error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`,
    }
  }
  return { ok: true as const, ext }
}

export function expectedChunkSize(
  index: number,
  totalSize: number,
  chunkSize: number,
  totalChunks: number
) {
  if (index < 0 || index >= totalChunks) return null
  if (index === totalChunks - 1) {
    return totalSize - chunkSize * (totalChunks - 1)
  }
  return chunkSize
}

/** Client-side resume key. */
export function uploadResumeKey(
  fileName: string,
  fileSize: number,
  lastModified: number
) {
  return `cad-upload:${fileName}:${fileSize}:${lastModified}`
}
