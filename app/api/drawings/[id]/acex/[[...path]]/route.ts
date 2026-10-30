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

/**
 * Chunk filenames stay `chunks/L0-000.acex.gz` across reconverts, including a
 * canvas-background change that rewrites the bytes. Those responses are
 * cached as immutable, and the viewer only accepts relative package paths
 * (no query string). Serve `chunks/v<mtime>/<file>` from the manifest and
 * strip that segment before reading disk.
 */
function chunkCacheVersion(mtimeMs: number): string | null {
  const version = String(Math.round(mtimeMs))
  return /^\d+$/.test(version) ? version : null
}

function stampManifestChunkHrefs(text: string, version: string): string {
  return text.replace(
    /"href"\s*:\s*"chunks\/([^"]+)"/g,
    (match, rest: string) => {
      if (!/^[A-Za-z0-9._-]+$/.test(rest)) return match
      return `"href":"chunks/v${version}/${rest}"`
    }
  )
}

function unwrapChunkCacheVersion(relative: string): string {
  const match = /^chunks\/v\d+\/([^/]+)$/.exec(relative)
  if (!match?.[1]) return relative
  return `chunks/${match[1]}`
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
  const storedRelative = unwrapChunkCacheVersion(relative)

  let fullPath: string
  try {
    fullPath = resolveAcExPath(id, storedRelative)
  } catch {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  try {
    const info = await stat(fullPath)
    if (!info.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 })
    }
    const buf = await readFile(fullPath)
    const version = chunkCacheVersion(info.mtimeMs)
    const body =
      storedRelative === 'drawing.acex.json' && version
        ? stampManifestChunkHrefs(buf.toString('utf8'), version)
        : buf
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
    return new NextResponse(body, { headers })
  } catch {
    return NextResponse.json(
      { error: `Missing ${path.basename(fullPath)}` },
      { status: 404 }
    )
  }
}
