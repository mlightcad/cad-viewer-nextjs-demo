'use client'

import { useEffect, useRef, useState } from 'react'

import { useI18n } from '@/components/I18nProvider'
import { clientCadDataBaseUrl } from '@/lib/cad-data-url'
import {
  dwgLicenseKeyFromEnv,
  registerClientDwgConverter,
  registerLibreDwgConverter
} from '@/lib/client-dwg-parser'

type Props = {
  drawingId: string
  fileName: string
}

/**
 * Browser-side live DWG/DXF viewer using @mlightcad/cad-simple-viewer.
 * Must only be mounted client-side (no SSR).
 *
 * DWG parser: prefers `@mlightcad/dwg-converter` when installed and deployed,
 * otherwise LibreDWG — same preference order as server-side prerendering.
 */
export function LiveViewer({ drawingId, fileName }: Props) {
  const { t, locale } = useI18n()
  const hostRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    let stopProgressWatch: (() => void) | undefined
    const host = hostRef.current
    if (!host) return

    ;(async () => {
      try {
        const [
          {
            AcApDocManager,
            AcEdOpenMode,
            AcApI18n,
            DWG_PARSER_WORKER_FILE,
            LIBREDWG_PARSER_WORKER_FILE,
            MTEXT_RENDERER_WORKER_FILE,
            acedApplyUiTheme,
            eventBus,
          },
          { acuiRegisterSimpleUiPlugin },
        ] = await Promise.all([
          import('@mlightcad/cad-simple-viewer'),
          import('@mlightcad/cad-simple-ui-plugin/register'),
        ])

        if (cancelled) return

        const dwgWorkerUrl = `/workers/${DWG_PARSER_WORKER_FILE}`
        const libredwgWorkerUrl = `/workers/${LIBREDWG_PARSER_WORKER_FILE}`
        const mtextUrl = `/workers/${MTEXT_RENDERER_WORKER_FILE}`

        // Prefer the commercial parser; registerClientDwgConverter falls back to
        // LibreDWG when the package is absent or its worker is not deployed.
        const dwg = await registerClientDwgConverter({
          dwgWorkerUrl,
          libredwgWorkerUrl,
          licenseKey: dwgLicenseKeyFromEnv(),
        })
        if (cancelled) return

        if (dwg.fallbackReason) {
          console.warn(
            `[LiveViewer] Falling back to LibreDWG: ${dwg.fallbackReason}`
          )
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
          baseUrl: clientCadDataBaseUrl(),
          webworkerFileUrls: {
            mtextRender: mtextUrl,
            dwgParser: dwg.workerUrl,
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

        /**
         * The library draws its own full-screen spinner (`Parsing file ...`)
         * inside the same host as soon as `openDocument` starts reporting
         * progress. Our "Initializing viewer…" overlay is a sibling painted on
         * top, so it would sit above that spinner and both texts would show.
         * Hand over as soon as the first progress event arrives; `loading` is
         * also cleared when the open resolves, which covers the no-progress case.
         */
        const onProgress = () => {
          if (!cancelled) setLoading(false)
        }
        eventBus.on('open-file-progress', onProgress)
        stopProgressWatch = () => eventBus.off('open-file-progress', onProgress)

        const open = (bytes: ArrayBuffer) =>
          manager.openDocument(fileName, bytes, { mode: AcEdOpenMode.Read })

        /**
         * Opens once with the registered parser; when that was the commercial
         * parser and it fails (throw or `false`), re-register LibreDWG and open
         * again so a commercial-parser limitation never blocks viewing.
         */
        const openWithFallback = async (): Promise<boolean> => {
          try {
            const ok = await open(buffer)
            if (ok || dwg.parser !== 'dwg') return ok
          } catch (err) {
            if (dwg.parser !== 'dwg') throw err
            console.warn('[LiveViewer] DWG parse failed:', err)
          }
          console.warn(
            '[LiveViewer] Retrying with LibreDWG:',
            libredwgWorkerUrl
          )
          await registerLibreDwgConverter(libredwgWorkerUrl)
          /**
           * Parser workers receive the file bytes as a *transferred*
           * ArrayBuffer, so the failed attempt detached `buffer` (byteLength 0).
           * Re-fetch instead of handing the worker an empty buffer, and only
           * when the bytes are actually gone.
           */
          let retryBytes = buffer
          if (buffer.byteLength === 0) {
            const again = await fetch(`/api/drawings/${drawingId}/file`)
            if (!again.ok) throw new Error(`HTTP ${again.status}`)
            retryBytes = await again.arrayBuffer()
            if (cancelled) return false
          }
          return open(retryBytes)
        }

        const ok = await openWithFallback()
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
      stopProgressWatch?.()
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
