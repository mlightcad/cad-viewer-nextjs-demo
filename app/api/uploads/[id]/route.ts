import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db, ensureDb, parseReceivedBitmap } from '@/lib/db'
import { uploads } from '@/lib/schema'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  await ensureDb()
  const { id } = await params

  const rows = await db.select().from(uploads).where(eq(uploads.id, id)).limit(1)
  const upload = rows[0]
  if (!upload) {
    return NextResponse.json({ error: 'Upload not found' }, { status: 404 })
  }

  const received = parseReceivedBitmap(upload.receivedBitmap)
  return NextResponse.json({
    uploadId: upload.id,
    drawingId: upload.drawingId,
    fileName: upload.fileName,
    totalSize: upload.totalSize,
    chunkSize: upload.chunkSize,
    totalChunks: upload.totalChunks,
    received,
  })
}
