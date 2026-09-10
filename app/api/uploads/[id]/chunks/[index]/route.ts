import { eq } from 'drizzle-orm'
import { writeFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'

import { db, ensureDb, parseReceivedBitmap, serializeReceivedBitmap } from '@/lib/db'
import { uploads } from '@/lib/schema'
import { chunkPath } from '@/lib/storage'
import { expectedChunkSize } from '@/lib/upload'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string; index: string }> }

export async function PUT(request: Request, { params }: Params) {
  await ensureDb()
  const { id, index: indexStr } = await params
  const index = Number(indexStr)
  if (!Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: 'Invalid chunk index' }, { status: 400 })
  }

  const rows = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1)
  const upload = rows[0]
  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }

  const expected = expectedChunkSize(
    index,
    upload.totalSize,
    upload.chunkSize,
    upload.totalChunks
  )
  if (expected == null) {
    return NextResponse.json({ error: 'Chunk index out of range' }, { status: 400 })
  }

  const buffer = Buffer.from(await request.arrayBuffer())
  if (buffer.byteLength !== expected) {
    return NextResponse.json(
      {
        error: `Chunk size mismatch: expected ${expected}, got ${buffer.byteLength}`,
      },
      { status: 400 }
    )
  }

  await writeFile(chunkPath(id, index), buffer)

  const received = parseReceivedBitmap(upload.receivedBitmap)
  if (!received.includes(index)) {
    received.push(index)
    await db
      .update(uploads)
      .set({ receivedBitmap: serializeReceivedBitmap(received) })
      .where(eq(uploads.id, id))
  }

  return NextResponse.json({
    ok: true,
    index,
    received: parseReceivedBitmap(
      (
        await db.select().from(uploads).where(eq(uploads.id, id)).limit(1)
      )[0]?.receivedBitmap ?? ''
    ),
  })
}
