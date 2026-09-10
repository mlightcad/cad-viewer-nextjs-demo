import { mkdir } from 'node:fs/promises'
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

import { db, ensureDb } from '@/lib/db'
import { drawings, uploads } from '@/lib/schema'
import { uploadDir } from '@/lib/storage'
import { CHUNK_SIZE, validateUploadMeta } from '@/lib/upload'
import { resumePendingConverts } from '@/lib/convert-queue'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  await ensureDb()
  await resumePendingConverts()

  const body = (await request.json()) as {
    fileName?: string
    fileSize?: number
    lastModified?: number
  }

  const fileName = body.fileName?.trim()
  const fileSize = Number(body.fileSize)
  if (!fileName) {
    return NextResponse.json({ error: 'fileName required' }, { status: 400 })
  }

  const validated = validateUploadMeta(fileName, fileSize)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const drawingId = nanoid(12)
  const uploadId = nanoid(16)
  const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)
  const now = Date.now()

  await db.insert(drawings).values({
    id: drawingId,
    name: fileName,
    ext: validated.ext,
    size: fileSize,
    status: 'uploading',
    error: null,
    createdAt: now,
  })

  await db.insert(uploads).values({
    id: uploadId,
    drawingId,
    fileName,
    totalSize: fileSize,
    chunkSize: CHUNK_SIZE,
    totalChunks,
    receivedBitmap: '',
    createdAt: now,
  })

  await mkdir(uploadDir(uploadId), { recursive: true })

  return NextResponse.json({
    uploadId,
    drawingId,
    chunkSize: CHUNK_SIZE,
    totalChunks,
  })
}
