// A mermaid source drawn as text no wider than the room, or undefined where it cannot be.

import { layoutGraph } from './layout'
import { parseFlowchart, parseStateDiagram, type Direction } from './graph'
import { layoutSequence } from './sequence'

const MAX_NODES = 60

const OTHER_AXIS: Record<Direction, Direction> = { TD: 'LR', LR: 'TD', BT: 'RL', RL: 'BT' }

export function renderMermaid(source: string, width: number): string[] | undefined {
  const body = source.replace(/^\s*---[\s\S]*?---\s*/, '').trim()
  try {
    if (/^sequenceDiagram\b/.test(body)) {
      const canvas = layoutSequence(body)
      return canvas && canvas.width <= width ? canvas.lines() : undefined
    }
    const graph = parseFlowchart(body) ?? parseStateDiagram(body)
    if (!graph || graph.nodes.size === 0 || graph.nodes.size > MAX_NODES) return undefined
    for (const dir of [graph.direction, OTHER_AXIS[graph.direction]]) {
      const canvas = layoutGraph(graph, dir)
      if (canvas.width <= width) return canvas.lines()
    }
    return undefined
  } catch {
    return undefined
  }
}
