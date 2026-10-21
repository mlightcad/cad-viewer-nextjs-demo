/**
 * Child-process CAD → ACEX convert.
 * Runs outside the Next.js server so HTTP (e.g. DELETE) stays responsive.
 *
 * Usage:
 *   node scripts/convert-drawing.mjs <inputPath> <acexOutDir> <fontsDir> [previewJpgPath]
 */
import { access, copyFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const [, , input, acexOut, fontsDir, previewJpg] = process.argv
  if (!input || !acexOut || !fontsDir) {
    console.error(
      'Usage: convert-drawing.mjs <input> <acexOut> <fontsDir> [previewJpg]'
    )
    process.exit(2)
  }

  const { exportFileToHtml } = await import('@mlightcad/cad-html-exporter')

  await rm(acexOut, { recursive: true, force: true })
  await mkdir(acexOut, { recursive: true })

  await exportFileToHtml(input, acexOut, {
    exportFormat: 'multi',
    zipPackage: false,
    viewerMode: 'measure',
    exportInvisibleLayers: true,
    exportLayouts: true,
    initialView: 'fit',
    fontsDir,
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
