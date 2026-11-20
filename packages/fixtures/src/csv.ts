/** CSV reading for the product import: RFC 4180 quoting, a UTF-8 byte order mark, `,` or `;`. */

export type CsvDelimiter = ',' | ';'

const BOM = '﻿'

/** Drops a leading byte order mark. */
export const stripBom = (text: string) => (text.startsWith(BOM) ? text.slice(BOM.length) : text)

/** Picks `;` when the first line holds more semicolons than commas outside quotes, `,` otherwise. */
export function detectDelimiter(text: string): CsvDelimiter {
  let commas = 0
  let semicolons = 0
  let quoted = false
  for (const ch of stripBom(text)) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === '\n' || ch === '\r')) break
    else if (!quoted && ch === ',') commas++
    else if (!quoted && ch === ';') semicolons++
  }
  return semicolons > commas ? ';' : ','
}

/**
 * Reads CSV text into rows of cells. Quoted cells may hold the delimiter, line breaks and doubled
 * quotes; lines end in LF or CRLF; blank lines are skipped. Stops after `limit` rows when given.
 */
export function parseCsv(text: string, delimiter: CsvDelimiter = detectDelimiter(text), limit = Infinity): string[][] {
  const src = stripBom(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  let i = 0
  const endRow = () => {
    row.push(cell)
    if (row.length > 1 || row[0] !== '') rows.push(row)
    row = []
    cell = ''
  }
  while (i < src.length && rows.length < limit) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i += 2
        continue
      }
      if (ch === '"') quoted = false
      else cell += ch
      i++
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      endRow()
      if (ch === '\r' && src[i + 1] === '\n') i++
    } else cell += ch
    i++
  }
  if (rows.length < limit && (cell !== '' || row.length > 0)) endRow()
  return rows
}
