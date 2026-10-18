// A graph laid out in ranks and drawn on a canvas, top-down or left-right.

import { Canvas, type LineStyle } from './canvas'
import { cellWidth } from '../width'
import type { Direction, Graph, GraphEdge, GraphNode } from './graph'

type Item = {
  id: string
  node?: GraphNode
  rank: number
  order: number
  /** Size along the ranks' axis and across it, in cells. */
  main: number
  cross: number
  /** Where it starts along each axis once placed. */
  at: number
  left: number
}

type Hop = { from: string; to: string; edge: GraphEdge; isFirst: boolean; isLast: boolean; isReversed: boolean }

const CROSS_GAP: Record<'TD' | 'LR', number> = { TD: 4, LR: 1 }

function nodeSize(node: GraphNode, axis: 'TD' | 'LR'): { main: number; cross: number } {
  if (node.shape === 'start' || node.shape === 'end') return { main: 1, cross: 1 }
  const w = Math.max(...node.lines.map(cellWidth)) + 4
  const h = node.lines.length + 2
  return axis === 'TD' ? { main: h, cross: w } : { main: w, cross: h }
}

function center(item: Item): number {
  return item.left + Math.floor(item.cross / 2)
}

/** Edges as hops between neighbouring ranks, cycles and BT/RL turned to run forward. */
function rankAndSplit(graph: Graph, flip: boolean) {
  const ids = [...graph.nodes.keys()]
  const out = new Map<string, string[]>(ids.map(id => [id, []]))
  const forward: { from: string; to: string; edge: GraphEdge; isReversed: boolean }[] = []

  // Break cycles: an edge back to a node still on the depth-first stack runs reversed.
  const state = new Map<string, 'open' | 'done'>()
  const ordered = graph.edges.filter(edge => edge.from !== edge.to)
  const visit = (id: string) => {
    state.set(id, 'open')
    for (const edge of ordered.filter(e => (flip ? e.to : e.from) === id)) {
      const next = flip ? edge.from : edge.to
      if (state.get(next) === 'open') {
        forward.push({ from: next, to: id, edge, isReversed: !flip })
      } else {
        forward.push({ from: id, to: next, edge, isReversed: flip })
        if (!state.has(next)) visit(next)
      }
    }
    state.set(id, 'done')
  }
  for (const id of ids) if (!state.has(id)) visit(id)
  for (const hop of forward) out.get(hop.from)?.push(hop.to)

  // Longest path from the sources.
  const rank = new Map<string, number>(ids.map(id => [id, 0]))
  const indegree = new Map<string, number>(ids.map(id => [id, 0]))
  for (const hop of forward) indegree.set(hop.to, (indegree.get(hop.to) ?? 0) + 1)
  const queue = ids.filter(id => indegree.get(id) === 0)
  while (queue.length > 0) {
    const id = queue.shift() ?? ''
    for (const next of out.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next) ?? 0, (rank.get(id) ?? 0) + 1))
      indegree.set(next, (indegree.get(next) ?? 0) - 1)
      if (indegree.get(next) === 0) queue.push(next)
    }
  }

  // Edges spanning several ranks pass through one-cell waypoints.
  const hops: Hop[] = []
  const waypoints: { id: string; rank: number }[] = []
  forward.forEach((link, n) => {
    const from = rank.get(link.from) ?? 0
    const to = rank.get(link.to) ?? 0
    let prev = link.from
    for (let r = from + 1; r < to; r++) {
      const id = `\u0000${n}:${r}`
      waypoints.push({ id, rank: r })
      hops.push({ from: prev, to: id, edge: link.edge, isFirst: prev === link.from, isLast: false, isReversed: link.isReversed })
      prev = id
    }
    hops.push({ from: prev, to: link.to, edge: link.edge, isFirst: prev === link.from, isLast: true, isReversed: link.isReversed })
  })
  return { rank, hops, waypoints }
}

function place(items: Map<string, Item>, ranks: Item[][], hops: Hop[], gap: number) {
  const up = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const hop of hops) {
    down.set(hop.from, [...(down.get(hop.from) ?? []), hop.to])
    up.set(hop.to, [...(up.get(hop.to) ?? []), hop.from])
  }
  const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length

  // Order within ranks by the barycenter of neighbours, sweeping down and up.
  for (let sweep = 0; sweep < 4; sweep++) {
    const isDown = sweep % 2 === 0
    const sequence = isDown ? ranks.slice(1) : ranks.slice(0, -1).reverse()
    for (const layer of sequence) {
      const keyOf = (item: Item) => {
        const near = (isDown ? up : down).get(item.id) ?? []
        return near.length > 0 ? mean(near.map(id => items.get(id)?.order ?? 0)) : item.order
      }
      const keyed = layer.map(item => ({ item, key: keyOf(item) }))
      keyed.sort((a, b) => a.key - b.key)
      keyed.forEach(({ item }, i) => (item.order = i))
      layer.sort((a, b) => a.order - b.order)
    }
  }

  // Positions across: packed, then pulled toward neighbours' centers.
  for (const layer of ranks) {
    let left = 0
    for (const item of layer) {
      item.left = left
      left += item.cross + gap
    }
  }
  const settle = (layer: Item[], desired: number[]) => {
    const fromLeft = layer.map(() => 0)
    layer.forEach((item, i) => {
      const want = (desired[i] ?? 0) - Math.floor(item.cross / 2)
      const prev = layer[i - 1]
      fromLeft[i] = prev ? Math.max(want, (fromLeft[i - 1] ?? 0) + prev.cross + gap) : want
    })
    const fromRight = layer.map(() => 0)
    for (let i = layer.length - 1; i >= 0; i--) {
      const item = layer[i]!
      const want = (desired[i] ?? 0) - Math.floor(item.cross / 2)
      fromRight[i] = i < layer.length - 1 ? Math.min(want, (fromRight[i + 1] ?? 0) - item.cross - gap) : want
    }
    layer.forEach((item, i) => (item.left = Math.round(((fromLeft[i] ?? 0) + (fromRight[i] ?? 0)) / 2)))
    layer.forEach((item, i) => {
      const prev = layer[i - 1]
      if (prev) item.left = Math.max(item.left, prev.left + prev.cross + gap)
    })
  }
  for (let pass = 0; pass < 4; pass++) {
    const isDown = pass % 2 === 0
    const sequence = isDown ? ranks.slice(1) : ranks.slice(0, -1).reverse()
    for (const layer of sequence) {
      const desired = layer.map(item => {
        const near = ((isDown ? up : down).get(item.id) ?? []).map(id => items.get(id)).filter(Boolean) as Item[]
        return near.length > 0 ? Math.round(mean(near.map(center))) : center(item)
      })
      settle(layer, desired)
    }
  }
  const min = Math.min(...[...items.values()].map(item => item.left))
  for (const item of items.values()) item.left -= min
}

/** Rows (or columns) that do not overlap share one jog track. */
function tracks(spans: { key: string; lo: number; hi: number }[]): Map<string, number> {
  const taken: { lo: number; hi: number }[][] = []
  const track = new Map<string, number>()
  for (const span of [...spans].sort((a, b) => a.lo - b.lo)) {
    let t = taken.findIndex(row => row.every(s => span.lo > s.hi + 1 || span.hi < s.lo - 1))
    if (t === -1) {
      t = taken.length
      taken.push([])
    }
    taken[t]!.push(span)
    track.set(span.key, t)
  }
  return track
}

export function layoutGraph(graph: Graph, dir: Direction): Canvas {
  const axis: 'TD' | 'LR' = dir === 'TD' || dir === 'BT' ? 'TD' : 'LR'
  const { rank, hops, waypoints } = rankAndSplit(graph, dir === 'BT' || dir === 'RL')

  const items = new Map<string, Item>()
  for (const node of graph.nodes.values()) {
    const size = nodeSize(node, axis)
    items.set(node.id, { id: node.id, node, rank: rank.get(node.id) ?? 0, order: items.size, ...size, at: 0, left: 0 })
  }
  for (const point of waypoints) {
    items.set(point.id, { id: point.id, rank: point.rank, order: items.size, main: 1, cross: 1, at: 0, left: 0 })
  }
  const ranks: Item[][] = []
  for (const item of items.values()) (ranks[item.rank] ??= []).push(item)
  for (let r = 0; r < ranks.length; r++) ranks[r] ??= []
  place(items, ranks, hops, CROSS_GAP[axis])

  // A back edge leaves and enters a wide box beside the forward edges, not on them.
  const isBox = (item: Item) => item.node !== undefined && item.node.shape !== 'start' && item.node.shape !== 'end'
  const crossOf = (item: Item, hop: Hop) =>
    center(item) + (axis === 'TD' && hop.isReversed && isBox(item) && item.cross >= 7 ? 2 : 0)

  // Along the ranks' axis: each band, then the gap after it for jogs, labels and arrows.
  const bandStart: number[] = []
  const bandSize = ranks.map(layer => Math.max(1, ...layer.filter(item => item.node).map(item => item.main)))
  const gapTracks: Map<string, number>[] = []
  const gapLabel: number[] = []
  let at = 0
  ranks.forEach((layer, r) => {
    bandStart[r] = at
    for (const item of layer) item.at = at
    at += bandSize[r] ?? 1
    const inGap = hops.filter(hop => items.get(hop.from)?.rank === r)
    const spans = inGap
      .map(hop => {
        const a = crossOf(items.get(hop.from)!, hop)
        const b = crossOf(items.get(hop.to)!, hop)
        return { key: hop.from, lo: Math.min(a, b), hi: Math.max(a, b) }
      })
      .filter(span => span.lo !== span.hi)
    const merged = new Map<string, { key: string; lo: number; hi: number }>()
    for (const span of spans) {
      const known = merged.get(span.key)
      merged.set(span.key, known ? { key: span.key, lo: Math.min(known.lo, span.lo), hi: Math.max(known.hi, span.hi) } : span)
    }
    const track = tracks([...merged.values()])
    gapTracks[r] = track
    const labels = inGap.filter(hop => hop.isLast && hop.edge.label).map(hop => cellWidth(hop.edge.label ?? ''))
    const jogs = track.size === 0 ? 0 : Math.max(...track.values()) + 1
    gapLabel[r] = labels.length === 0 ? 0 : axis === 'TD' ? 1 : Math.max(...labels) + 2
    if (r < ranks.length - 1) at += 2 + jogs + (gapLabel[r] ?? 0)
  })

  const canvas = new Canvas()
  const point = (main: number, cross: number): [number, number] => (axis === 'TD' ? [cross, main] : [main, cross])
  const put = (main: number, cross: number, ch: string) => canvas.put(...point(main, cross), ch)
  const arrows = axis === 'TD' ? { fwd: '▼', back: '▲', exit: '┬', entry: '┴' } : { fwd: '▶', back: '◀', exit: '├', entry: '┤' }

  for (const item of items.values()) {
    const node = item.node
    if (!node) continue
    if (node.shape === 'start' || node.shape === 'end') {
      put(item.at, item.left, node.shape === 'start' ? '●' : '◉')
      continue
    }
    const [x, y] = point(item.at, item.left)
    const [w, h] = axis === 'TD' ? [item.cross, item.main] : [item.main, item.cross]
    canvas.box(x, y, w, h, node.shape === 'decision' ? 'decision' : node.shape === 'round' ? 'round' : 'square', node.lines)
  }

  const labelled: { main: number; cross: number; text: string }[] = []
  for (const hop of hops) {
    const a = items.get(hop.from)!
    const b = items.get(hop.to)!
    const r = a.rank
    const gapStart = (bandStart[r] ?? 0) + (bandSize[r] ?? 1)
    const jogs = gapTracks[r]?.size ? Math.max(...(gapTracks[r]?.values() ?? [])) + 1 : 0
    const sx = crossOf(a, hop)
    const tx = crossOf(b, hop)
    let start = a.node ? a.at + a.main : bandStart[r] ?? 0
    let end = (bandStart[b.rank] ?? 0) - 1
    const arrowAtEnd = hop.isLast && hop.edge.isDirected && !hop.isReversed
    const arrowAtStart = hop.isFirst && hop.edge.isDirected && hop.isReversed
    if (arrowAtEnd) put(end--, tx, arrows.fwd)
    else if (hop.isLast && isBox(b)) put(end + 1, tx, arrows.entry)
    if (arrowAtStart) put(start++, sx, arrows.back)
    else if (hop.isFirst && isBox(a)) put(start - 1, sx, arrows.exit)
    const jog = gapStart + 1 + (gapTracks[r]?.get(hop.from) ?? 0)
    const style: LineStyle = hop.edge.style
    canvas.path(sx === tx ? [point(start, sx), point(end, tx)] : [point(start, sx), point(jog, sx), point(jog, tx), point(end, tx)], style)
    canvas.join(...point(start, sx), axis === 'TD' ? 'up' : 'left', style)
    canvas.join(...point(end, tx), axis === 'TD' ? 'down' : 'right', style)
    if (hop.isLast && hop.edge.label) labelled.push({ main: gapStart + 1 + jogs, cross: tx, text: hop.edge.label })
  }
  // A label goes where it covers no other line: centered on its own, else beside it.
  for (const { main, cross, text } of labelled) {
    const width = cellWidth(text)
    const [x, y] = point(main, cross)
    const spots = axis === 'TD' ? [x - Math.floor(width / 2), x + 2, x - 1 - width] : [x + 1]
    const isClear = (left: number) =>
      left >= 0 && Array.from({ length: width }, (_, i) => left + i).every(at => at === x || canvas.isFree(at, y))
    canvas.text(spots.find(isClear) ?? spots[0] ?? x, y, text)
  }

  const footer = graph.groups.filter(group => group.title && group.members.length > 0)
  let row = canvas.lines().length
  for (const group of footer) {
    const names = group.members.map(id => graph.nodes.get(id)?.lines.join(' ') ?? id).join(', ')
    canvas.text(0, ++row, `▸ ${group.title}: ${names}`)
  }
  return canvas
}
