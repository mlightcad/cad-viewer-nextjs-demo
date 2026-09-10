'use client'

import { useEffect, useRef, useState } from 'react'

import { useI18n } from '@/components/I18nProvider'

type Props = {
  drawingId: string
  fileName: string
}

/**
 * Browser-side live DWG/DXF viewer using @mlightcad/cad-simple-viewer.
 * Must only be mounted client-side (no SSR).
 */
export function LiveViewer({ drawingId, fileName }: Props) {
  const { t, locale } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const host = hostRef.current
    if (!host) return

    ;(async () => {
      try {
        const [
          {
            AcApDocManager,
            AcEdOpenMode,
            AcApI18n,
            LIBREDWG_PARSER_WORKER_FILE,
            MTEXT_RENDERER_WORKER_FILE,
            acedApplyUiTheme,
          },
          { AcDbDatabaseConverterManager, AcDbFileType },
          { AcDbLibreDwgConverter },
          { acuiRegisterSimpleUiPlugin },
        ] = await Promise.all([
          import('@mlightcad/cad-simple-viewer'),
          import('@mlightcad/data-model'),
          import('@mlightcad/libredwg-converter'),
          import('@mlightcad/cad-simple-ui-plugin/register'),
        ])

        if (cancelled) return

        const dwgParserUrl = `/workers/${LIBREDWG_PARSER_WORKER_FILE}`
        const mtextUrl = `/workers/${MTEXT_RENDERER_WORKER_FILE}`

        try {
          AcDbDatabaseConverterManager.instance.register(
            AcDbFileType.DWG,
            new AcDbLibreDwgConverter({
              useWorker: true,
              parserWorkerUrl: dwgParserUrl,
            })
          )
        } catch {
          /* may already be registered */
        }

        acedApplyUiTheme('dark', host)
        try {
          AcApI18n.setCurrentLocale(locale === 'zh' ? 'zh' : 'en')
        } catch {
          /* optional */
        }

        const existing = AcApDocManager.tryGetInstance()
        if (existing) {
          await existing.destroy()
        }
        if (cancelled) return

        const manager = AcApDocManager.createInstance({
          container: host,
          autoResize: true,
          baseUrl: 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/',
          webworkerFileUrls: {
            mtextRender: mtextUrl,
            dwgParser: dwgParserUrl,
          },
        })

        if (!manager) {
          throw new Error('Failed to create AcApDocManager')
        }

        try {
          await acuiRegisterSimpleUiPlugin(manager.pluginManager, {
            host,
            toolbar: { placement: 'right', items: 'default' },
          })
        } catch {
          /* plugin may already be loaded */
        }

        const res = await fetch(`/api/drawings/${drawingId}/file`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buffer = await res.arrayBuffer()
        if (cancelled) return

        const ok = await manager.openDocument(fileName, buffer, {
          mode: AcEdOpenMode.Read,
        })
        if (!ok) throw new Error('openDocument returned false')
        if (!cancelled) setLoading(false)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [drawingId, fileName, locale])

  return (
    <div className="relative h-full w-full bg-zinc-950">
      <div ref={hostRef} className="h-full w-full" />
      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-950/70 text-sm text-zinc-200">
          {t('loadingViewer')}
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 text-sm text-red-400">
          {t('errorLoad')}: {error}
        </div>
      )}
    </div>
  )
}
