/**
 * Ensure `cad-data/` exists (fonts, templates, sample DWG).
 *
 * Prefer git submodule (pins https://github.com/mlightcad/cad-data).
 * If GitHub git is unreachable, fall back to jsDelivr (same files, same layout).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const destRoot = resolve(root, 'cad-data')
const marker = join(destRoot, 'fonts', 'fonts.json')
const CDN = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main'

const EXTRA_PATHS = [
  'templates/acad.dxf',
  'templates/acadiso.dxf',
  'data/canteen.dwg',
]

function alreadyPresent() {
  return existsSync(marker)
}

function log(msg) {
  console.log(`[sync-cad-data] ${msg}`)
}

function destFor(relPath) {
  const normalized = String(relPath).replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized || normalized.includes('..')) {
    throw new Error(`Unsafe cad-data path: ${relPath}`)
  }
  const dest = resolve(destRoot, normalized)
  if (dest !== destRoot && !dest.startsWith(destRoot + sep)) {
    throw new Error(`Path escape: ${relPath}`)
  }
  return dest
}

function cdnUrl(relPath) {
  const encoded = relPath
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return `${CDN}/${encoded}`
}

function tryGitSubmodule() {
  const result = spawnSync(
    'git',
    ['submodule', 'update', '--init', '--recursive', '--', 'cad-data'],
    { cwd: root, encoding: 'utf8', timeout: 120_000 }
  )
  if (result.status === 0 && alreadyPresent()) {
    log('initialized git submodule cad-data')
    return true
  }
  if (result.stderr) {
    log(`git submodule skipped: ${result.stderr.trim().split('\n').pop()}`)
  }
  return false
}

async function download(relPath) {
  const url = cdnUrl(relPath)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const dest = destFor(relPath)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, buf)
  log(`fetched ${relPath} (${buf.length} bytes)`)
}

async function mapPool(items, concurrency, worker) {
  const pending = [...items]
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (pending.length > 0) {
      const item = pending.shift()
      if (item === undefined) return
      await worker(item)
    }
  })
  await Promise.all(runners)
}

async function downloadFromCdn() {
  mkdirSync(join(destRoot, 'fonts'), { recursive: true })
  await download('fonts/fonts.json')
  const catalog = JSON.parse(readFileSync(marker, 'utf8'))
  const files = Array.isArray(catalog)
    ? catalog.map((entry) => entry.file).filter(Boolean)
    : []
  const fontPaths = files.map((file) => `fonts/${file}`)
  await mapPool(fontPaths, 6, download)
  await mapPool(EXTRA_PATHS, 3, download)
}

if (alreadyPresent()) {
  log('cad-data already present, skipping')
  process.exit(0)
}

if (tryGitSubmodule()) {
  process.exit(0)
}

log('downloading fonts/templates/sample from jsDelivr…')
try {
  await downloadFromCdn()
  log('done')
} catch (err) {
  console.error('[sync-cad-data] failed:', err)
  process.exitCode = 1
}
