'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { PrerenderViewer } from '@/components/PrerenderViewer'
import { useI18n } from '@/components/I18nProvider'
import type { DrawingDto } from '@/lib/client-upload'

const LiveViewer = dynamic(
  () =>
    import('@/components/LiveViewer').then((m) => m.LiveViewer),
  { ssr: false, loading: () => null }
)

type Props = {
  drawingId: string
  mode: 'live' | 'prerender'
}

export function ViewPageClient({ drawingId, mode }: Props) {
  const { t } = useI18n()
  const [drawing, setDrawing] = useState<DrawingDto | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/drawings/${drawingId}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as DrawingDto
        if (!cancelled) setDrawing(data)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [drawingId])

  return (
    <div className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-zinc-800 px-3 py-2">
        <Link
          href="/"
          className="rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white"
        >
          ← {t('backHome')}
        </Link>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">
          {drawing?.name ?? drawingId}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">{t('modeLabel')}:</span>
          <Link
            href={`/view/${drawingId}?mode=live`}
            className={`rounded-md px-2 py-1 ${
              mode === 'live'
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            {t('viewLive')}
          </Link>
          <Link
            href={`/view/${drawingId}?mode=prerender`}
            className={`rounded-md px-2 py-1 ${
              mode === 'prerender'
                ? 'bg-sky-600 text-white'
                : 'text-zinc-400 hover:bg-zinc-800'
            }`}
          >
            {t('viewPrerender')}
          </Link>
        </div>
        <LanguageSwitcher />
      </header>

      <main className="min-h-0 flex-1">
        {error && (
          <div className="flex h-full items-center justify-center text-red-400">
            {t('errorLoad')}: {error}
          </div>
        )}
        {!error && !drawing && (
          <div className="flex h-full items-center justify-center text-zinc-400">
            {t('loadingDrawing')}
          </div>
        )}
        {!error && drawing && mode === 'live' && (
          <LiveViewer drawingId={drawing.id} fileName={drawing.name} />
        )}
        {!error && drawing && mode === 'prerender' && (
          drawing.status === 'ready' ? (
            <PrerenderViewer drawingId={drawing.id} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-400">
              <p>{t('prerenderDisabled')}</p>
              <p className="text-xs">status: {drawing.status}</p>
            </div>
          )
        )}
      </main>
    </div>
  )
}
