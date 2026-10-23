/**
 * Child-process CAD → ACEX convert.
 * Runs outside the Next.js server so HTTP (e.g. DELETE) stays responsive.
 *
 * DWG parser selection:
 * - Prefer commercial `@mlightcad/dwg-converter` when installed (optionalDependency).
 * - Fall back to `@mlightcad/libredwg-converter` (always present).
 * - Override with `DWG_PARSER=dwg|libredwg`.
 * - Optional license for commercial: `DWG_LICENSE_KEY` (omit for trial).
 *
 * Usage:
 *   node scripts/convert-drawing.mjs <inputPath> <acexOutDir> <fontsDir> [previewJpgPath]
 */
import { access, copyFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

/** @returns {Promise<'dwg' | 'libredwg'>} */
async function resolveDwgParser() {
  const forced = process.env.DWG_PARSER?.trim().toLowerCase()
  if (forced === 'dwg' || forced === 'libredwg') {
    if (forced === 'dwg') {
      try {
        createRequire(import.meta.url).resolve('@mlightcad/dwg-converter')
      } catch {
        throw new Error(
          'DWG_PARSER=dwg but @mlightcad/dwg-converter is not installed'
        )
      }
    }
    return forced
  }

  try {
    createRequire(import.meta.url).resolve('@mlightcad/dwg-converter')
    return 'dwg'
  } catch {
    return 'libredwg'
  }
}

async function main() {
  const [, , input, acexOut, fontsDir, previewJpg] = process.argv
  if (!input || !acexOut || !fontsDir) {
    console.error(
      'Usage: convert-drawing.mjs <input> <acexOut> <fontsDir> [previewJpg]'
    )
    process.exit(2)
  }

  const dwgParser = await resolveDwgParser()
  console.info(`[convert-drawing] dwgParser=${dwgParser}`)

  const { exportFileToHtml } = await import('@mlightcad/cad-html-exporter')

  await rm(acexOut, { recursive: true, force: true })
  await mkdir(acexOut, { recursive: true })

  await exportFileToHtml(input, acexOut, {
    exportFormat: 'multi',
    zipPackage: false,
    // Uncompressed ACEC/ACEO chunk budget (default 10 MiB; clamp 1–64 MiB).
    maxChunkBytes: 10 * 1024 * 1024,
    viewerMode: 'measure',
    exportInvisibleLayers: true,
    exportLayouts: true,
    initialView: 'fit',
    fontsDir,
    dwgParser,
    dwgLicenseKey:
      dwgParser === 'dwg' ? process.env.DWG_LICENSE_KEY : undefined,
  })

  if (previewJpg) {
    const packagePreview = path.join(acexOut, 'preview.jpg')
    try {
      await access(packagePreview)
      await copyFile(packagePreview, previewJpg)
    } catch {
      /* drawing has no embedded thumbnail */
    }
  }
}

main().catch((err) => {
  console.error('[convert-drawing]', err)
  process.exit(1)
})
