import { eq } from 'drizzle-orm'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'

import { enqueueConvert, resumePendingConverts } from '@/lib/convert-queue'
import { db, ensureDb, parseReceivedBitmap } from '@/lib/db'
import { drawings, uploads } from '@/lib/schema'
import { chunkPath, drawingDir, originalPath, uploadDir } from '@/lib/storage'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: Params) {
  await ensureDb()
  await resumePendingConverts()

  const { id } = await params
  const rows = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1)
  const upload = rows[0]
  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }

  const received = new Set(parseReceivedBitmap(upload.receivedBitmap))
  const missing: number[] = []
  for (let i = 0; i < upload.totalChunks; i++) {
    if (!received.has(i)) missing.push(i)
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: 'Missing chunks', missing },
      { status: 400 }
    )
  }

  const drawingRows = await db
    .select()
    .from(drawings)
    .where(eq(drawings.id, upload.drawingId))
    .limit(1)
  const drawing = drawingRows[0]
  if (!drawing) {
    return NextResponse.json({ error: 'Drawing not found' }, { status: 404 })
  }

  await mkdir(drawingDir(drawing.id), { recursive: true })
  const dest = originalPath(drawing.id, drawing.ext)
  const out = createWriteStream(dest)

  async function* chunkStream() {
    for (let i = 0; i < upload.totalChunks; i++) {
      const buf = await readFile(chunkPath(id, i))
      yield buf
    }
  }

  await pipeline(Readable.from(chunkStream()), out)

  await db
    .update(drawings)
    .set({ status: 'processing', error: null })
    .where(eq(drawings.id, drawing.id))

  // Cleanup upload chunks (best-effort)
  await rm(uploadDir(id), { recursive: true, force: true }).catch(() => undefined)
  await db.delete(uploads).where(eq(uploads.id, id))

  enqueueConvert(drawing.id)

  return NextResponse.json(
    { drawingId: drawing.id, status: 'processing' },
    { status: 202 }
  )
}
