// GFM tables: parsing, and how wide the engine's own drawing of one is.

import { cellWidth, plain } from './width'

export type Table = { header: string[]; rows: string[][] }

const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

export function isTableStart(line: string, next: string | undefined): boolean {
  return line.includes('|') && next !== undefined && next.includes('|') && DELIMITER.test(next)
}

function cells(line: string): string[] {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1)
  const out: string[] = []
  let cell = ''
  let inCode = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '\\' && body[i + 1] === '|') {
      cell += '|'
      i++
    } else if (ch === '`') {
      inCode = !inCode
      cell += ch
    } else if (ch === '|' && !inCode) {
      out.push(cell.trim())
      cell = ''
    } else {
      cell += ch
    }
  }
  out.push(cell.trim())
  return out
}

/** The header and body rows of a table's lines (header, delimiter, rows). */
export function parseTable(lines: readonly string[]): Table {
  const header = cells(lines[0] ?? '').map(plain)
  const rows = lines.slice(2).map(line => {
    const row = cells(line).map(plain)
    while (row.length < header.length) row.push('')
    return row.slice(0, header.length)
  })
  return { header, rows }
}

/** Cells across the engine's drawing: each column's widest cell, padded and ruled. */
export function tableWidth(table: Table): number {
  const widths = table.header.map((head, col) =>
    Math.max(cellWidth(head), ...table.rows.map(row => cellWidth(row[col] ?? ''))),
  )
  return widths.reduce((sum, w) => sum + w + 3, 1)
}
