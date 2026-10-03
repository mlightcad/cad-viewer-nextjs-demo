import { access } from 'node:fs/promises'
import path from 'node:path'

export { CAD_DATA_URL_PATH, serverCadDataBaseUrl } from './cad-data-url'

/**
 * Git submodule checkout of https://github.com/mlightcad/cad-data
 * (fonts, templates, sample drawings).
 */
export function cadDataRoot(): string {
  return path.join(process.cwd(), 'cad-data')
}

export async function cadDataIsPresent(): Promise<boolean> {
  try {
    await access(path.join(cadDataRoot(), 'fonts', 'fonts.json'))
    return true
  } catch {
    return false
  }
}

/**
 * Resolve a path under `cad-data/`. Throws if it escapes the tree.
 * Wiki layout uses `{baseUrl}/fonts.json`; the cad-data repo keeps that file
 * at `fonts/fonts.json` (what the viewer actually fetches).
 */
export function resolveCadDataPath(relativePath: string): string {
  const root = path.resolve(cadDataRoot())
  let normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (normalized === 'fonts.json') {
    normalized = 'fonts/fonts.json'
  }
  if (!normalized || normalized.includes('..')) {
    throw new Error('Invalid path')
  }
  const full = path.resolve(root, normalized)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error('Path escape')
  }
  return full
}

export function contentTypeForCadData(filePath: string): string {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.json')) return 'application/json; charset=utf-8'
  if (lower.endsWith('.ttf')) return 'font/ttf'
  if (lower.endsWith('.otf')) return 'font/otf'
  if (lower.endsWith('.woff')) return 'font/woff'
  if (lower.endsWith('.woff2')) return 'font/woff2'
  if (lower.endsWith('.dxf')) return 'application/dxf'
  if (lower.endsWith('.dwg')) return 'application/acad'
  if (lower.endsWith('.shx')) return 'application/octet-stream'
  return 'application/octet-stream'
}

export const CAD_DATA_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
