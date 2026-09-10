import { mkdir } from 'node:fs/promises'
import path from 'node:path'

export const DATA_ROOT = path.join(process.cwd(), 'data')
export const DB_PATH = path.join(DATA_ROOT, 'app.db')

export function uploadDir(uploadId: string) {
  return path.join(DATA_ROOT, 'uploads', uploadId)
}

export function chunkPath(uploadId: string, index: number) {
  return path.join(uploadDir(uploadId), `chunk-${index}`)
}

export function drawingDir(drawingId: string) {
  return path.join(DATA_ROOT, 'drawings', drawingId)
}

export function originalPath(drawingId: string, ext: string) {
  return path.join(drawingDir(drawingId), `original.${ext}`)
}

export function previewPath(drawingId: string) {
  return path.join(drawingDir(drawingId), 'preview.png')
}

export function previewPathJpg(drawingId: string) {
  return path.join(drawingDir(drawingId), 'preview.jpg')
}

export function acexDir(drawingId: string) {
  return path.join(drawingDir(drawingId), 'acex')
}

export function convertWorkDir(drawingId: string) {
  return path.join(drawingDir(drawingId), '.convert')
}

export async function ensureDataDirs() {
  await mkdir(DATA_ROOT, { recursive: true })
  await mkdir(path.join(DATA_ROOT, 'uploads'), { recursive: true })
  await mkdir(path.join(DATA_ROOT, 'drawings'), { recursive: true })
}

/** Resolve a path under acexDir; throws if it escapes the package root. */
export function resolveAcExPath(drawingId: string, relativePath: string) {
  const root = path.resolve(acexDir(drawingId))
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) {
    throw new Error('Invalid path')
  }
  const full = path.resolve(root, normalized)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('Path escape')
  }
  return full
}
