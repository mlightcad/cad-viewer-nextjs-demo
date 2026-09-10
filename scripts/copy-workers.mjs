/**
 * Copy CAD Web Worker / WASM assets into public/workers for Next.js static serving.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
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
