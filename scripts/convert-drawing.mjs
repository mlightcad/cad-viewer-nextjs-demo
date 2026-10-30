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
 *   node scripts/convert-drawing.mjs <inputPath> <acexOutDir> <fontsDir> [previewJpgPath] [background]
 *   node scripts/convert-drawing.mjs <inputPath> <acexOutDir> <fontsDir> <background>
 *
 * background: black (default) | white | space
 *   space = black in model space, white in paper space
 * When previewJpgPath is omitted, a lone black|white|space argument is the background.
 */
import { access, copyFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

/** @param {string | undefined} value @returns {'black' | 'white' | 'space'} */
function parseBackground(value) {
  if (value === 'white' || value === 'space') return value
  return 'black'
}

/**
 * Preview path and background are both optional. A background name in the
 * preview slot is the background, so `… <fontsDir> white` does not try to
 * copy the thumbnail onto a file named "white".
 *
 * @param {string | undefined} fourth
 * @param {string | undefined} fifth
 * @returns {{ previewJpg: string | undefined, background: 'black' | 'white' | 'space' }}
 */
function splitOptionalArgs(fourth, fifth) {
  if (fifth !== undefined) {
    return { previewJpg: fourth, background: parseBackground(fifth) }
  }
  if (fourth === 'black' || fourth === 'white' || fourth === 'space') {
    return { previewJpg: undefined, background: fourth }
  }
  return { previewJpg: fourth, background: 'black' }
}

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
  const [, , input, acexOut, fontsDir, previewOrBackground, backgroundArg] =
    process.argv
  if (!input || !acexOut || !fontsDir) {
    console.error(
      'Usage: convert-drawing.mjs <input> <acexOut> <fontsDir> [previewJpg] [background]'
    )
    process.exit(2)
  }

  const { previewJpg, background } = splitOptionalArgs(
    previewOrBackground,
    backgroundArg
  )
  const dwgParser = await resolveDwgParser()
  console.info(
    `[convert-drawing] dwgParser=${dwgParser} background=${background}`
  )

  const { exportFileToHtml } = await import('@mlightcad/cad-html-exporter')

  await rm(acexOut, { recursive: true, force: true })
  await mkdir(acexOut, { recursive: true })

  await exportFileToHtml(input, acexOut, {
    exportFormat: 'multi',
    zipPackage: false,
    viewerMode: 'measure',
    exportInvisibleLayers: true,
    exportLayouts: true,
    background,
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
