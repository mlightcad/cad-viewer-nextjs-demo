/**
 * Browser DWG parser selection for the live viewer.
 *
 * Mirrors the server-side preference in `scripts/convert-drawing.mjs`:
 *
 * 1. `@mlightcad/dwg-converter` — private, optionalDependency; used when the
 *    package is installed **and** its parser worker is deployed.
 * 2. `@mlightcad/libredwg-converter` — GPL, always installed, always deployed.
 *
 * `cad-simple-viewer` registers no DWG converter of its own, so the host app
 * must pick one before opening a drawing.
 */
import type { AcDbDatabaseConverter } from '@mlightcad/data-model'

/** DWG parser the live viewer is currently using. */
export type ClientDwgParser = 'dwg' | 'libredwg'

export interface RegisterClientDwgConverterOptions {
  /** Deployed `dwg-parser-worker.js` URL (from `@mlightcad/dwg-converter`). */
  dwgWorkerUrl: string
  /** Deployed `libredwg-parser-worker.js` URL (from `@mlightcad/libredwg-converter`). */
  libredwgWorkerUrl: string
  /**
   * Offline license key for `@mlightcad/dwg-converter`.
   * Omit to use that package's browser evaluation period (IndexedDB).
   */
  licenseKey?: string
}

export interface ClientDwgParserResult {
  /** Parser that was actually registered. */
  parser: ClientDwgParser
  /**
   * Worker script URL used by the registered parser — pass it to
   * `AcApDocManager.createInstance({ webworkerFileUrls: { dwgParser } })` so
   * readiness checks probe the script that parsing actually needs.
   */
  workerUrl: string
  /** Why the preferred parser was skipped; only set when falling back. */
  fallbackReason?: string
}

/** Reads the optional build-time license key for the commercial parser. */
export function dwgLicenseKeyFromEnv(): string | undefined {
  const key = process.env.NEXT_PUBLIC_DWG_LICENSE_KEY
  return key?.trim() || undefined
}

/**
 * Imports the optional private package.
 *
 * `turbopackOptional` keeps `next build` working for installs without GitHub
 * Packages access: the dependency is bundled when present and skipped without
 * a build error when absent (the import then throws at runtime).
 */
function importDwgConverter(): Promise<typeof import('@mlightcad/dwg-converter')> {
  return import(/* turbopackOptional: true */ '@mlightcad/dwg-converter')
}

/** Probes a deployed worker script so a missing asset falls back cleanly. */
async function isAssetAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}

type CommercialDwgAttempt =
  | { ok: true; converter: AcDbDatabaseConverter }
  | { ok: false; reason: string }

async function createCommercialDwgConverter(
  dwgWorkerUrl: string,
  licenseKey: string | undefined
): Promise<CommercialDwgAttempt> {
  let mod: typeof import('@mlightcad/dwg-converter')
  try {
    mod = await importDwgConverter()
  } catch {
    return { ok: false, reason: '@mlightcad/dwg-converter is not installed' }
  }

  if (typeof mod?.AcDbDwgConverter !== 'function') {
    return { ok: false, reason: '@mlightcad/dwg-converter is not installed' }
  }

  if (!(await isAssetAvailable(dwgWorkerUrl))) {
    return {
      ok: false,
      reason: `DWG parser worker not deployed at ${dwgWorkerUrl}`
    }
  }

  // Fail over before opening anything: an expired trial / invalid key would
  // otherwise surface as a parse error mid-open instead of the LibreDWG path.
  try {
    const status =
      typeof mod.getLicenseStatus === 'function'
        ? await mod.getLicenseStatus(licenseKey)
        : 'trial'
    if (status === 'expired' || status === 'invalid') {
      return {
        ok: false,
        reason: `@mlightcad/dwg-converter license is ${status}`
      }
    }
  } catch {
    /* license probe is best-effort; let the converter enforce it */
  }

  try {
    return {
      ok: true,
      converter: new mod.AcDbDwgConverter({
        convertByEntityType: false,
        useWorker: true,
        parserWorkerUrl: dwgWorkerUrl,
        licenseKey
      })
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      reason: `@mlightcad/dwg-converter failed to initialize: ${detail}`
    }
  }
}

/**
 * Registers LibreDWG (GPL) as the DWG converter.
 *
 * Also used to fall back after the commercial parser fails mid-open.
 */
export async function registerLibreDwgConverter(
  libredwgWorkerUrl: string
): Promise<ClientDwgParserResult> {
  const { AcDbDatabaseConverterManager, AcDbFileType } = await import(
    '@mlightcad/data-model'
  )
  const { AcDbLibreDwgConverter } = await import(
    '@mlightcad/libredwg-converter'
  )
  AcDbDatabaseConverterManager.instance.register(
    AcDbFileType.DWG,
    new AcDbLibreDwgConverter({
      convertByEntityType: false,
      useWorker: true,
      parserWorkerUrl: libredwgWorkerUrl
    })
  )
  return { parser: 'libredwg', workerUrl: libredwgWorkerUrl }
}

/**
 * Registers a DWG converter for `AcDbFileType.DWG`, preferring the commercial
 * `@mlightcad/dwg-converter` and falling back to LibreDWG.
 *
 * Must run in the browser before opening a DWG document.
 */
export async function registerClientDwgConverter(
  options: RegisterClientDwgConverterOptions
): Promise<ClientDwgParserResult> {
  const { dwgWorkerUrl, libredwgWorkerUrl, licenseKey } = options

  const commercial = await createCommercialDwgConverter(
    dwgWorkerUrl,
    licenseKey
  )
  if (commercial.ok) {
    const { AcDbDatabaseConverterManager, AcDbFileType } = await import(
      '@mlightcad/data-model'
    )
    AcDbDatabaseConverterManager.instance.register(
      AcDbFileType.DWG,
      commercial.converter
    )
    return { parser: 'dwg', workerUrl: dwgWorkerUrl }
  }

  const result = await registerLibreDwgConverter(libredwgWorkerUrl)
  return { ...result, fallbackReason: commercial.reason }
}
