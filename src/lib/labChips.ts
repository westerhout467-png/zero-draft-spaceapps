// The citation chips after each Lab Partner sentence (SPEC F5): one per place the sentence leans
// on, named the way the footnote previews name sources ("BASS-II report, p. 76"), or after the
// model a value came from ("Cabin model"). A chip opens the citation drawer on what it names.
import { citePreview, getClaim, getSource, type Claim } from './claims'
import { normalize } from './normalize'
import type { Support, ToolResult } from './labProtocol'
import type { ViewId } from './route'

/** What a model value is called on a chip, by the view its tool lives on. */
const MODEL_NAMES: Record<ViewId, string> = {
  overview: 'Burn Twin model',
  interpret: 'Cabin model',
  rank: 'Orbital Risk Index',
  summarize: 'PSI-25 data',
}

/** A quote Lab Partner used, as a claim the citation drawer can show: checked against its passage. */
export function quoteClaim(support: Extract<Support, { kind: 'quote' }>): Claim {
  const source = getSource(support.sourceId)
  return {
    id: `lab.${support.chunkId}`,
    topic: 'lab-partner',
    text: `Lab Partner’s quote from the ${source?.short ?? 'source'}`,
    kind: 'quoted',
    sourceId: support.sourceId,
    locator:
      support.pdfPage !== undefined
        ? { pdfPage: support.pdfPage, reportPage: support.reportPage ?? null }
        : { file: support.file, line: support.line },
    quote: support.quote,
    verified: true,
  }
}

export interface Chip {
  key: string
  label: string
  /** What a click opens; null for a value with no claim behind it (it isn't a button then). */
  opens: string | Claim | null
}

/** Two chips that would show the same words from the same place are one chip. */
const quoteKey = (place: string, quote: string) => `${place}:${normalize(quote)}`

/** One chip per distinct place a sentence leans on. */
export function chipsFor(supports: readonly Support[], tools: readonly ToolResult[]): Chip[] {
  const chips: Chip[] = []
  const seen = new Set<string>()
  for (const support of supports) {
    let chip: Chip
    if (support.kind === 'quote') {
      chip = { key: quoteKey(support.place, support.quote), label: support.place, opens: quoteClaim(support) }
    } else {
      const claim = support.claimId ? getClaim(support.claimId) : undefined
      const tool = tools.find((t) => t.id === support.ref.split('.')[0])
      const label =
        claim?.kind === 'quoted' ? citePreview(claim) : tool?.view ? MODEL_NAMES[tool.view] : (claim?.text ?? 'Source')
      // One chip per name: two values from the same model share it (its drawer lists every input).
      // A quoted claim is keyed by its words too, so it merges with the same quote cited directly.
      const key = claim?.kind === 'quoted' && claim.quote ? quoteKey(label, claim.quote) : label
      chip = { key, label, opens: claim?.verified ? claim.id : null }
    }
    if (seen.has(chip.key)) continue
    seen.add(chip.key)
    chips.push(chip)
  }
  return chips
}
