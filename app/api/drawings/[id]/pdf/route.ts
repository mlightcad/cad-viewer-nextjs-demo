import { eq } from 'drizzle-orm'
import { type ChildProcess, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { NextResponse } from 'next/server'

import { cadDataRoot } from '@/lib/cad-data'
import { db, ensureDb } from '@/lib/db'
import { drawings } from '@/lib/schema'
import { originalPath } from '@/lib/storage'

export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

type PdfColorMode = 'color' | 'monochrome'

/** One in-flight PDF export per drawing (avoids stacking heavy child processes). */
const exportingIds = new Set<string>()
const activeExports = new Map<string, ChildProcess>()

const EXPORT_TIMEOUT_MS = 5 * 60 * 1000

function exportScriptPath() {
  return path.join(process.cwd(), 'scripts', 'export-pdf.mjs')
}

function pdfStem(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '').trim() || 'drawing'
  return stem.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').trim() || 'drawing'
}

function parseColorMode(value: string | null): PdfColorMode {
  return value === 'monochrome' ? 'monochrome' : 'color'
}

function killChild(child: ChildProcess) {
  if (child.killed) return
  if (process.platform === 'win32') {
    child.kill()
    return
  }
  child.kill('SIGTERM')
}

function runExportInChild(
  drawingId: string,
  input: string,
  outputPdf: string,
  fontsDir: string,
  title: string,
  colorMode: PdfColorMode
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [exportScriptPath(), input, outputPdf, fontsDir, title, colorMode],
      {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: process.env,
        windowsHide: true,
      }
    )
    activeExports.set(drawingId, child)

    const timer = setTimeout(() => {
      killChild(child)
      reject(new Error('PDF export timed out'))
    }, EXPORT_TIMEOUT_MS)

    const finish = (fn: () => void) => {
      clearTimeout(timer)
      if (activeExports.get(drawingId) === child) {
        activeExports.delete(drawingId)
      }
      fn()
    }

    child.on('error', (err) => {
      finish(() => reject(err))
    })
    child.on('exit', (code, signal) => {
      finish(() => {
        if (code === 0) {
          resolve()
          return
        }
        reject(
          new Error(
            signal
              ? `PDF export process killed (${signal})`
              : `PDF export process exited with code ${code}`
          )
        )
      })
    })
  })
}

/** Headless CAD → PDF via `@mlightcad/cad-pdf-exporter` (no browser). */
export async function GET(request: Request, { params }: Params) {
  await ensureDb()
  const { id } = await params
  const colorMode = parseColorMode(
    new URL(request.url).searchParams.get('colorMode')
  )

  const rows = await db.select().from(drawings).where(eq(drawings.id, id)).limit(1)
  const row = rows[0]
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (row.status === 'uploading') {
    return NextResponse.json({ error: 'File not ready' }, { status: 409 })
  }
  if (exportingIds.has(id)) {
    return NextResponse.json(
      { error: 'PDF export already in progress' },
      { status: 409 }
    )
  }
  exportingIds.add(id)

  const input = originalPath(id, row.ext)
  const stem = pdfStem(row.name)
  const fileStem = colorMode === 'monochrome' ? `${stem}-mono` : stem
  const title = stem

  // Unique temp dir so concurrent requests / DELETE cannot collide on the output file.
  let tempDir: string | undefined
  try {
    tempDir = await mkdtemp(path.join(tmpdir(), `cad-pdf-${id}-`))
    const outputPdf = path.join(tempDir, `${fileStem}.pdf`)
    await runExportInChild(id, input, outputPdf, cadDataRoot(), title, colorMode)
    const buf = await readFile(outputPdf)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileStem)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error(`[pdf] ${id} failed:`, err)
    return NextResponse.json(
      { error: 'PDF export failed' },
      { status: 500 }
    )
  } finally {
    exportingIds.delete(id)
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
