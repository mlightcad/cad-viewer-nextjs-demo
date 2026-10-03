/** URL prefix the Next.js app uses to host the cad-data tree. */
export const CAD_DATA_URL_PATH = '/cad-data'

function withTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

/**
 * Absolute `http(s)` base URL for fonts/templates.
 * The CLI (Playwright) requires an absolute URL; the live viewer uses the
 * same origin so fonts load without a third-party CDN.
 */
export function serverCadDataBaseUrl(): string {
  const explicit =
    process.env.CAD_DATA_BASE_URL ?? process.env.NEXT_PUBLIC_CAD_DATA_BASE_URL
  if (explicit) {
    return withTrailingSlash(explicit)
  }
  const port = process.env.PORT ?? '3000'
  return `http://127.0.0.1:${port}${CAD_DATA_URL_PATH}/`
}

export function clientCadDataBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_CAD_DATA_BASE_URL
  if (explicit) {
    return withTrailingSlash(explicit)
  }
  return `${window.location.origin}${CAD_DATA_URL_PATH}/`
}

export function clientSampleDrawingUrl(): string {
  return `${clientCadDataBaseUrl()}data/canteen.dwg`
}
