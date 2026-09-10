'use client'

import { useCallback, useEffect, useState } from 'react'

import { DrawingCard } from '@/components/DrawingCard'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { UploadZone } from '@/components/UploadZone'
import { useI18n } from '@/components/I18nProvider'
import type { DrawingDto } from '@/lib/client-upload'

export function DriveHome() {
  const { t } = useI18n()
  const [drawings, setDrawings] = useState<DrawingDto[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/drawings')
      if (!res.ok) return
      const data = (await res.json()) as { drawings: DrawingDto[] }
      setDrawings(data.drawings)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Poll while any drawing is processing / uploading
  useEffect(() => {
    const busy = drawings.some(
      (d) => d.status === 'processing' || d.status === 'uploading'
    )
    if (!busy) return
    const id = window.setInterval(() => void refresh(), 2500)
    return () => window.clearInterval(id)
  }, [drawings, refresh])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t('appTitle')}
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t('appSubtitle')}
          </p>
          <p className="mt-2 max-w-2xl text-xs text-zinc-400">
            {t('comparingModes')}
          </p>
        </div>
        <LanguageSwitcher className="shrink-0" />
      </header>

      <UploadZone onUploaded={() => void refresh()} />

      {loading ? (
        <p className="text-sm text-zinc-500">…</p>
      ) : drawings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
          <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-100">
            {t('emptyTitle')}
          </h2>
          <p className="mt-2 text-sm text-zinc-500">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {drawings.map((d) => (
            <DrawingCard key={d.id} drawing={d} onChanged={() => void refresh()} />
          ))}
        </div>
      )}
    </div>
  )
}
