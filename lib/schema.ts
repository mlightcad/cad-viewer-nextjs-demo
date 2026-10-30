import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export type DrawingStatus =
  | 'uploading'
  | 'processing'
  | 'ready'
  | 'failed'

export const drawings = sqliteTable('drawings', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ext: text('ext').notNull(),
  size: integer('size').notNull(),
  status: text('status').notNull().$type<DrawingStatus>(),
  error: text('error'),
  /** Wall-clock prerender duration in ms; null until a convert attempt finishes. */
  convertMs: integer('convert_ms'),
  /** Prerender canvas: black (default), white, or space (model black / paper white). */
  background: text('background').notNull().default('black'),
  createdAt: integer('created_at').notNull(),
})

export const uploads = sqliteTable('uploads', {
  id: text('id').primaryKey(),
  drawingId: text('drawing_id')
    .notNull()
    .references(() => drawings.id),
  fileName: text('file_name').notNull(),
  totalSize: integer('total_size').notNull(),
  chunkSize: integer('chunk_size').notNull(),
  totalChunks: integer('total_chunks').notNull(),
  /** Comma-separated list of received chunk indices, e.g. "0,1,3" */
  receivedBitmap: text('received_bitmap').notNull().default(''),
  createdAt: integer('created_at').notNull(),
})

export type Drawing = typeof drawings.$inferSelect
export type Upload = typeof uploads.$inferSelect
