declare module '@mlightcad/cad-simple-viewer-cli' {
  export type CadViewerCliOpenMode = 'read' | 'write'

  export interface RunHeadlessOptions {
    scriptPath: string
    inputPath?: string
    outputDir?: string
    locale?: string
    mode?: CadViewerCliOpenMode
    logfile?: string
  }

  export interface RunHeadlessResult {
    outputDir: string
    savedFiles: string[]
  }

  export function runHeadless(
    options: RunHeadlessOptions
  ): Promise<RunHeadlessResult>
}
