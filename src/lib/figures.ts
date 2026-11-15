// Figures cut from NASA's documents, shown in the citation drawer beside the claims that rest on
// them (CLAUDE.md: "NASA figures we extracted, credited in sources.json"). For when a source's text
// can't be quoted: Eq. 6.1's PDF text layer comes out scrambled ("( )2O 6exp 0.5 0.0167 13.4X a a="),
// so it is shown as printed. check:claims confirms each figure's `pageText` is on its page.
import { normalize } from './normalize'

export interface Figure {
  id: string
  /** Under public/. */
  src: string
  width: number
  height: number
  alt: string
  sourceId: string
  pdfPage: number
  reportPage: number | null
  /** Text check:claims must find on pdfPage (after normalize()), proving the image says what the page says. */
  pageText: string
}

export const FIGURES: Record<string, Figure> = {
  eq61: {
    id: 'eq61',
    src: 'img/eq61-bass2-p75.png',
    width: 903,
    height: 106,
    alt: 'Equation 6.1 as printed in the BASS-II report: X sub O2 equals 6 exp of minus 0.5 a, plus 0.0167 a, plus 13.4.',
    sourceId: 'nasa-tm-20210011385',
    pdfPage: 83,
    reportPage: 75,
    // The equation's coefficients, as the PDF's text layer has them.
    pageText: '6exp 0.5 0.0167 13.4',
  },
}

/** The figures each claim's drawer shows. */
export const CLAIM_FIGURES: Record<string, string[]> = {
  'twin.orbit-limit': ['eq61'],
  'twin.gap': ['eq61'],
  'bass2.flam.eq61-branches': ['eq61'],
  'bass2.flam.derate': ['eq61'],
}

export function figuresFor(claimId: string): Figure[] {
  return (CLAIM_FIGURES[claimId] ?? []).flatMap((id) => FIGURES[id] ?? [])
}

/** Whether a page's text holds a figure's check text. */
export function pageHasFigure(pageText: string, figure: Figure): boolean {
  return normalize(pageText).includes(normalize(figure.pageText))
}
