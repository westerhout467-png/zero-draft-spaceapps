// npm run pipeline:text
//
// Turns each investigation's source files into normalized text, split by page, in
// pipeline/text/<ID>.pages.json (SPEC §7.2). The LLM steps (extract.ts, outcomes.ts) read these
// files, and the verify steps check quotes against the same text, so both see identical words.
//
// - .txt and .tsv files are one page each, with their lines kept (a PSI quote is cited by line).
// - .pdf files go through unpdf, one entry per PDF page; the report's own page number is read
//   from its header ("NASA/TM-20210011385 52").
// - Other files (.csv, .bib) are left out: compile-bass2.ts reads the BASS-II CSV.
// No LLM is involved, so model and promptVersion are null (CLAUDE.md rule 11).
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractText, getDocumentProxy } from 'unpdf'
import { normalize } from '../../src/lib/normalize'
import type { PagesFile, TextPage } from '../../src/lib/pages'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SOURCES_DIR = join(ROOT, 'pipeline', 'sources')
const OUT_DIR = join(ROOT, 'pipeline', 'text')

/** The investigations M7 reads (SPEC §9 M7). Name others on the command line. */
const DEFAULT_IDS = ['PSI-25', 'PSI-26', 'PSI-62', 'PSI-69', 'PSI-98', 'PSI-99', 'PSI-100', 'PSI-102']

/** "NASA/TM-20210011385 52 …" at the top of a page: the report's own page number. */
const REPORT_HEADER = /^NASA\/TM-\d+ (\S+) /

async function pdfPages(dir: string, file: string): Promise<TextPage[]> {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(join(dir, file))), { verbosity: 0 })
  const { text } = await extractText(pdf, { mergePages: false })
  return text.map((raw, i) => {
    const page = normalize(raw)
    const label = REPORT_HEADER.exec(page)?.[1]
    return { file, page: i + 1, reportPage: label && /^\d+$/.test(label) ? Number(label) : null, text: page }
  })
}

function textPage(dir: string, file: string): TextPage {
  const lines = readFileSync(join(dir, file), 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    // Tabs separate a PSI field's name from its value: keep them, normalize the rest of the line.
    .map((line) => line.split('\t').map(normalize).join('\t'))
  return { file, page: 1, reportPage: null, text: lines.join('\n'), lines }
}

async function main() {
  const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS
  mkdirSync(OUT_DIR, { recursive: true })
  for (const id of ids) {
    const dir = join(SOURCES_DIR, id)
    const pages: TextPage[] = []
    for (const file of readdirSync(dir).sort()) {
      if (/\.pdf$/i.test(file)) pages.push(...(await pdfPages(dir, file)))
      else if (/\.(txt|tsv)$/i.test(file)) pages.push(textPage(dir, file))
    }
    const out: PagesFile = {
      generatedBy: 'pipeline/scripts/text.ts',
      generatedAt: new Date().toISOString(),
      model: null,
      promptVersion: null,
      id,
      pages,
    }
    writeFileSync(join(OUT_DIR, `${id}.pages.json`), JSON.stringify(out, null, 1) + '\n')
    const files = [...new Set(pages.map((page) => page.file))]
    console.log(`${id}: ${pages.length} pages from ${files.length} files (${files.join(', ')})`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
