# CAD Drive Demo (Next.js + cad-simple-viewer)

Demo of integrating [`@mlightcad/cad-simple-viewer`](https://www.npmjs.com/package/@mlightcad/cad-simple-viewer) in **Next.js**, comparing two viewing architectures:

| Mode | Description | Best for |
|------|-------------|----------|
| **Live parse** | Browser downloads the original DWG/DXF and parses/renders it with LibreDWG WASM + Web Workers | Entity-level interaction; full viewer capabilities |
| **Prerendered** | Server converts once via CLI (Playwright headless Chromium) to an **ACEX** multi-file package; the browser loads display geometry only | Publish / share / repeat viewing — faster first paint, lower memory |

UI is **English / 中文** (header toggle, **English by default**; preference stored in `localStorage`). Design notes: [docs/PLAN.md](./docs/PLAN.md). Chinese README: [README.zh-CN.md](./README.zh-CN.md).

> Server conversion is **not** pure Node DWG parsing. It uses the official [`@mlightcad/cad-simple-viewer-cli`](https://www.npmjs.com/package/@mlightcad/cad-simple-viewer-cli) headless browser pipeline. See the [ACEX hosting guide](https://github.com/mlightcad/cad-viewer/blob/main/packages/cad-html-plugin/docs/acex-web-hosting-guide.md).

## Why two open modes?

CAD on the web is not one product shape. This demo keeps both paths so you can feel the tradeoffs on the same drawing:

- **Live parse** keeps the original DWG/DXF in play — best when you want the full client pipeline.
- **Prerendered ACEX** pays conversion once on the server, then opens with lower CPU/RAM on phones and thin clients (at the cost of a larger download).

For a narrative walkthrough of that choice — including mobile memory vs bandwidth — see [*Viewing CAD Drawings in the Browser: Live Parse vs Server-Side Prerender*](https://medium.com/@mlightcad/viewing-cad-drawings-in-the-browser-live-parse-vs-server-side-prerender-97e46f0bed4e) (source draft: [docs/browser-and-server-prerender.md](./docs/browser-and-server-prerender.md)).

If you do not need a drive/API at all and only want to **hand someone one file** for design review (measure, markup, optional password/expiry, no server), that is a different packaging story: [*Turn Any DWG into a Portable CAD Design Review App — in One HTML File*](https://medium.com/@mlightcad/turn-any-dwg-into-a-portable-cad-design-review-app-in-one-html-file-d490dc67f09f). This repo is the opposite end of the spectrum — upload, convert, and host multi-file ACEX behind Next.js routes.

## Features

- Drive-style home: preview cards, status badges (uploading / prerendering / ready / failed)
- **Chunked upload + resume** (2 MiB chunks; pause supported; resume key `name+size+lastModified` in localStorage)
- SQLite via `@libsql/client` (local file DB, easy to start)
- After upload: serial convert to ACEX zip + PNG preview (`pngout`; published CLI runners may not include `jpgout`)
- Open a drawing with either live parse or prerendered ACEX
- Clicking a preview opens the prerendered viewer when status is Ready

## Requirements

- **Node.js 20+** (22/24 recommended)
- **pnpm** 10+
- Playwright Chromium on first convert setup

## Quick start

```bash
cd cad-viewer-nextjs-demo
pnpm install
pnpm setup:browser          # install Chromium (first time only)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Local checks (same as GitHub Actions CI):

```bash
pnpm lint
pnpm typecheck
pnpm build
```

`postinstall` / `predev` copy workers and wasm into `public/workers/`:

- `mtext-renderer-worker.js`
- `libredwg-parser-worker.js`
- `libredwg-web.wasm`

## Usage

1. Drag/drop or choose a `.dwg` / `.dxf`, or click **Load sample drawing** (CDN `canteen.dwg`).
2. After upload, status becomes **Prerendering**; a preview appears when ready.
3. **Open (live parse)**: browser parses the original file (original must exist; ACEX not required).
4. **Open (prerendered)** / click preview: iframe loads that drawing’s `viewer.html` (layers / layouts / measure come from the ACEX viewer).

## Architecture

```text
Browser ──chunked upload──► Next.js API ──► SQLite + data/
                               │
                               ▼
                    cad-simple-viewer-cli (Playwright)
                               │
                               ▼
                    ACEX package + preview.png
                               │
           ┌───────────────────┴───────────────────┐
           ▼                                       ▼
 live: cad-simple-viewer                  prerender: viewer.html
      + original DWG/DXF                        + drawing.acex.json + chunks/
```

## ACEX hosting note (important)

`.acex.gz` / `.osnap.gz` must be served as **opaque bytes**. Do **not** set `Content-Encoding: gzip`.  
If the browser auto-decompresses once, the viewer’s gunzip will fail. This demo serves ACEX via  
`GET /api/drawings/[id]/acex/[[...path]]` with explicit headers — packages are not dropped into `public/`.

## Layout

```text
app/api/uploads…          Chunked upload
app/api/drawings…         List / original / preview / ACEX
components/               Drive UI, LiveViewer, PrerenderViewer, i18n
lib/db.ts                 SQLite
lib/convert-queue.ts      Serial prerender queue
scripts/copy-workers.mjs
scripts/export-html-multi-preview.scr
docs/PLAN.md              Implementation plan (English)
data/                     Runtime data (gitignored)
.github/workflows/ci.yml  Lint, typecheck, build
```

## License notes

- This demo code: MIT (adjust if your repo policy differs)
- `@mlightcad/libredwg-converter`: **GPL**. If GPL is not acceptable, use a proprietary DWG converter or demo DXF only
- Other `@mlightcad/cad-simple-viewer` core packages are mostly MIT (see each package’s `package.json`)

## Known limitations (demo)

- Convert queue is **serial in the current Node process**; after `next dev` HMR, `processing` jobs are re-enqueued
- First convert starts Chromium and can be slow
- Max file size ~**200MB**; no multi-user auth
- `AcApDocManager` is a singleton; re-entering the Live page may find plugins already loaded (demo handles this defensively)
