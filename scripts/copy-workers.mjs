/**
 * Copy CAD Web Worker / WASM assets into public/workers for Next.js static serving.
 *
 * The private `@mlightcad/dwg-converter` is an optionalDependency: its worker
 * (plus the lazily fetched `dwg-codepage-*.bin` tables) is copied only when the
 * package is installed. The live viewer probes that worker before preferring it
 * over LibreDWG.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const destDir = join(root, 'public', 'workers')

mkdirSync(destDir, { recursive: true })

function resolvePackageRoot(name) {
  // Prefer require.resolve on a known export, then walk up to package root.
  const entry = require.resolve(name)
  let dir = dirname(entry)
  for (let i = 0; i < 8; i++) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, 'utf8'))
        if (json.name === name) return dir
      } catch {
        /* continue */
      }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(`Cannot locate package root for ${name}`)
}

/** Optional package root; `null` when the optional dependency is absent. */
function tryResolvePackageRoot(name) {
  try {
    return resolvePackageRoot(name)
  } catch {
    return null
  }
}

const copies = [
  {
    from: join(resolvePackageRoot('@mlightcad/cad-simple-viewer'), 'dist', 'mtext-renderer-worker.js'),
    to: join(destDir, 'mtext-renderer-worker.js'),
  },
  {
    from: join(resolvePackageRoot('@mlightcad/libredwg-converter'), 'dist', 'libredwg-parser-worker.js'),
    to: join(destDir, 'libredwg-parser-worker.js'),
  },
  {
    from: join(resolvePackageRoot('@mlightcad/libredwg-converter'), 'dist', 'libredwg-web.wasm'),
    to: join(destDir, 'libredwg-web.wasm'),
  },
]

for (const { from, to } of copies) {
  if (!existsSync(from)) {
    console.error(`[copy-workers] missing: ${from}`)
    process.exitCode = 1
    continue
  }
  copyFileSync(from, to)
  console.log(`[copy-workers] ${to}`)
}

// Optional commercial DWG parser: worker + per-codepage fallback tables. The
// worker resolves the .bin files relative to import.meta.url, so they must sit
// next to it.
const dwgConverterRoot = tryResolvePackageRoot('@mlightcad/dwg-converter')
if (!dwgConverterRoot) {
  // Drop stale assets from an earlier install so the client probe fails fast
  // and the live viewer falls back to LibreDWG instead of loading a stale worker.
  for (const file of readdirSync(destDir)) {
    if (file === 'dwg-parser-worker.js' || file.startsWith('dwg-codepage-')) {
      rmSync(join(destDir, file), { force: true })
      console.log(`[copy-workers] removed stale ${join(destDir, file)}`)
    }
  }
  console.log(
    '[copy-workers] @mlightcad/dwg-converter not installed — live parse uses LibreDWG'
  )
} else {
  const dist = join(dwgConverterRoot, 'dist')
  const worker = join(dist, 'dwg-parser-worker.js')
  if (!existsSync(worker)) {
    console.error(`[copy-workers] missing: ${worker}`)
    process.exitCode = 1
  } else {
    copyFileSync(worker, join(destDir, 'dwg-parser-worker.js'))
    console.log(`[copy-workers] ${join(destDir, 'dwg-parser-worker.js')}`)

    if (existsSync(dist)) {
      for (const file of readdirSync(dist)) {
        if (!file.startsWith('dwg-codepage-') || !file.endsWith('.bin')) continue
        copyFileSync(join(dist, file), join(destDir, file))
        console.log(`[copy-workers] ${join(destDir, file)}`)
      }
    }
  }
}
