/**
 * Copy locally built @mlightcad packages into node_modules for local
 * dwg-converter + Node ESM lib/ testing before npm publish.
 *
 * Syncs:
 * - data-model (+ common / geometry-engine / graphic-interface)
 * - cad-html-exporter dist (data-model external)
 *
 * Expects sibling checkouts:
 *   ../realdwg-web/packages/{common,geometry-engine,graphic-interface,data-model}
 *   ../cad-viewer/packages/cad-html-exporter
 *
 * Usage:
 *   node scripts/sync-local-mlightcad.mjs
 *   pnpm sync:local-mlightcad
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const realdwg = join(root, '..', 'realdwg-web', 'packages')
const exporterSrc = join(
  root,
  '..',
  'cad-viewer',
  'packages',
  'cad-html-exporter'
)

function resolveInstalledRoot(name, paths) {
  const entry = require.resolve(name, paths ? { paths } : undefined)
  let dir = dirname(entry)
  for (let i = 0; i < 8; i++) {
    const pkgPath = join(dir, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const json = JSON.parse(readFileSync(pkgPath, 'utf8'))
        if (json.name === name) return dir
      } catch {
        /* walk */
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`Cannot locate installed package root for ${name}`)
}

function syncTree(from, to, label) {
  if (!existsSync(from)) {
    throw new Error(`Missing: ${from}`)
  }
  rmSync(to, { recursive: true, force: true })
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
  console.log(`[sync-local-mlightcad] ${label}`)
}

function syncFile(from, to, label) {
  if (!existsSync(from)) {
    throw new Error(`Missing: ${from}`)
  }
  copyFileSync(from, to)
  console.log(`[sync-local-mlightcad] ${label}`)
}

function syncPackage(name, dest, src) {
  syncFile(join(src, 'package.json'), join(dest, 'package.json'), `${name} package.json`)
  syncTree(join(src, 'lib'), join(dest, 'lib'), `${name} lib/`)
  if (existsSync(join(src, 'dist'))) {
    syncTree(join(src, 'dist'), join(dest, 'dist'), `${name} dist/`)
  }
}

const pkgs = [
  'common',
  'geometry-engine',
  'graphic-interface',
  'data-model',
]

for (const name of pkgs) {
  const src = join(realdwg, name)
  if (!existsSync(join(src, 'lib', 'index.js'))) {
    console.error(
      `[sync-local-mlightcad] Build ${name} first:\n` +
        `  cd ../realdwg-web && pnpm --filter @mlightcad/${name} run build`
    )
    process.exit(1)
  }
}

if (!existsSync(join(exporterSrc, 'dist', 'index.js'))) {
  console.error(
    '[sync-local-mlightcad] Build cad-html-exporter first:\n' +
      '  cd ../cad-viewer && pnpm --filter @mlightcad/cad-html-exporter run build'
  )
  process.exit(1)
}

const dmDest = resolveInstalledRoot('@mlightcad/data-model')
const searchFrom = [dmDest, root]

for (const name of pkgs) {
  const pkgName = `@mlightcad/${name}`
  const dest =
    name === 'data-model'
      ? dmDest
      : resolveInstalledRoot(pkgName, searchFrom)
  syncPackage(pkgName, dest, join(realdwg, name))
}

const expDest = resolveInstalledRoot('@mlightcad/cad-html-exporter')
syncFile(
  join(exporterSrc, 'dist', 'index.js'),
  join(expDest, 'dist', 'index.js'),
  'cad-html-exporter index.js'
)
syncFile(
  join(exporterSrc, 'dist', 'index.cjs'),
  join(expDest, 'dist', 'index.cjs'),
  'cad-html-exporter index.cjs'
)

console.log('[sync-local-mlightcad] done')
