/**
 * Child-process CAD → PDF export.
 * Runs outside the Next.js server so HTTP stays responsive during long exports.
 *
 * DWG parser selection matches convert-drawing.mjs:
 * - Prefer commercial `@mlightcad/dwg-converter` when installed (optionalDependency).
 * - Fall back to `@mlightcad/libredwg-converter` (always present).
 * - Override with `DWG_PARSER=dwg|libredwg`.
 * - Optional license for commercial: `DWG_LICENSE_KEY` (omit for trial).
 *
 * Usage:
 *   node scripts/export-pdf.mjs <inputPath> <outputPdf> <fontsDir> [title] [colorMode]
 *
 * colorMode: color (default) | monochrome
 */
import { createRequire } from 'node:module'
import path from 'node:path'

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

/** @param {string | undefined} value @returns {'color' | 'monochrome'} */
function parseColorMode(value) {
  return value === 'monochrome' ? 'monochrome' : 'color'
}

async function main() {
  const [, , input, outputPdf, fontsDir, titleArg, colorModeArg] = process.argv
  if (!input || !outputPdf || !fontsDir) {
    console.error(
      'Usage: export-pdf.mjs <input> <outputPdf> <fontsDir> [title] [colorMode]'
    )
    process.exit(2)
  }

  const dwgParser = await resolveDwgParser()
  const colorMode = parseColorMode(colorModeArg)
  const title =
    titleArg?.trim() ||
    path.basename(input).replace(/\.[^.]+$/, '') ||
    'drawing'

  console.info(
    `[export-pdf] dwgParser=${dwgParser} colorMode=${colorMode} title=${title}`
  )

  const { exportFileToPdf } = await import('@mlightcad/cad-pdf-exporter')

  const result = await exportFileToPdf(input, outputPdf, {
    fontsDir,
    title,
    exportLayouts: true,
    colorMode,
    textMode: 'text',
    dwgParser,
    dwgLicenseKey:
      dwgParser === 'dwg' ? process.env.DWG_LICENSE_KEY : undefined,
  })

  console.info(
    `[export-pdf] wrote ${outputPdf} (${result.bytes.byteLength} bytes)`
  )
}

main().catch((err) => {
  console.error('[export-pdf]', err)
  process.exit(1)
})
