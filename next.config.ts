import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@mlightcad/cad-simple-viewer',
    '@mlightcad/cad-simple-ui-plugin',
    '@mlightcad/data-model',
    '@mlightcad/libredwg-converter',
    '@mlightcad/mtext-renderer',
    '@mlightcad/three-renderer',
    'three',
    'lodash-es',
  ],
  serverExternalPackages: [
    '@mlightcad/cad-html-exporter',
    '@libsql/client',
    'libsql',
  ],
}

export default nextConfig
