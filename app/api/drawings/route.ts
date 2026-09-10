import { desc } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { resumePendingConverts } from '@/lib/convert-queue'
import { db, ensureDb } from '@/lib/db'
import { hasPreviewImage } from '@/lib/preview'
import { drawings } from '@/lib/schema'

export const runtime = 'nodejs'

export async function GET() {
  await ensureDb()
  await resumePendingConverts()

  const rows = await db.select().from(drawings).orderBy(desc(drawings.createdAt))

  const list = await Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      name: row.name,
      ext: row.ext,
      size: row.size,
      status: row.status,
      error: row.error,
      createdAt: row.createdAt,
      hasPreview: await hasPreviewImage(row.id),
    }))
  )

  return NextResponse.json({ drawings: list })
}
