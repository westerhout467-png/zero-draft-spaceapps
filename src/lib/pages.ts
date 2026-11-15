// The shape of pipeline/text/<ID>.pages.json (SPEC §7.2): an investigation's source text,
// normalized and split by page. Written by pipeline/scripts/text.ts; read by the pipeline's LLM
// and verify steps, and by tests that re-check generated quotes. Pure types and lookups.
import { normalize } from './normalize'

export interface TextPage {
  /** The file's name inside pipeline/sources/<ID>/. */
  file: string
  /** 1-based: the PDF page, or 1 for a text file. */
  page: number
  /** The report's own page number from its header, or null (front matter, text files). */
  reportPage: number | null
  /** The page's text after normalize(). A text file keeps its line breaks and tabs. */
  text: string
  /** Text files only: the same text, line by line (line n is lines[n - 1]). */
  lines?: string[]
}

export interface PagesFile {
  generatedBy: string
  generatedAt: string
  model: null
  promptVersion: null
  /** The source folder, e.g. "PSI-25". */
  id: string
  pages: TextPage[]
}

/** A page's text on one line, as quotes are compared: normalize() also folds tabs and line breaks. */
export const flatText = (page: TextPage): string => normalize(page.text)

/** The 1-based line of a text-file page that holds a quote, or null. */
export function lineOf(page: TextPage, quote: string): number | null {
  const wanted = normalize(quote)
  if (!wanted || !page.lines) return null
  const index = page.lines.findIndex((line) => normalize(line).includes(wanted))
  return index === -1 ? null : index + 1
}
