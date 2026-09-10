import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'

import { db, ensureDb } from '@/lib/db'
import { resolvePreviewFile } from '@/lib/preview'
import { drawings } from '@/lib/schema'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  await ensureDb()
  const { id } = await params

  const rows = await db.select().from(drawings).where(eq(drawings.id, id)).limit(1)
  if (!rows[0]) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const preview = await resolvePreviewFile(id)
  if (!preview) {
    return NextResponse.json({ error: 'No preview' }, { status: 404 })
  }

  try {
    const buf = await readFile(preview.path)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': preview.contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return NextResponse.json({ error: 'No preview' }, { status: 404 })
  }
}
