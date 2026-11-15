// npm run pipeline:extract             (asks only for batches with no kept reply)
// npm run pipeline:extract -- --fresh  (asks again for both)
//
// The investigation extraction (SPEC F7, §7.2): two LLM calls of four investigations each (a free
// tier allows few requests a day), temperature 0, with pipeline/prompts/extract-investigation.md.
// Each investigation's section holds only its PSI metadata (i_Investigation.txt and s_*.txt,
// without blank fields and contact details). PSI-25 has no metadata file in our sources, so its
// section is the report's summary page (PDF p. 9) and nothing else of the report. The raw replies
// are kept untouched in pipeline/out/raw/extract-batch-<n>.json; verify.ts decides what of them
// may be shown, checking each investigation's quotes against its own text only.
import { metadataForModel } from '../../src/lib/investigationVerify'
import type { TextPage } from '../../src/lib/pages'
import { ask, callsMade, loadPages, loadPrompt } from './pipelineIo'

export const GENERATED_BY = 'pipeline/scripts/extract.ts'
export const PROMPT = 'extract-investigation.md'
export const INVESTIGATION_IDS = ['PSI-25', 'PSI-26', 'PSI-62', 'PSI-69', 'PSI-98', 'PSI-99', 'PSI-100', 'PSI-102']

/** PSI-25's only input: the page of the BASS-II report that holds its Summary. */
export const PSI_25_SUMMARY_PAGE = 9

/** The pages of an investigation the model reads, and verify.ts checks quotes against. */
export function pagesFor(id: string): TextPage[] {
  const pages = loadPages(id).pages
  if (id === 'PSI-25') return pages.filter((page) => /\.pdf$/i.test(page.file) && page.page === PSI_25_SUMMARY_PAGE)
  return pages.filter((page) => /^(i_Investigation|s_.+)\.txt$/.test(page.file))
}

/**
 * Two calls. The three Saffire records share whole paragraphs, so they aren't all in one call;
 * each call is about 6,000 tokens of text.
 */
export const BATCHES: readonly (readonly string[])[] = [
  ['PSI-25', 'PSI-26', 'PSI-62', 'PSI-98'],
  ['PSI-69', 'PSI-99', 'PSI-100', 'PSI-102'],
]

/** One investigation's section: its id, then each page under its label. */
export function sectionFor(id: string): string {
  const parts = pagesFor(id)
    .map((page) => ({ page, text: page.lines ? metadataForModel(page) : page.text }))
    // A sample file that only says "Do not use this" has nothing to read.
    .filter(({ text }) => text.length > 80)
    .map(({ page, text }) => `[${page.file} p.${page.page}]\n${text}`)
  return `===== Investigation: ${id} =====\n\n${parts.join('\n\n')}`
}

/** A batch's user message: its investigations' sections, one after another. */
export const inputFor = (ids: readonly string[]): string => ids.map(sectionFor).join('\n\n\n')

export const rawName = (batch: number) => `extract-batch-${batch + 1}`

async function main() {
  const fresh = process.argv.includes('--fresh')
  const prompt = loadPrompt(PROMPT)
  for (const [i, ids] of BATCHES.entries()) {
    const user = inputFor(ids)
    const raw = await ask({
      name: rawName(i),
      generatedBy: GENERATED_BY,
      subject: ids.join(', '),
      prompt,
      user,
      // The reply is checked field by field in verify.ts, so it only has to be JSON. Four
      // investigations are about 5,000 tokens of JSON; the rest is room for the model's thinking,
      // which Gemini counts in the cap.
      maxOutputTokens: 16_000,
      fresh,
    })
    console.log(`batch ${i + 1} (${ids.join(', ')}): ${user.length} characters in, ${raw.usage?.output ?? '?'} tokens out, by ${raw.model} (${raw.finishReason ?? 'no finish reason'})`)
  }
  console.log(`LLM calls made: ${callsMade}`)
}

// Only when run as a script: verify.ts imports the helpers above.
if (process.argv[1]?.endsWith('extract.ts')) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
