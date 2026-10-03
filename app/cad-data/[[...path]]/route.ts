import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

import {
  CAD_DATA_CORS_HEADERS,
  cadDataIsPresent,
  contentTypeForCadData,
  resolveCadDataPath,
} from '@/lib/cad-data'

export const runtime = 'nodejs'

type Params = { params: Promise<{ path?: string[] }> }

const MISSING_SUBMODULE =
  'cad-data is missing. Run: git submodule update --init --recursive  or  pnpm sync:cad-data'

function corsHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...CAD_DATA_CORS_HEADERS, ...extra }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

async function serve(segments: string[] | undefined, includeBody: boolean) {
  if (!(await cadDataIsPresent())) {
    return NextResponse.json(
      { error: MISSING_SUBMODULE },
      { status: 503, headers: corsHeaders() }
    )
  }

  if (!segments || segments.length === 0) {
    return NextResponse.json(
      { error: 'Missing path' },
      { status: 404, headers: corsHeaders() }
    )
  }
  const relative = segments.join('/')

  let fullPath: string
  try {
    fullPath = resolveCadDataPath(relative)
  } catch {
    return NextResponse.json(
      { error: 'Invalid path' },
      { status: 400, headers: corsHeaders() }
    )
  }

  try {
    const info = await stat(fullPath)
    if (!info.isFile()) {
      return NextResponse.json(
        { error: 'Not a file' },
        { status: 404, headers: corsHeaders() }
      )
    }
    const headers = corsHeaders({
      'Content-Type': contentTypeForCadData(fullPath),
      'Cache-Control': 'public, max-age=86400',
      'Content-Length': String(info.size),
    })
    if (!includeBody) {
      return new NextResponse(null, { status: 200, headers })
    }
    const buf = await readFile(fullPath)
    return new NextResponse(buf, { headers })
  } catch {
    return NextResponse.json(
      { error: `Missing ${path.basename(fullPath)}` },
      { status: 404, headers: corsHeaders() }
    )
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { path: segments } = await params
  return serve(segments, true)
}

export async function HEAD(_request: Request, { params }: Params) {
  const { path: segments } = await params
  return serve(segments, false)
}
