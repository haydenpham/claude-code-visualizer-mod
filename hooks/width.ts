// Terminal cell widths, and markdown inline syntax reduced to what is shown.

const WIDE: readonly [number, number][] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
]

function charWidth(cp: number): number {
  if ((cp >= 0x300 && cp <= 0x36f) || (cp >= 0x200b && cp <= 0x200f) || cp === 0xfe0f) return 0
  for (const [lo, hi] of WIDE) if (cp >= lo && cp <= hi) return 2
  return 1
}

export function cellWidth(text: string): number {
  let width = 0
  for (const ch of text) width += charWidth(ch.codePointAt(0) ?? 0)
  return width
}

/** Markdown inline syntax dropped: emphasis marks, code ticks, link targets. */
export function plain(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/(^|[^\w*])\*([^*\s][^*]*)\*/g, '$1$2')
    .replace(/<br\s*\/?>/gi, ' ')
    .trim()
}

/** Splits text into lines of at most `width` cells, at spaces where it can. */
export function wrap(text: string, width: number): string[] {
  const room = Math.max(1, width)
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const joined = line ? `${line} ${word}` : word
    if (cellWidth(joined) <= room) {
      line = joined
      continue
    }
    if (line) lines.push(line)
    line = word
    while (cellWidth(line) > room) {
      lines.push([...line].slice(0, room).join(''))
      line = [...line].slice(room).join('')
    }
  }
  if (line || lines.length === 0) lines.push(line)
  return lines
}

/** 32-bit FNV-1a of the text, as six hex digits: a diagram's short id. */
export function shortId(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0').slice(0, 6)
}
