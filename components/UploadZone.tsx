'use client'

import { useCallback, useRef, useState } from 'react'

import { useI18n } from '@/components/I18nProvider'
import { clientSampleDrawingUrl } from '@/lib/cad-data-url'
import {
  formatBytes,
  uploadFileChunked,
  type UploadController,
  type UploadProgress,
} from '@/lib/client-upload'

type Props = {
  onUploaded: () => void
}

export function UploadZone({ onUploaded }: Props) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [controller, setController] = useState<UploadController | null>(null)
  const [sampleLoading, setSampleLoading] = useState(false)

  const runUpload = useCallback(
    async (file: File) => {
      const ctrl = uploadFileChunked(file, setProgress)
      setController(ctrl)
      try {
        await ctrl.promise
        onUploaded()
      } catch {
        /* surfaced via progress */
      } finally {
        setController(null)
      }
    },
    [onUploaded]
  )

  const onFiles = useCallback(
    (files: FileList | File[] | null) => {
      if (!files) return
      const list = Array.from(files)
      void (async () => {
        for (const file of list) {
          const lower = file.name.toLowerCase()
          if (!lower.endsWith('.dwg') && !lower.endsWith('.dxf')) continue
          await runUpload(file)
        }
      })()
    },
    [runUpload]
  )

  const loadSample = async () => {
    setSampleLoading(true)
    try {
      const res = await fetch(clientSampleDrawingUrl())
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      const file = new File([buf], 'canteen.dwg', {
        type: 'application/acad',
        lastModified: Date.now(),
      })
      await runUpload(file)
    } catch (err) {
      setProgress({
        fileName: 'canteen.dwg',
        uploadId: '',
        drawingId: '',
        loaded: 0,
        total: 1,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setSampleLoading(false)
    }
  }

  const pct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
      : 0

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {t('uploadTitle')}
      </h2>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        {t('uploadHint')}
      </p>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          onFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 transition ${
          dragOver
            ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40'
            : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".dwg,.dxf,application/acad,image/vnd.dxf"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {t('uploadButton')}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={sampleLoading || !!controller}
          onClick={() => void loadSample()}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {sampleLoading ? t('loadingSample') : t('loadSample')}
        </button>
        {controller && progress?.status === 'uploading' && (
          <button
            type="button"
            onClick={() => controller.pause()}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
          >
            {t('pause')}
          </button>
        )}
        {controller && progress?.status === 'paused' && (
          <button
            type="button"
            onClick={() => controller.resume()}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
          >
            {t('resume')}
          </button>
        )}
      </div>

      {progress && progress.status !== 'done' && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-zinc-500">
            <span>
              {progress.fileName} · {t('progress')} {pct}%
            </span>
            <span>
              {formatBytes(progress.loaded)} / {formatBytes(progress.total)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className={`h-full transition-all ${
                progress.status === 'error' ? 'bg-red-500' : 'bg-sky-500'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {progress.status === 'completing' && (
            <p className="mt-1 text-xs text-zinc-500">{t('uploadComplete')}</p>
          )}
          {progress.error && (
            <p className="mt-1 text-xs text-red-500">{progress.error}</p>
          )}
        </div>
      )}
    </section>
  )
}
