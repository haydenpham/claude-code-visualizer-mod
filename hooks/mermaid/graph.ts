// Flowcharts and state diagrams: parsed into one graph shape.

import type { LineStyle } from './canvas'

export type Direction = 'TD' | 'LR' | 'BT' | 'RL'
export type Shape = 'square' | 'round' | 'decision' | 'start' | 'end'

export type GraphNode = { id: string; lines: string[]; shape: Shape }
export type GraphEdge = { from: string; to: string; label?: string; style: LineStyle; isDirected: boolean }
export type Group = { title: string; members: string[] }
export type Graph = { direction: Direction; nodes: Map<string, GraphNode>; edges: GraphEdge[]; groups: Group[] }

function direction(word: string | undefined): Direction | undefined {
  switch (word?.toUpperCase()) {
    case 'TD':
    case 'TB':
      return 'TD'
    case 'LR':
    case 'BT':
    case 'RL':
      return word.toUpperCase() as Direction
    default:
      return undefined
  }
}

function label(text: string): string[] {
  return text
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .replace(/^`(.*)`$/s, '$1')
    .replace(/#quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/fa:fa-[\w-]+\s*/g, '')
    .replace(/\*\*|__|<\/?(b|i|em|strong)>/gi, '')
    .split(/<br\s*\/?>|\\n|\n/i)
    .map(line => line.trim())
    .filter(line => line.length > 0)
}

class Builder {
  nodes = new Map<string, GraphNode>()
  edges: GraphEdge[] = []
  groups: Group[] = []
  private open: Group[] = []

  node(id: string, lines?: string[], shape?: Shape): string {
    const known = this.nodes.get(id)
    if (known) {
      if (lines && lines.length > 0) known.lines = lines
      if (shape) known.shape = shape
    } else {
      this.nodes.set(id, { id, lines: lines && lines.length > 0 ? lines : [id], shape: shape ?? 'square' })
      for (const group of this.open) group.members.push(id)
    }
    return id
  }

  enter(title: string) {
    const group = { title, members: [] }
    this.groups.push(group)
    this.open.push(group)
  }

  leave() {
    this.open.pop()
  }
}

// ── flowchart / graph ─────────────────────────────────────────────

const SHAPES: readonly [string, string, Shape][] = [
  ['([', '])', 'round'],
  ['[[', ']]', 'square'],
  ['[(', ')]', 'square'],
  ['((', '))', 'round'],
  ['{{', '}}', 'decision'],
  ['[/', '/]', 'square'],
  ['[\\', '\\]', 'square'],
  ['[', ']', 'square'],
  ['(', ')', 'round'],
  ['{', '}', 'decision'],
  ['>', ']', 'square'],
]

const ID = /^[A-Za-z0-9_À-￿][\wÀ-￿]*/
const PLAIN_LINK = /^(<)?(-{2,}>|={2,}>|-\.+->|-{3,}|={3,}|-\.+-|~~~|--[ox]|==[ox])(?:\s*\|([^|]*)\|)?/
const TEXT_LINK = /^(<)?(--|==|-\.)\s*([^>|-][^>|]*?)\s*(-{2,}>|={2,}>|\.+->|-{3,}|={3,}|\.+-)/

class Statement {
  at = 0
  constructor(
    private text: string,
    private graph: Builder,
  ) {}

  private skip() {
    while (/\s/.test(this.text[this.at] ?? '')) this.at++
  }

  private rest() {
    return this.text.slice(this.at)
  }

  nodeRef(): string | undefined {
    this.skip()
    const id = ID.exec(this.rest())?.[0]
    if (!id) return undefined
    this.at += id.length
    let lines: string[] | undefined
    let shape: Shape | undefined
    for (const [open, close, kind] of SHAPES) {
      if (!this.rest().startsWith(open)) continue
      const body = this.rest().slice(open.length)
      const quoted = /^\s*"([^"]*)"\s*/.exec(body)
      const end = quoted ? body.indexOf(close, quoted[0].length) : body.indexOf(close)
      if (end === -1) continue
      lines = label(quoted ? quoted[1] ?? '' : body.slice(0, end))
      shape = kind
      this.at += open.length + end + close.length
      break
    }
    const cls = /^:::[\w-]+/.exec(this.rest())
    if (cls) this.at += cls[0].length
    return this.graph.node(id, lines, shape)
  }

  nodeGroup(): string[] | undefined {
    const first = this.nodeRef()
    if (!first) return undefined
    const ids = [first]
    for (;;) {
      const mark = this.at
      this.skip()
      if (this.text[this.at] !== '&') {
        this.at = mark
        return ids
      }
      this.at++
      const next = this.nodeRef()
      if (!next) return ids
      ids.push(next)
    }
  }

  link(): Omit<GraphEdge, 'from' | 'to'> | 'hidden' | undefined {
    this.skip()
    const plain = PLAIN_LINK.exec(this.rest())
    const text = plain ? undefined : TEXT_LINK.exec(this.rest())
    const found = plain ?? text
    if (!found) return undefined
    this.at += found[0].length
    const body = plain ? plain[2] ?? '' : `${text?.[2] ?? ''}${text?.[4] ?? ''}`
    if (body === '~~~') return 'hidden'
    const words = (plain ? plain[3] : text?.[3])?.trim()
    return {
      label: words ? label(words).join(' ') : undefined,
      style: body.includes('=') ? 'thick' : body.includes('.') ? 'dotted' : 'solid',
      isDirected: /[>ox]$/.test(body),
    }
  }

  run() {
    let left = this.nodeGroup()
    while (left) {
      const link = this.link()
      if (!link) return
      const right = this.nodeGroup()
      if (!right) return
      if (link !== 'hidden') {
        for (const from of left) for (const to of right) this.graph.edges.push({ from, to, ...link })
      }
      left = right
    }
  }
}

function statements(source: string): string[] {
  return source
    .split('\n')
    .flatMap(line => line.split(/;\s*$|;(?=\s)/))
    .map(line => line.replace(/%%.*$/, '').trim())
    .filter(line => line.length > 0)
}

export function parseFlowchart(source: string): Graph | undefined {
  const lines = statements(source)
  const head = /^(?:flowchart|graph)\b(?:\s+(\w+))?/i.exec(lines[0] ?? '')
  if (!head) return undefined
  let dir = direction(head[1]) ?? 'TD'
  const graph = new Builder()
  for (const line of lines.slice(1)) {
    if (/^(classDef|class|style|linkStyle|click|accTitle|accDescr)\b/.test(line)) continue
    const turn = /^direction\s+(\w+)/.exec(line)
    if (turn) {
      if (graph.groups.length === 0) dir = direction(turn[1]) ?? dir
      continue
    }
    const sub = /^subgraph\s+(.*)$/.exec(line)
    if (sub) {
      const named = /^([\w-]+)\s*\[(.*)\]$/.exec(sub[1] ?? '')
      graph.enter(label(named ? named[2] ?? '' : sub[1] ?? '').join(' '))
      continue
    }
    if (line === 'end') {
      graph.leave()
      continue
    }
    new Statement(line, graph).run()
  }
  return { direction: dir, nodes: graph.nodes, edges: graph.edges, groups: graph.groups }
}

// ── stateDiagram ──────────────────────────────────────────────────

const STATE_ARROW = /^(\[\*\]|[\w.-]+)\s*-->\s*(\[\*\]|[\w.-]+)\s*(?::\s*(.*))?$/

export function parseStateDiagram(source: string): Graph | undefined {
  const lines = statements(source)
  if (!/^stateDiagram(-v2)?\b/.test(lines[0] ?? '')) return undefined
  let dir: Direction = 'TD'
  const graph = new Builder()
  let inNote = false
  for (const line of lines.slice(1)) {
    if (inNote) {
      if (/^end note$/i.test(line)) inNote = false
      continue
    }
    if (/^note\b/i.test(line)) {
      if (!line.includes(':')) inNote = true
      continue
    }
    if (/^(classDef|class|style|--)\b|^--$/.test(line)) continue
    const turn = /^direction\s+(\w+)/.exec(line)
    if (turn) {
      if (graph.groups.length === 0) dir = direction(turn[1]) ?? dir
      continue
    }
    const composite = /^state\s+(?:"([^"]*)"\s+as\s+)?([\w.-]+)\s*\{$/.exec(line)
    if (composite) {
      graph.enter(composite[1] ?? composite[2] ?? '')
      continue
    }
    if (line === '}') {
      graph.leave()
      continue
    }
    const alias = /^state\s+"([^"]*)"\s+as\s+([\w.-]+)$/.exec(line)
    if (alias) {
      graph.node(alias[2] ?? '', label(alias[1] ?? ''))
      continue
    }
    const special = /^state\s+([\w.-]+)\s+<<(\w+)>>$/.exec(line)
    if (special) {
      graph.node(special[1] ?? '', [special[1] ?? ''], special[2] === 'choice' ? 'decision' : 'square')
      continue
    }
    const arrow = STATE_ARROW.exec(line)
    if (arrow) {
      const from = arrow[1] === '[*]' ? graph.node('[*]start', ['●'], 'start') : graph.node(arrow[1] ?? '', undefined, 'round')
      const to = arrow[2] === '[*]' ? graph.node('[*]end', ['◉'], 'end') : graph.node(arrow[2] ?? '', undefined, 'round')
      const words = arrow[3]?.trim()
      graph.edges.push({ from, to, label: words || undefined, style: 'solid', isDirected: true })
      continue
    }
    const described = /^([\w.-]+)\s*:\s*(.+)$/.exec(line)
    if (described) {
      const id = described[1] ?? ''
      graph.node(id, [id, ...label(described[2] ?? '')], 'round')
      continue
    }
    const bare = /^(?:state\s+)?([\w.-]+)$/.exec(line)
    if (bare) graph.node(bare[1] ?? '', undefined, 'round')
  }
  return { direction: dir, nodes: graph.nodes, edges: graph.edges, groups: graph.groups }
}
