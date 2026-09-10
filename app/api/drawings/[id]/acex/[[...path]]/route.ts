import { eq } from 'drizzle-orm'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

import { db, ensureDb } from '@/lib/db'
import { drawings } from '@/lib/schema'
import { resolveAcExPath } from '@/lib/storage'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string; path?: string[] }> }

function contentTypeFor(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html; charset=utf-8'
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.css')) return 'text/css; charset=utf-8'
  if (lower.endsWith('.js')) return 'application/javascript; charset=utf-8'
  // Critical: opaque bytes for .gz — do NOT set Content-Encoding: gzip
  if (lower.endsWith('.gz')) return 'application/octet-stream'
  return 'application/octet-stream'
}

export async function GET(_request: Request, { params }: Params) {
  await ensureDb()
  const { id, path: segments } = await params

  const rows = await db.select().from(drawings).where(eq(drawings.id, id)).limit(1)
  const row = rows[0]
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const relative =
    !segments || segments.length === 0 ? 'viewer.html' : segments.join('/')

  let fullPath: string
  try {
    fullPath = resolveAcExPath(id, relative)
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  try {
    const info = await stat(fullPath)
    if (!info.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 })
    }
    const buf = await readFile(fullPath)
    const headers: Record<string, string> = {
      'Content-Type': contentTypeFor(fullPath),
      'Cache-Control': relative.includes('chunks/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    }
    // Explicitly avoid Content-Encoding for .gz assets
    if (fullPath.toLowerCase().endsWith('.gz')) {
      headers['X-Content-Type-Options'] = 'nosniff'
    }
    return new NextResponse(buf, { headers })
  } catch {
    return NextResponse.json(
      { error: `Missing ${path.basename(fullPath)}` },
      { status: 404 }
    )
  }
}
