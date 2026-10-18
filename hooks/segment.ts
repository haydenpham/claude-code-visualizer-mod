// A reply block split into the parts lens draws itself and the markdown around them.

import { parseChain, type Chain } from './flow'
import { isTableStart, parseTable, type Table } from './table'

export type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'table'; text: string; table: Table }
  | { kind: 'mermaid'; text: string; source: string }
  | { kind: 'chain'; text: string; chain: Chain }

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)/

export function segment(text: string): Segment[] {
  const lines = text.split('\n')
  const out: Segment[] = []
  let prose: string[] = []
  const flush = () => {
    if (prose.length > 0) out.push({ kind: 'markdown', text: prose.join('\n') })
    prose = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const fence = FENCE.exec(line)
    if (fence) {
      const mark = fence[1] ?? '```'
      const close = lines.findIndex((candidate, j) => {
        const t = candidate.trim()
        return j > i && t.length >= mark.length && t === mark.charAt(0).repeat(t.length)
      })
      // An unclosed fence (a reply still streaming) stays markdown to the end.
      const end = close === -1 ? lines.length - 1 : close
      const body = lines.slice(i, end + 1)
      if (close !== -1 && fence[2]?.toLowerCase() === 'mermaid') {
        flush()
        out.push({ kind: 'mermaid', text: body.join('\n'), source: lines.slice(i + 1, end).join('\n') })
      } else {
        prose.push(...body)
      }
      i = end
      continue
    }

    if (isTableStart(line, lines[i + 1])) {
      let end = i + 2
      while (end < lines.length && (lines[end] ?? '').includes('|') && (lines[end] ?? '').trim() !== '') end++
      const body = lines.slice(i, end)
      flush()
      out.push({ kind: 'table', text: body.join('\n'), table: parseTable(body) })
      i = end - 1
      continue
    }

    const chain = parseChain(line)
    if (chain) {
      flush()
      out.push({ kind: 'chain', text: line, chain })
      continue
    }

    prose.push(line)
  }
  flush()
  return out
}
