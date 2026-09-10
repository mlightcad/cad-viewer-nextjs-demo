import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { NextResponse } from 'next/server'

import { db, ensureDb } from '@/lib/db'
import { drawings } from '@/lib/schema'
import { originalPath } from '@/lib/storage'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: Params) {
  await ensureDb()
  const { id } = await params

  const rows = await db.select().from(drawings).where(eq(drawings.id, id)).limit(1)
  const row = rows[0]
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (row.status === 'uploading') {
    return NextResponse.json({ error: 'File not ready' }, { status: 409 })
  }

  try {
    const buf = await readFile(originalPath(id, row.ext))
    const contentType =
      row.ext === 'dxf' ? 'application/dxf' : 'application/acad'
    return new NextResponse(buf, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(row.name)}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File missing' }, { status: 404 })
  }
}
