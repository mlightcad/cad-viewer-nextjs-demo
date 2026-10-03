# CAD 网盘示例（Next.js + cad-simple-viewer）

演示如何在 **Next.js** 中集成 [`@mlightcad/cad-simple-viewer`](https://www.npmjs.com/package/@mlightcad/cad-simple-viewer)，并对比两种看图架构。

默认英文说明见根目录 [README.md](./README.md)。设计说明见 [docs/PLAN.md](./docs/PLAN.md)。

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **实时解析（Live）** | 浏览器下载原始 DWG/DXF，用 LibreDWG WASM + Web Worker 解析并渲染 | 需要实体级交互、与完整 viewer 能力一致 |
| **预渲染（Prerendered）** | 服务端用 CLI（Playwright 无头 Chromium）转成 **ACEX** 多文件包，浏览器只加载显示几何 | 发布/分享/反复查看，首屏更快、内存更少 |

UI 支持 **English / 中文**（右上角切换，**默认英文**；用户选择写入 `localStorage`）。

> 服务端并不是「纯 Node 解析 DWG」，而是官方推荐的 [`@mlightcad/cad-simple-viewer-cli`](https://www.npmjs.com/package/@mlightcad/cad-simple-viewer-cli) 无头浏览器管线。详见 [ACEX 托管指南](https://github.com/mlightcad/cad-viewer/blob/main/packages/cad-html-plugin/docs/acex-web-hosting-guide.md)。

## 为什么要两种打开方式？

浏览器里看 CAD 并不是一种产品形态。本示例把两条路径放在同一套网盘 UI 里，方便你用同一张图对比取舍：

- **实时解析**保留原始 DWG/DXF，适合需要完整客户端管线的场景。
- **预渲染 ACEX**在服务端转换一次，之后在手机/轻量设备上打开时更省 CPU/内存（代价是下载体积通常比原图大）。

关于「移动端内存 vs 带宽」等产品向讨论，见英文文章 [*Viewing CAD Drawings in the Browser: Live Parse vs Server-Side Prerender*](https://medium.com/@mlightcad/viewing-cad-drawings-in-the-browser-live-parse-vs-server-side-prerender-97e46f0bed4e)（仓库草稿：[docs/browser-and-server-prerender.md](./docs/browser-and-server-prerender.md)）。

若你根本不需要网盘/API，只想把图纸变成**一个可离线分享的 HTML**（测量、批注、可选密码与过期），那是另一条打包路线：[*Turn Any DWG into a Portable CAD Design Review App — in One HTML File*](https://medium.com/@mlightcad/turn-any-dwg-into-a-portable-cad-design-review-app-in-one-html-file-d490dc67f09f)。本仓库站在光谱的另一端——上传、转换，并把多文件 ACEX 挂在 Next.js 路由后托管。

## 功能

- 网盘式首页：预览图卡片、状态徽章（上传中 / 预渲染中 / 就绪 / 失败）
- **分片上传 + 断点续传**（2 MiB/片，进度可暂停，刷新后按 `name+size+lastModified` 续传）
- SQLite（`@libsql/client` 本地文件库，易启动）
- 上传完成后串行转换：ACEX zip + PNG 预览（脚本使用 `pngout`；当前 npm CLI runner 不含 `jpgout`）
- 打开图纸时可在「实时解析 / 预渲染」之间切换；点击预览图以预渲染方式打开

## 环境要求

- **Node.js 20+**（推荐 22/24）
- **pnpm** 10+
- 首次需安装 Playwright Chromium（转换用）

## 快速开始

```bash
git clone --recurse-submodules https://github.com/mlightcad/cad-viewer-nextjs-demo.git
cd cad-viewer-nextjs-demo
# 已有仓库缺字体时：git submodule update --init --recursive
pnpm install                # postinstall 会跑 sync-cad-data（git 失败则走 jsDelivr）
pnpm setup:browser          # 安装 Chromium（仅首次）
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

字体、SHX、DXF 模板和示例图纸来自 git submodule [`mlightcad/cad-data`](https://github.com/mlightcad/cad-data)（目录 `cad-data/`）。Next.js 按 [自托管字体说明](https://github.com/mlightcad/cad-viewer/wiki/Self-Hosted-Fonts-and-Templates) 的目录结构通过 **`/cad-data/`** 提供：

- 实时查看器：`baseUrl` 为本站 origin + `/cad-data/`
- 无头转换：`runHeadless({ baseUrl })` 指向 `http://127.0.0.1:$PORT/cad-data/`（需 CLI ≥ 1.7.2）。若应用不在 3000 端口或字体在独立 CDN，设置 `CAD_DATA_BASE_URL` / `NEXT_PUBLIC_CAD_DATA_BASE_URL`。

不把 `cad-data` 复制进 `public/`，避免再存一份约 46MB 的二进制。字体许可需自行购买（见 cad-data README）。无法访问 GitHub git 时，`pnpm sync:cad-data`（`postinstall` 也会调用）会从 jsDelivr 拉取同一套文件。

本地检查（与 GitHub Actions CI 一致）：

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## 使用说明

1. 拖拽或选择 `.dwg` / `.dxf`，或点击 **Load sample drawing**（本地 `cad-data/data/canteen.dwg`）。
2. 上传完成后状态变为「预渲染中」；完成后出现预览图。
3. **Open (live parse)**：浏览器解析原始文件（需等原文件就绪，不必等 ACEX）。
4. **Open (prerendered)** / 点击预览：iframe 加载该图纸的 `viewer.html`。

## ACEX 托管注意（重要）

`.acex.gz` / `.osnap.gz` 必须按**不透明字节**返回，**禁止**设置 `Content-Encoding: gzip`。本示例通过 `GET /api/drawings/[id]/acex/[[...path]]` 显式控制响应头。

## 许可说明

- 本示例代码：MIT
- `@mlightcad/libredwg-converter`：**GPL**
- 其余核心包多为 MIT（以各包 `package.json` 为准）
- `cad-data/` 中的字体与模板为第三方数据，许可需自行解决
