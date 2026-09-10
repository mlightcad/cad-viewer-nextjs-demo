import { access } from 'node:fs/promises'

import { previewPath, previewPathJpg } from './storage'

export async function hasPreviewImage(drawingId: string): Promise<boolean> {
  try {
    await access(previewPath(drawingId))
    return true
  } catch {
    /* try jpg */
  }
  try {
    await access(previewPathJpg(drawingId))
    return true
  } catch {
    return false
  }
}

export async function resolvePreviewFile(
  drawingId: string
): Promise<{ path: string; contentType: string } | null> {
  try {
    await access(previewPath(drawingId))
    return { path: previewPath(drawingId), contentType: 'image/png' }
  } catch {
    /* try jpg */
  }
  try {
    await access(previewPathJpg(drawingId))
    return { path: previewPathJpg(drawingId), contentType: 'image/jpeg' }
  } catch {
    return null
  }
}
