// Sequence diagrams: participants as columns, messages as arrows between lifelines.

import { Canvas, type LineStyle } from './canvas'
import { cellWidth } from '../width'

type Step =
  | { kind: 'message'; from: number; to: number; text: string; style: LineStyle }
  | { kind: 'note'; from: number; to: number; side: 'over' | 'left' | 'right'; text: string }
  | { kind: 'rule'; text: string }

const MESSAGE = /^(.+?)\s*(-->>|->>|--x|-x|--\)|-\)|-->|->)\s*[+-]?\s*(.+?)\s*:\s*(.*)$/
const NOTE = /^note\s+(right of|left of|over)\s+([^:]+?)\s*:\s*(.*)$/i
const BLOCK = /^(loop|alt|else|opt|par|and|critical|option|break)\b\s*(.*)$/
const SILENT = /^(rect|box)\b/

export function parseSequence(source: string) {
  const lines = source
    .split('\n')
    .map(line => line.replace(/%%.*$/, '').trim())
    .filter(Boolean)
  if (!/^sequenceDiagram\b/.test(lines[0] ?? '')) return undefined
  const names: string[] = []
  const labels: string[] = []
  const index = (name: string) => {
    const at = names.indexOf(name)
    if (at !== -1) return at
    names.push(name)
    labels.push(name)
    return names.length - 1
  }
  const steps: Step[] = []
  const blocks: boolean[] = []
  let number = 0
  let isNumbered = false

  for (const line of lines.slice(1)) {
    const declared = /^(?:create\s+)?(?:participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/.exec(line)
    if (declared) {
      const at = index(declared[1] ?? '')
      labels[at] = declared[2] ?? declared[1] ?? ''
      continue
    }
    if (line === 'autonumber' || line.startsWith('autonumber ')) {
      isNumbered = true
      continue
    }
    if (/^(activate|deactivate|destroy|title|links?|properties|accTitle|accDescr)\b/.test(line)) continue
    const note = NOTE.exec(line)
    if (note) {
      const who = (note[2] ?? '').split(',').map(name => index(name.trim()))
      const side = note[1]?.toLowerCase().startsWith('over') ? 'over' : note[1]?.toLowerCase().startsWith('left') ? 'left' : 'right'
      steps.push({ kind: 'note', from: Math.min(...who), to: Math.max(...who), side, text: note[3] ?? '' })
      continue
    }
    if (SILENT.test(line)) {
      blocks.push(false)
      continue
    }
    const block = BLOCK.exec(line)
    if (block) {
      const kind = block[1] ?? ''
      if (kind !== 'else' && kind !== 'and' && kind !== 'option') blocks.push(true)
      steps.push({ kind: 'rule', text: `${kind}${block[2] ? `: ${block[2]}` : ''}` })
      continue
    }
    if (line === 'end') {
      if (blocks.pop()) steps.push({ kind: 'rule', text: '' })
      continue
    }
    const message = MESSAGE.exec(line)
    if (message) {
      const text = (message[4] ?? '').replace(/<br\s*\/?>/gi, ' ')
      steps.push({
        kind: 'message',
        from: index((message[1] ?? '').trim()),
        to: index((message[3] ?? '').trim()),
        text: isNumbered ? `${++number}. ${text}` : text,
        style: (message[2] ?? '').startsWith('--') ? 'dotted' : 'solid',
      })
    }
  }
  return { labels, steps }
}

export function layoutSequence(source: string): Canvas | undefined {
  const parsed = parseSequence(source)
  if (!parsed || parsed.labels.length === 0) return undefined
  const { labels, steps } = parsed
  const n = labels.length
  const boxes = labels.map(label => cellWidth(label) + 4)

  // Gaps between neighbouring lifelines, widened until every text fits.
  const gaps = boxes.slice(1).map((w, i) => Math.ceil((boxes[i] ?? 0) / 2) + Math.ceil(w / 2) + 2)
  let leftRoom = Math.ceil((boxes[0] ?? 0) / 2)
  let rightRoom = Math.ceil((boxes[n - 1] ?? 0) / 2)
  const need = (lo: number, hi: number, cells: number) => {
    const have = gaps.slice(lo, hi).reduce((a, b) => a + b, 0)
    if (have >= cells) return
    const each = Math.ceil((cells - have) / (hi - lo))
    for (let i = lo; i < hi; i++) gaps[i] = (gaps[i] ?? 0) + each
  }
  for (const step of steps) {
    if (step.kind === 'message') {
      const width = cellWidth(step.text)
      if (step.from === step.to) {
        if (step.from === n - 1) rightRoom = Math.max(rightRoom, width + 6)
        else need(step.from, step.from + 1, width + 8)
      } else {
        need(Math.min(step.from, step.to), Math.max(step.from, step.to), width + 6)
      }
    } else if (step.kind === 'note') {
      const width = cellWidth(step.text) + 4
      if (step.side === 'right') {
        if (step.from === n - 1) rightRoom = Math.max(rightRoom, width + 2)
        else need(step.from, step.from + 1, width + 4)
      } else if (step.side === 'left') {
        if (step.from === 0) leftRoom = Math.max(leftRoom, width + 2)
        else need(step.from - 1, step.from, width + 4)
      } else if (step.from === step.to) {
        if (step.from === 0) leftRoom = Math.max(leftRoom, Math.ceil(width / 2))
        if (step.from === n - 1) rightRoom = Math.max(rightRoom, Math.ceil(width / 2))
      } else {
        need(step.from, step.to, width - 2)
      }
    }
  }
  const centers = [leftRoom]
  gaps.forEach(gap => centers.push((centers[centers.length - 1] ?? 0) + gap))
  const at = (i: number) => centers[i] ?? 0
  const right = at(n - 1) + rightRoom

  const canvas = new Canvas()
  labels.forEach((label, i) => {
    const w = boxes[i] ?? 0
    canvas.box(at(i) - Math.floor(w / 2), 0, w, 3, 'square', [label])
    canvas.put(at(i), 2, '┬')
  })

  let y = 3
  for (const step of steps) {
    if (step.kind === 'rule') {
      const text = step.text ? `┄┄ ${step.text} ` : ''
      canvas.text(0, y, text + '┄'.repeat(Math.max(0, right - cellWidth(text))))
      y += 1
    } else if (step.kind === 'note') {
      const text = cellWidth(step.text) + 4
      const isSpan = step.side === 'over' && step.from !== step.to
      const w = isSpan ? Math.max(text, at(step.to) - at(step.from) + 4) : text
      const x =
        step.side === 'right' ? at(step.from) + 2
        : step.side === 'left' ? at(step.from) - 1 - w
        : Math.floor((at(step.from) + at(step.to)) / 2) - Math.floor(w / 2)
      canvas.box(Math.max(0, x), y, w, 3, 'round', [step.text])
      y += 3
    } else if (step.from === step.to) {
      const x = at(step.from)
      canvas.path([[x, y], [x + 3, y], [x + 3, y + 1], [x + 1, y + 1]], step.style)
      canvas.put(x + 1, y + 1, '◀')
      canvas.text(x + 5, y, step.text)
      y += 2
    } else {
      const [a, b] = [at(step.from), at(step.to)]
      const [lo, hi] = a < b ? [a, b] : [b, a]
      canvas.text(lo + Math.floor((hi - lo - cellWidth(step.text)) / 2), y, step.text)
      canvas.line(a, y + 1, b, y + 1, step.style)
      if (a < b) canvas.put(b - 1, y + 1, '▶')
      else canvas.put(b + 1, y + 1, '◀')
      y += 2
    }
  }
  for (let i = 0; i < n; i++) canvas.line(at(i), 3, at(i), y)
  return canvas
}
