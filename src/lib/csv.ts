// A small CSV reader for NASA's raw tables (RFC 4180). Pure, so it is easy to test.
// Cells are returned exactly as written: no trimming, no number conversion. Only the
// quoting is undone, so the cell "1/4"" clear rod" comes back as 1/4" clear rod.

const BOM = '﻿'

/**
 * Splits CSV text into rows of cells.
 * - Strips a leading byte-order mark.
 * - Accepts CRLF or LF line ends; a final line end does not make an empty row.
 * - A quoted cell may hold commas, line breaks and doubled quotes ("").
 */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith(BOM) ? text.slice(BOM.length) : text
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  let i = 0

  while (i < source.length) {
    const char = source[i]
    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i += 2
        continue
      }
      if (char === '"') {
        inQuotes = false
        i++
        continue
      }
      cell += char
      i++
      continue
    }
    if (char === '"' && cell === '') {
      inQuotes = true
      i++
      continue
    }
    if (char === ',') {
      row.push(cell)
      cell = ''
      i++
      continue
    }
    if (char === '\r' || char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i += char === '\r' && source[i + 1] === '\n' ? 2 : 1
      continue
    }
    cell += char
    i++
  }
  if (inQuotes) throw new Error('CSV ends inside a quoted cell')
  // The last row, unless the text ended with a line break.
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

/**
 * Reads a CSV with a header row into records keyed by the trimmed header names.
 * Every data row must have exactly as many cells as the header.
 */
export function readCsvTable(text: string): { headers: string[]; records: Record<string, string>[] } {
  const [headerRow, ...dataRows] = parseCsv(text)
  if (!headerRow) throw new Error('CSV is empty')
  const headers = headerRow.map((name) => name.trim())
  const records = dataRows.map((cells, index) => {
    if (cells.length !== headers.length) {
      throw new Error(`CSV row ${index + 1} has ${cells.length} cells; the header has ${headers.length}`)
    }
    return Object.fromEntries(headers.map((name, column) => [name, cells[column]]))
  })
  return { headers, records }
}
