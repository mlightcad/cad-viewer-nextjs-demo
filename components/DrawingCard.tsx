'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

import { BackgroundPicker } from '@/components/BackgroundPicker'
import { useI18n } from '@/components/I18nProvider'
import {
  formatBytes,
  formatDate,
  formatDuration,
  type DrawingDto,
} from '@/lib/client-upload'
import { parseHtmlBackground, type HtmlBackground } from '@/lib/html-background'

type Props = {
  drawing: DrawingDto
  onChanged: () => void
  /** Optimistic local removal before the DELETE request finishes. */
  onDeleted?: (id: string) => void
}

type PdfColorMode = 'color' | 'monochrome'

const statusClass: Record<string, string> = {
  uploading: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  processing: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}

export function DrawingCard({ drawing, onChanged, onDeleted }: Props) {
  const { t, locale } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const [exportPdfOpen, setExportPdfOpen] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const exportingPdfRef = useRef(false)
  const menuId = useId()
  const exportSubmenuId = useId()

  const statusLabel =
    drawing.status === 'uploading'
      ? t('uploading')
      : drawing.status === 'processing'
        ? t('processing')
        : drawing.status === 'ready'
          ? t('ready')
          : t('failed')

  const canLive =
    drawing.status === 'ready' ||
    drawing.status === 'processing' ||
    drawing.status === 'failed'
  const canPrerender = drawing.status === 'ready'
  const canRetry =
    drawing.status === 'failed' || drawing.status === 'ready'
  const canExportPdf = drawing.status !== 'uploading' && !exportingPdf

  const closeMenu = () => {
    setMenuOpen(false)
    setExportPdfOpen(false)
  }

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        closeMenu()
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const retryConvert = async (background?: HtmlBackground) => {
    closeMenu()
    await fetch(`/api/drawings/${drawing.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'retry-convert',
        ...(background ? { background } : {}),
      }),
    })
    onChanged()
  }

  const remove = async () => {
    closeMenu()
    if (!window.confirm(t('confirmDelete'))) return
    onDeleted?.(drawing.id)
    const res = await fetch(`/api/drawings/${drawing.id}`, { method: 'DELETE' })
    if (!res.ok) {
      // Restore list if delete failed (e.g. network / server error).
      onChanged()
      return
    }
    onChanged()
  }

  const exportPdf = async (colorMode: PdfColorMode) => {
    closeMenu()
    if (exportingPdfRef.current || drawing.status === 'uploading') return
    exportingPdfRef.current = true
    setExportingPdf(true)
    try {
      const res = await fetch(
        `/api/drawings/${drawing.id}/pdf?colorMode=${colorMode}`
      )
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        window.alert(
          body?.error ? `${t('exportPdfFailed')}: ${body.error}` : t('exportPdfFailed')
        )
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = /filename="([^"]+)"/.exec(disposition)
      const fallbackStem =
        drawing.name.replace(/\.[^.]+$/, '') || 'drawing'
      const fileName = match
        ? decodeURIComponent(match[1])
        : `${fallbackStem}${colorMode === 'monochrome' ? '-mono' : ''}.pdf`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      window.alert(`${t('exportPdfFailed')}: ${message}`)
    } finally {
      exportingPdfRef.current = false
      setExportingPdf(false)
    }
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative aspect-[4/3] bg-zinc-100 dark:bg-zinc-900">
        {drawing.hasPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/drawings/${drawing.id}/preview`}
            alt={drawing.name}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400">
            {drawing.status === 'processing' ? (
              <span className="animate-pulse">{t('processing')}…</span>
            ) : (
              t('noPreview')
            )}
          </div>
        )}

        {canPrerender ? (
          <Link
            href={`/view/${drawing.id}?mode=prerender`}
            aria-label={t('openPrerender')}
            className="absolute inset-0 z-10"
          />
        ) : null}

        <div ref={menuRef} className="absolute left-2 top-2 z-20">
          <button
            type="button"
            aria-label={t('moreActions')}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => {
              if (menuOpen) closeMenu()
              else setMenuOpen(true)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/65 text-white shadow-md backdrop-blur-sm transition hover:bg-black/80"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="currentColor"
              aria-hidden
            >
              <circle cx="5" cy="12" r="1.75" />
              <circle cx="12" cy="12" r="1.75" />
              <circle cx="19" cy="12" r="1.75" />
            </svg>
          </button>

          {menuOpen && (
            <div
              id={menuId}
              role="menu"
              className="absolute left-0 top-full mt-1.5 min-w-[12rem] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 py-1 text-sm shadow-xl"
            >
              {canLive ? (
                <Link
                  role="menuitem"
                  href={`/view/${drawing.id}?mode=live`}
                  className="block px-3 py-2 text-zinc-100 hover:bg-zinc-800"
                  onClick={closeMenu}
                >
                  {t('openLive')}
                </Link>
              ) : (
                <span
                  role="menuitem"
                  aria-disabled
                  className="block cursor-not-allowed px-3 py-2 text-zinc-500"
                >
                  {t('openLive')}
                </span>
              )}
              {canPrerender ? (
                <Link
                  role="menuitem"
                  href={`/view/${drawing.id}?mode=prerender`}
                  className="block px-3 py-2 text-zinc-100 hover:bg-zinc-800"
                  onClick={closeMenu}
                >
                  {t('openPrerender')}
                </Link>
              ) : (
                <span
                  role="menuitem"
                  aria-disabled
                  title={t('prerenderDisabled')}
                  className="block cursor-not-allowed px-3 py-2 text-zinc-500"
                >
                  {t('openPrerender')}
                </span>
              )}
              {canRetry ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-3 py-2 text-left text-zinc-100 hover:bg-zinc-800"
                  onClick={() => void retryConvert()}
                >
                  {t('retryConvert')}
                </button>
              ) : null}

              {canExportPdf ? (
                <div>
                  <button
                    type="button"
                    role="menuitem"
                    aria-expanded={exportPdfOpen}
                    aria-controls={exportSubmenuId}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-zinc-100 hover:bg-zinc-800"
                    onClick={() => setExportPdfOpen((v) => !v)}
                  >
                    <span>{t('exportPdf')}</span>
                    <svg
                      viewBox="0 0 20 20"
                      className={`h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform ${
                        exportPdfOpen ? 'rotate-90' : ''
                      }`}
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M7.25 4.5a.75.75 0 0 1 1.28-.53l5 5a.75.75 0 0 1 0 1.06l-5 5A.75.75 0 0 1 7.25 14.5v-10Z" />
                    </svg>
                  </button>
                  {exportPdfOpen ? (
                    <div
                      id={exportSubmenuId}
                      role="group"
                      aria-label={t('exportPdf')}
                      className="border-t border-zinc-800 bg-zinc-900/80 py-1"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-2 pl-6 text-left text-zinc-100 hover:bg-zinc-800"
                        onClick={() => void exportPdf('color')}
                      >
                        {t('exportPdfColor')}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="block w-full px-3 py-2 pl-6 text-left text-zinc-100 hover:bg-zinc-800"
                        onClick={() => void exportPdf('monochrome')}
                      >
                        {t('exportPdfMono')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <span
                  role="menuitem"
                  aria-disabled
                  className="block cursor-not-allowed px-3 py-2 text-zinc-500"
                >
                  {exportingPdf ? t('exportingPdf') : t('exportPdf')}
                </span>
              )}

              <button
                type="button"
                role="menuitem"
                className="block w-full px-3 py-2 text-left text-red-400 hover:bg-zinc-800"
                onClick={() => void remove()}
              >
                {t('delete')}
              </button>
            </div>
          )}
        </div>

        <span
          className={`absolute right-2 top-2 z-20 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass[drawing.status]}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="space-y-1 px-4 py-3">
        <h3
          className="truncate font-medium text-zinc-900 dark:text-zinc-50"
          title={drawing.name}
        >
          {drawing.name}
        </h3>
        <p className="text-xs text-zinc-500">
          {t('fileSize')}: {formatBytes(drawing.size)} · {t('createdAt')}:{' '}
          {formatDate(drawing.createdAt, locale)}
          {drawing.convertMs != null ? (
            <>
              {' '}
              · {t('prerenderTime')}: {formatDuration(drawing.convertMs)}
            </>
          ) : null}
        </p>
        {drawing.error && (
          <p className="line-clamp-2 text-xs text-red-500" title={drawing.error}>
            {t('convertFailed')}: {drawing.error}
          </p>
        )}
        <BackgroundPicker
          value={parseHtmlBackground(drawing.background)}
          disabled={
            drawing.status === 'uploading' ||
            drawing.status === 'processing' ||
            exportingPdf
          }
          onChange={(next) => {
            if (next === parseHtmlBackground(drawing.background)) return
            void retryConvert(next)
          }}
        />
      </div>

      {exportingPdf ? (
        <div
          className="export-pdf-mask absolute inset-0 z-30 flex items-center justify-center overflow-hidden bg-zinc-950/55 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <div className="relative z-10 flex flex-col items-center gap-3 px-4 text-center text-white">
            <span
              className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white"
              aria-hidden
            />
            <span className="text-sm font-medium tracking-wide">
              {t('exportingPdf')}
            </span>
          </div>
        </div>
      ) : null}
    </article>
  )
}
