'use client'

import { useI18n } from '@/components/I18nProvider'

type Props = {
  drawingId: string
}

/**
 * Hosts the ACEX multi-file offline viewer (viewer.html) in an iframe.
 * Assets are served by /api/drawings/[id]/acex/* without Content-Encoding on .gz.
 */
export function PrerenderViewer({ drawingId }: Props) {
  const { t } = useI18n()
  const src = `/api/drawings/${drawingId}/acex/viewer.html`

  return (
    <div className="relative h-full w-full bg-zinc-950">
      <iframe
        title={t('viewPrerender')}
        src={src}
        className="h-full w-full border-0"
        allow="fullscreen"
      />
    </div>
  )
}
