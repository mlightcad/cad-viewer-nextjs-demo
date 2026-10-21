import { eq } from 'drizzle-orm'
import {
  type ChildProcess,
  execFileSync,
  spawn,
} from 'node:child_process'
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { rm } from 'node:fs/promises'

import { cadDataRoot } from './cad-data'
import { db, ensureDb } from './db'
import { drawings } from './schema'
import {
  acexDir,
  drawingDir,
  originalPath,
  previewPathJpg,
} from './storage'

type QueueItem = { drawingId: string }

const queue: QueueItem[] = []
const activeChildren = new Map<string, ChildProcess>()
const cancelled = new Set<string>()
let running = false
let resumed = false

function convertScriptPath() {
  return path.join(process.cwd(), 'scripts', 'convert-drawing.mjs')
}

/** Survives HMR / module reload so we can kill orphans after `activeChildren` is lost. */
function convertPidPath(drawingId: string) {
  return path.join(drawingDir(drawingId), '.convert.pid')
}

function killPid(pid: number) {
  if (pid <= 0) return
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      })
    } catch {
      /* already gone */
    }
    return
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
}

function clearConvertPid(drawingId: string) {
  try {
    unlinkSync(convertPidPath(drawingId))
  } catch {
    /* missing */
  }
}

/** Kill a convert child left over after HMR or server restart (pid file on disk). */
function killOrphanConvert(drawingId: string) {
  const pidFile = convertPidPath(drawingId)
  if (!existsSync(pidFile)) return
  try {
    const pid = Number(readFileSync(pidFile, 'utf8').trim())
    if (Number.isFinite(pid) && pid > 0) {
      killPid(pid)
    }
  } catch {
    /* unreadable */
  }
  clearConvertPid(drawingId)
}

function runExportInChild(
  drawingId: string,
  input: string,
  targetAcEx: string,
  fontsDir: string,
  previewJpg: string
): Promise<void> {
  // Ensure no leftover writer from a previous server instance / HMR reload.
  killOrphanConvert(drawingId)

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [convertScriptPath(), input, targetAcEx, fontsDir, previewJpg],
      {
        stdio: ['ignore', 'inherit', 'inherit'],
        env: process.env,
        windowsHide: true,
      }
    )
    activeChildren.set(drawingId, child)
    if (child.pid) {
      try {
        writeFileSync(convertPidPath(drawingId), String(child.pid), 'utf8')
      } catch (err) {
        console.error(`[convert] failed to write pid file for ${drawingId}:`, err)
      }
    }

    child.on('error', (err) => {
      activeChildren.delete(drawingId)
      clearConvertPid(drawingId)
      reject(err)
    })

    child.on('exit', (code, signal) => {
      activeChildren.delete(drawingId)
      clearConvertPid(drawingId)
      if (cancelled.has(drawingId)) {
        resolve()
        return
      }
      if (code === 0) {
        resolve()
        return
      }
      reject(
        new Error(
          signal
            ? `Convert process killed (${signal})`
            : `Convert process exited with code ${code}`
        )
      )
    })
  })
}

/** Drop queued work and kill an in-flight convert for this drawing. */
export function cancelConvert(drawingId: string) {
  cancelled.add(drawingId)
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].drawingId === drawingId) {
      queue.splice(i, 1)
    }
  }
  const child = activeChildren.get(drawingId)
  if (child && !child.killed) {
    child.kill()
  }
  // After HMR, `activeChildren` may be empty while the child still runs.
  killOrphanConvert(drawingId)
}

async function drawingStillExists(drawingId: string): Promise<boolean> {
  const rows = await db
    .select({ id: drawings.id })
    .from(drawings)
    .where(eq(drawings.id, drawingId))
    .limit(1)
  return Boolean(rows[0])
}

async function convertOne(drawingId: string) {
  if (cancelled.has(drawingId)) {
    cancelled.delete(drawingId)
    return
  }

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
    .set({ status: 'processing', error: null, convertMs: null })
    .where(eq(drawings.id, drawingId))

  const targetAcEx = acexDir(drawingId)
  const input = originalPath(drawingId, drawing.ext)
  const startedAt = Date.now()

  try {
    await runExportInChild(
      drawingId,
      input,
      targetAcEx,
      cadDataRoot(),
      previewPathJpg(drawingId)
    )

    const convertMs = Math.max(0, Date.now() - startedAt)

    if (cancelled.has(drawingId)) {
      cancelled.delete(drawingId)
      await rm(drawingDir(drawingId), { recursive: true, force: true }).catch(
        () => undefined
      )
      return
    }

    if (!(await drawingStillExists(drawingId))) {
      await rm(drawingDir(drawingId), { recursive: true, force: true }).catch(
        () => undefined
      )
      return
    }

    await db
      .update(drawings)
      .set({ status: 'ready', error: null, convertMs })
      .where(eq(drawings.id, drawingId))
  } catch (err) {
    const convertMs = Math.max(0, Date.now() - startedAt)

    if (cancelled.has(drawingId)) {
      cancelled.delete(drawingId)
      await rm(drawingDir(drawingId), { recursive: true, force: true }).catch(
        () => undefined
      )
      return
    }

    if (!(await drawingStillExists(drawingId))) {
      await rm(drawingDir(drawingId), { recursive: true, force: true }).catch(
        () => undefined
      )
      return
    }

    const message = err instanceof Error ? err.message : String(err)
    console.error(`[convert] ${drawingId} failed:`, err)
    await db
      .update(drawings)
      .set({ status: 'failed', error: message, convertMs })
      .where(eq(drawings.id, drawingId))
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
  cancelled.delete(drawingId)
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
    // Stop any orphan writer before re-enqueueing the same drawing.
    killOrphanConvert(row.id)
    enqueueConvert(row.id)
  }
}
