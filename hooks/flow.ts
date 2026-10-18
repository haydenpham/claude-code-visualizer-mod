// Arrow chains (`request → auth → db`): finding them, and drawing them as boxes.

import { cellWidth, plain } from './width'

export type Chain = { label?: string; steps: string[]; isListed: boolean }

/** A run of one look: a box's frame, its step, or the arrow between boxes. */
export type Run = { text: string; tone: 'frame' | 'step' | 'arrow' }
export type ArtLine = Run[]

const ARROW = /\s+(?:-->|->|=>)\s+|\s*(?:→|⇒|⟶|➜|➔|⟹)\s*/
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/
const MAX_STEP = 40

/** The chain a line is, or undefined: three or more short steps joined by arrows. */
export function parseChain(line: string): Chain | undefined {
  if (/^\s*(#|>|\|)/.test(line)) return undefined
  const isListed = LIST_MARKER.test(line)
  let body = line.replace(LIST_MARKER, '').trim()

  // Arrows inside inline code are not the chain's.
  const spans: string[] = []
  body = body.replace(/`[^`]*`/g, span => `\u0000${spans.push(span) - 1}\u0000`)
  const restore = (text: string) => text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => spans[Number(i)] ?? '')

  let label: string | undefined
  const labelled = /^(\*\*[^*]{1,40}?:?\*\*:?|[^:→>]{1,40}:)\s+(.*)$/.exec(body)
  if (labelled && ARROW.test(labelled[2] ?? '') && !ARROW.test(labelled[1] ?? '')) {
    label = plain(restore(labelled[1] ?? '')).replace(/:$/, '')
    body = labelled[2] ?? ''
  }

  const steps = body.split(ARROW).map(step => plain(restore(step)).replace(/[.;]$/, ''))
  if (steps.length < 3) return undefined
  if (steps.some(step => step.length === 0 || cellWidth(step) > MAX_STEP)) return undefined
  return { label, steps, isListed }
}

function boxWidth(step: string): number {
  return cellWidth(step) + 4
}

/** The three lines of a row of boxes, each line opened by its prefix. */
function row(steps: readonly string[], prefix: readonly [Run[], Run[], Run[]], trailing: boolean) {
  const [top, mid, bottom]: [Run[], Run[], Run[]] = [[...prefix[0]], [...prefix[1]], [...prefix[2]]]
  steps.forEach((step, i) => {
    const inner = '─'.repeat(cellWidth(step) + 2)
    if (i > 0) {
      top.push({ text: '   ', tone: 'frame' })
      mid.push({ text: '──▶', tone: 'arrow' })
      bottom.push({ text: '   ', tone: 'frame' })
    }
    top.push({ text: `╭${inner}╮`, tone: 'frame' })
    mid.push({ text: '│ ', tone: 'frame' }, { text: step, tone: 'step' }, { text: ' │', tone: 'frame' })
    bottom.push({ text: `╰${inner}╯`, tone: 'frame' })
  })
  if (trailing) {
    mid.push({ text: '──╮', tone: 'arrow' })
    bottom.push({ text: '  │', tone: 'arrow' })
  }
  return [top, mid, bottom] as ArtLine[]
}

function lineWidth(line: ArtLine): number {
  return line.reduce((sum, run) => sum + cellWidth(run.text), 0)
}

/** The chain drawn in rows of boxes no wider than `width`, wrapping onto new rows. */
export function drawChain(steps: readonly string[], width: number): ArtLine[] {
  const first: [Run[], Run[], Run[]] = [[], [], []]
  const after: [Run[], Run[], Run[]] = [
    [{ text: '  │  ', tone: 'arrow' }],
    [{ text: '  ╰─▶', tone: 'arrow' }],
    [{ text: '     ', tone: 'frame' }],
  ]
  const lines: ArtLine[] = []
  let at = 0
  while (at < steps.length) {
    const prefix = at === 0 ? first : after
    let used = at === 0 ? 0 : 5
    let end = at
    while (end < steps.length) {
      const isLast = end === steps.length - 1
      const next = used + (end > at ? 3 : 0) + boxWidth(steps[end] ?? '') + (isLast ? 0 : 3)
      if (next > width && end > at) break
      used = next - (isLast ? 0 : 3)
      end++
    }
    const trailing = end < steps.length
    const drawn = row(steps.slice(at, end), prefix, trailing)
    lines.push(...drawn)
    if (trailing) {
      const turn = lineWidth(drawn[1] ?? []) - 1
      lines.push([{ text: `  ╭${'─'.repeat(Math.max(0, turn - 3))}╯`, tone: 'arrow' }])
    }
    at = end
  }
  return lines
}
