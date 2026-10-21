import { eq } from 'drizzle-orm'
import { rm } from 'node:fs/promises'
import { NextResponse } from 'next/server'

import { cancelConvert, enqueueConvert, resumePendingConverts } from '@/lib/convert-queue'
import { db, ensureDb } from '@/lib/db'
import { hasPreviewImage } from '@/lib/preview'
import { drawings, uploads } from '@/lib/schema'
import { drawingDir, uploadDir } from '@/lib/storage'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  await ensureDb()
  await resumePendingConverts()
  const { id } = await params

  const rows = await db.select().from(drawings).where(eq(drawings.id, id)).limit(1)
  const row = rows[0]
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: row.id,
    name: row.name,
    ext: row.ext,
    size: row.size,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    convertMs: row.convertMs,
    hasPreview: await hasPreviewImage(row.id),
  })
}

export async function DELETE(_request: Request, { params }: Params) {
  await ensureDb()
  const { id } = await params

  // Stop queued / in-flight convert so it cannot recreate files after delete.
  cancelConvert(id)

  const uploadRows = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(eq(uploads.drawingId, id))
  for (const row of uploadRows) {
    await rm(uploadDir(row.id), { recursive: true, force: true }).catch(
      () => undefined
    )
  }

  await db.delete(uploads).where(eq(uploads.drawingId, id))
  await db.delete(drawings).where(eq(drawings.id, id))
  // Removes original.*, preview.*, and acex/ prerender package.
  await rm(drawingDir(id), { recursive: true, force: true }).catch(() => undefined)

  return NextResponse.json({ ok: true })
}

/** Retry conversion for a failed / ready drawing. */
export async function POST(request: Request, { params }: Params) {
  await ensureDb()
  await resumePendingConverts()
  const { id } = await params
  const body = (await request.json().catch(() => ({}))) as { action?: string }

  if (body.action !== 'retry-convert') {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const rows = await db.select().from(drawings).where(eq(drawings.id, id)).limit(1)
  const row = rows[0]
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (row.status === 'uploading') {
    return NextResponse.json({ error: 'Still uploading' }, { status: 400 })
  }

  await db
    .update(drawings)
    .set({ status: 'processing', error: null, convertMs: null })
    .where(eq(drawings.id, id))
  enqueueConvert(id)

  return NextResponse.json({ status: 'processing' }, { status: 202 })
}
