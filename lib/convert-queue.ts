import { eq } from 'drizzle-orm'
import { unzipSync } from 'fflate'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { db, ensureDb } from './db'
import { drawings } from './schema'
import {
  acexDir,
  convertWorkDir,
  originalPath,
  previewPath,
  previewPathJpg,
} from './storage'

type QueueItem = { drawingId: string }

const queue: QueueItem[] = []
let running = false
let resumed = false

function scriptPath() {
  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'scripts',
    'export-html-multi-preview.scr'
  )
}

async function unzipAcExZip(zipBytes: Uint8Array, targetDir: string) {
  const files = unzipSync(zipBytes)
  await mkdir(targetDir, { recursive: true })
  for (const [name, data] of Object.entries(files)) {
    const normalized = name.replace(/\\/g, '/')
    if (!normalized || normalized.endsWith('/')) continue
    if (normalized.includes('..')) {
      throw new Error(`Unsafe zip entry: ${name}`)
    }
    const dest = path.join(targetDir, normalized)
    await mkdir(path.dirname(dest), { recursive: true })
    await writeFile(dest, data)
  }
}

async function convertOne(drawingId: string) {
  await ensureDb()
  const rows = await db
    .select()
    .from(drawings)
    .where(eq(drawings.id, drawingId))
    .limit(1)
  const drawing = rows[0]
  if (!drawing) return

  await db
    .update(drawings)
    .set({ status: 'processing', error: null })
    .where(eq(drawings.id, drawingId))

  const workParent = convertWorkDir(drawingId)
  await mkdir(workParent, { recursive: true })
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), `cad-convert-${drawingId}-`))

  try {
    const input = originalPath(drawingId, drawing.ext)
    const { runHeadless } = await import('@mlightcad/cad-simple-viewer-cli')

    const { savedFiles } = await runHeadless({
      inputPath: input,
      scriptPath: scriptPath(),
      outputDir: tmpDir,
      mode: 'read',
    })

    const listed = await readdir(tmpDir)
    const zipFile =
      savedFiles.find((f) => f.toLowerCase().endsWith('.zip')) ??
      listed
        .map((f) => path.join(tmpDir, f))
        .find((f) => f.toLowerCase().endsWith('.zip'))

    if (!zipFile) {
      throw new Error('Conversion produced no ACEX zip')
    }

    const rasterFile =
      savedFiles.find((f) => /\.(png|jpe?g)$/i.test(f)) ??
      listed
        .map((f) => path.join(tmpDir, f))
        .find((f) => /\.(png|jpe?g)$/i.test(f))

    const targetAcEx = acexDir(drawingId)
    await rm(targetAcEx, { recursive: true, force: true })
    await mkdir(targetAcEx, { recursive: true })

    const zipBytes = new Uint8Array(await readFile(zipFile))
    const extractTmp = path.join(tmpDir, '_extract')
    await unzipAcExZip(zipBytes, extractTmp)

    const extracted = await readdir(extractTmp, { withFileTypes: true })
    let sourceRoot = extractTmp
    if (
      extracted.length === 1 &&
      extracted[0].isDirectory() &&
      extracted[0].name !== 'chunks'
    ) {
      sourceRoot = path.join(extractTmp, extracted[0].name)
    }

    async function copyTree(src: string, dest: string) {
      await mkdir(dest, { recursive: true })
      const entries = await readdir(src, { withFileTypes: true })
      for (const entry of entries) {
        const s = path.join(src, entry.name)
        const d = path.join(dest, entry.name)
        if (entry.isDirectory()) {
          await copyTree(s, d)
        } else {
          await copyFile(s, d)
        }
      }
    }

    await copyTree(sourceRoot, targetAcEx)

    if (rasterFile) {
      const lower = rasterFile.toLowerCase()
      if (lower.endsWith('.png')) {
        await copyFile(rasterFile, previewPath(drawingId))
      } else {
        await copyFile(rasterFile, previewPathJpg(drawingId))
      }
    }

    await db
      .update(drawings)
      .set({ status: 'ready', error: null })
      .where(eq(drawings.id, drawingId))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[convert] ${drawingId} failed:`, err)
    await db
      .update(drawings)
      .set({ status: 'failed', error: message })
      .where(eq(drawings.id, drawingId))
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
    await rm(workParent, { recursive: true, force: true }).catch(() => undefined)
  }
}

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const item = queue.shift()!
      await convertOne(item.drawingId)
    }
  } finally {
    running = false
  }
}

export function enqueueConvert(drawingId: string) {
  if (!queue.some((q) => q.drawingId === drawingId)) {
    queue.push({ drawingId })
  }
  void pump()
}

/** Re-queue drawings left in processing after a server restart. */
export async function resumePendingConverts() {
  if (resumed) return
  resumed = true
  await ensureDb()
  const pending = await db
    .select()
    .from(drawings)
    .where(eq(drawings.status, 'processing'))
  for (const row of pending) {
    enqueueConvert(row.id)
  }
}
