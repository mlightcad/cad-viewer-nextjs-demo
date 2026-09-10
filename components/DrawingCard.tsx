'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

import { useI18n } from '@/components/I18nProvider'
import { formatBytes, formatDate, type DrawingDto } from '@/lib/client-upload'

type Props = {
  drawing: DrawingDto
  onChanged: () => void
}

const statusClass: Record<string, string> = {
  uploading: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  processing: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  ready: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
}

export function DrawingCard({ drawing, onChanged }: Props) {
  const { t, locale } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

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

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const retryConvert = async () => {
    setMenuOpen(false)
    await fetch(`/api/drawings/${drawing.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'retry-convert' }),
    })
    onChanged()
  }

  const remove = async () => {
    setMenuOpen(false)
    if (!window.confirm(t('confirmDelete'))) return
    await fetch(`/api/drawings/${drawing.id}`, { method: 'DELETE' })
    onChanged()
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
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
            onClick={() => setMenuOpen((v) => !v)}
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
              className="absolute left-0 top-full mt-1.5 min-w-[11.5rem] overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950 py-1 text-sm shadow-xl"
            >
              {canLive ? (
                <Link
                  role="menuitem"
                  href={`/view/${drawing.id}?mode=live`}
                  className="block px-3 py-2 text-zinc-100 hover:bg-zinc-800"
                  onClick={() => setMenuOpen(false)}
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
                  onClick={() => setMenuOpen(false)}
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
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass[drawing.status]}`}
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
        </p>
        {drawing.error && (
          <p className="line-clamp-2 text-xs text-red-500" title={drawing.error}>
            {t('convertFailed')}: {drawing.error}
          </p>
        )}
      </div>
    </article>
  )
}
