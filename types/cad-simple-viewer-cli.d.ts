declare module '@mlightcad/cad-simple-viewer-cli' {
  export type CadViewerCliOpenMode = 'read' | 'write'

  export interface RunHeadlessOptions {
    scriptPath: string
    inputPath?: string
    outputDir?: string
    locale?: string
    mode?: CadViewerCliOpenMode
    logfile?: string
    /** Resource base URL for fonts and templates (`http`/`https`). */
    baseUrl?: string
    openViewMode?: 'extents' | 'saved'
    drawNoPlotLayers?: boolean
    circleSides?: number
  }

  export interface RunHeadlessResult {
    outputDir: string
    savedFiles: string[]
  }

  export function runHeadless(
    options: RunHeadlessOptions
  ): Promise<RunHeadlessResult>
}
