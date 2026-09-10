import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdirSync } from 'node:fs'

import * as schema from './schema'
import { DATA_ROOT, DB_PATH, ensureDataDirs } from './storage'

mkdirSync(DATA_ROOT, { recursive: true })

const client = createClient({
  url: `file:${DB_PATH}`,
})

export const db = drizzle(client, { schema })

let migrated = false

export async function ensureDb() {
  await ensureDataDirs()
  if (migrated) return
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS drawings (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      ext TEXT NOT NULL,
      size INTEGER NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY NOT NULL,
      drawing_id TEXT NOT NULL REFERENCES drawings(id),
      file_name TEXT NOT NULL,
      total_size INTEGER NOT NULL,
      chunk_size INTEGER NOT NULL,
      total_chunks INTEGER NOT NULL,
      received_bitmap TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `)
  migrated = true
}

export function parseReceivedBitmap(bitmap: string): number[] {
  if (!bitmap.trim()) return []
  return bitmap
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0)
}

export function serializeReceivedBitmap(indices: number[]): string {
  return [...new Set(indices)].sort((a, b) => a - b).join(',')
}
