/** Canvas background written into prerendered HTML. Matches cad-html-exporter. */
export const HTML_BACKGROUNDS = ['black', 'white', 'space'] as const

export type HtmlBackground = (typeof HTML_BACKGROUNDS)[number]

/** Omitted and unknown values are black, matching the exporter default. */
export function parseHtmlBackground(value: unknown): HtmlBackground {
  if (value === 'white' || value === 'space') return value
  return 'black'
}
