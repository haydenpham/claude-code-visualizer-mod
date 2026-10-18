// A grid of character cells: boxes, text, and lines that join where they meet.

export type LineStyle = 'solid' | 'dotted' | 'thick'

const N = 1
const E = 2
const S = 4
const W = 8

const JOINS: Record<number, string> = {
  [N]: '│', [S]: '│', [N | S]: '│',
  [E]: '─', [W]: '─', [E | W]: '─',
  [E | S]: '┌', [W | S]: '┐', [N | E]: '└', [N | W]: '┘',
  [N | E | S]: '├', [N | W | S]: '┤', [E | W | S]: '┬', [E | W | N]: '┴',
  [N | E | S | W]: '┼',
}

const STRAIGHT: Record<LineStyle, { across: string; down: string }> = {
  solid: { across: '─', down: '│' },
  dotted: { across: '┄', down: '┆' },
  thick: { across: '━', down: '┃' },
}

export type BoxCorners = 'square' | 'round' | 'decision'

const CORNERS: Record<BoxCorners, [string, string, string, string]> = {
  square: ['┌', '┐', '└', '┘'],
  round: ['╭', '╮', '╰', '╯'],
  decision: ['◇', '◇', '◇', '◇'],
}

export class Canvas {
  private chars: (string | undefined)[][] = []
  private masks: number[][] = []
  private styles: (LineStyle | undefined)[][] = []

  private grow(x: number, y: number) {
    while (this.chars.length <= y) {
      this.chars.push([])
      this.masks.push([])
      this.styles.push([])
    }
    const chars = this.chars[y]!
    while (chars.length <= x) {
      chars.push(undefined)
      this.masks[y]!.push(0)
      this.styles[y]!.push(undefined)
    }
  }

  put(x: number, y: number, ch: string) {
    if (x < 0 || y < 0) return
    this.grow(x, y)
    this.chars[y]![x] = ch
  }

  get(x: number, y: number): string | undefined {
    return this.chars[y]?.[x]
  }

  isFree(x: number, y: number): boolean {
    return this.get(x, y) === undefined && (this.masks[y]?.[x] ?? 0) === 0
  }

  text(x: number, y: number, text: string) {
    let at = x
    for (const ch of text) this.put(at++, y, ch)
  }

  box(x: number, y: number, w: number, h: number, corners: BoxCorners, lines: readonly string[]) {
    const [tl, tr, bl, br] = CORNERS[corners]
    this.put(x, y, tl)
    this.put(x + w - 1, y, tr)
    this.put(x, y + h - 1, bl)
    this.put(x + w - 1, y + h - 1, br)
    for (let i = 1; i < w - 1; i++) {
      this.put(x + i, y, '─')
      this.put(x + i, y + h - 1, '─')
    }
    for (let j = 1; j < h - 1; j++) {
      this.put(x, y + j, '│')
      this.put(x + w - 1, y + j, '│')
      for (let i = 1; i < w - 1; i++) this.put(x + i, y + j, ' ')
    }
    lines.forEach((line, j) => {
      const pad = Math.floor((w - 2 - [...line].length) / 2)
      this.text(x + 1 + pad, y + 1 + j, line)
    })
  }

  private mark(x: number, y: number, bits: number, style: LineStyle) {
    if (x < 0 || y < 0) return
    this.grow(x, y)
    this.masks[y]![x]! |= bits
    if (style !== 'solid' || this.styles[y]![x] === undefined) this.styles[y]![x] = style
  }

  /** Opens a line cell toward a neighbour (an arrowhead, a box's border), so it reaches it. */
  join(x: number, y: number, toward: 'up' | 'down' | 'left' | 'right', style: LineStyle = 'solid') {
    this.mark(x, y, { up: N, down: S, left: W, right: E }[toward], style)
  }

  /** A straight line between two cells on one row or one column, ends included. */
  line(x1: number, y1: number, x2: number, y2: number, style: LineStyle = 'solid') {
    if (y1 === y2) {
      const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1]
      for (let x = a; x <= b; x++) this.mark(x, y1, (x > a ? W : 0) | (x < b ? E : 0) || E | W, style)
    } else {
      const [a, b] = y1 < y2 ? [y1, y2] : [y2, y1]
      for (let y = a; y <= b; y++) this.mark(x1, y, (y > a ? N : 0) | (y < b ? S : 0) || N | S, style)
    }
  }

  /** A path through cells, each step straight; joins form where it turns. */
  path(points: readonly (readonly [number, number])[], style: LineStyle = 'solid') {
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i - 1]!
      const [x2, y2] = points[i]!
      if (x1 === x2 && y1 === y2) continue
      if (x1 !== x2 && y1 !== y2) {
        this.line(x1, y1, x2, y1, style)
        this.line(x2, y1, x2, y2, style)
      } else {
        this.line(x1, y1, x2, y2, style)
      }
    }
  }

  get width(): number {
    return this.lines().reduce((max, line) => Math.max(max, [...line].length), 0)
  }

  lines(): string[] {
    return this.chars.map((row, y) => {
      let line = ''
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]
        const mask = this.masks[y]?.[x] ?? 0
        if (ch !== undefined) line += ch
        else if (mask === 0) line += ' '
        else {
          const style = this.styles[y]?.[x] ?? 'solid'
          if (mask === (E | W) || mask === E || mask === W) line += STRAIGHT[style].across
          else if (mask === (N | S) || mask === N || mask === S) line += STRAIGHT[style].down
          else line += JOINS[mask] ?? '┼'
        }
      }
      return line.replace(/\s+$/, '')
    })
  }
}
