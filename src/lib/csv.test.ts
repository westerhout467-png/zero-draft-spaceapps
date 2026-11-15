import { describe, expect, it } from 'vitest'
import { parseCsv, readCsvTable } from './csv'

describe('parseCsv', () => {
  it('strips the byte-order mark and handles CRLF', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('handles LF and a last line with no line end', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('undoes quoting: doubled quotes, commas and line breaks inside quotes', () => {
    expect(parseCsv('"1/4"" clear rod","a, b","two\r\nlines"\r\n')).toEqual([['1/4" clear rod', 'a, b', 'two\r\nlines']])
  })

  it('keeps cells exactly: spaces, empty cells', () => {
    expect(parseCsv('  x  ,,\r\n')).toEqual([['  x  ', '', '']])
  })

  it('fails on an unclosed quote', () => {
    expect(() => parseCsv('"open')).toThrow()
  })
})

describe('readCsvTable', () => {
  it('trims header names and keys each row by them', () => {
    const { headers, records } = readCsvTable(' A ,B  \r\n1 , 2\r\n')
    expect(headers).toEqual(['A', 'B'])
    expect(records).toEqual([{ A: '1 ', B: ' 2' }])
  })

  it('fails when a row has the wrong number of cells', () => {
    expect(() => readCsvTable('a,b\r\n1\r\n')).toThrow()
  })
})
