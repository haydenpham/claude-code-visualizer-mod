import { describe, expect, test } from 'claude-code/testing'

import { parseChain, drawChain } from '../hooks/flow'
import { renderMermaid } from '../hooks/mermaid/index'
import { segment } from '../hooks/segment'
import { tableWidth } from '../hooks/table'

const WIDE_TABLE = [
  '| Name | Role | Team | Location | Start date | Manager | Notes |',
  '|---|---|---|---|---|---|---|',
  '| Ada Lovelace | Engineer | Platform | London | 2021-03-01 | Grace | Works on the compiler toolchain |',
].join('\n')

describe('segment', () => {
  test('finds tables, mermaid fences and chains between prose', () => {
    const text = `Intro\n\n${WIDE_TABLE}\n\n\`\`\`mermaid\ngraph TD\n  A --> B\n\`\`\`\n\nrequest → auth → db\n\nDone.`
    expect(segment(text).map(part => part.kind)).toEqual(['markdown', 'table', 'markdown', 'mermaid', 'markdown', 'chain', 'markdown'])
  })

  test('leaves an unclosed mermaid fence (still streaming) as markdown', () => {
    expect(segment('```mermaid\ngraph TD\n  A --> B').map(part => part.kind)).toEqual(['markdown'])
  })

  test('leaves other fences alone, arrows and pipes inside them included', () => {
    const text = '```ts\nconst f = (a: number) => a -> b -> c\n| a | b |\n|---|---|\n```'
    expect(segment(text).map(part => part.kind)).toEqual(['markdown'])
  })
})

describe('tables', () => {
  test('measures the drawn width, inline markdown left out', () => {
    const [, table] = segment(`x\n${WIDE_TABLE}`)
    if (table?.kind !== 'table') throw new Error('no table')
    expect(tableWidth(table.table)).toBeGreaterThan(80)
    expect(tableWidth(table.table)).toBeLessThan(200)
    const [narrow] = segment('| **a** | `b` |\n|---|---|\n| 1 | 2 |')
    if (narrow?.kind !== 'table') throw new Error('no table')
    expect(tableWidth(narrow.table)).toBe(9)
  })
})

describe('arrow chains', () => {
  test('takes three or more steps, with an optional label', () => {
    expect(parseChain('request → auth → db')?.steps).toEqual(['request', 'auth', 'db'])
    expect(parseChain('- **Login:** user -> session -> token')).toEqual({
      label: 'Login',
      steps: ['user', 'session', 'token'],
      isListed: true,
    })
  })

  test('ignores a single arrow, arrows in code, and long prose', () => {
    expect(parseChain('a -> b')).toBeUndefined()
    expect(parseChain('use `a -> b -> c` here')).toBeUndefined()
    expect(parseChain('x->y->z')).toBeUndefined()
    expect(parseChain(`${'word '.repeat(12)}→ b → c`)).toBeUndefined()
  })

  test('wraps onto a new row when the boxes do not fit', () => {
    const lines = drawChain(['request', 'auth', 'validate', 'db', 'response'], 40)
    const text = lines.map(line => line.map(run => run.text).join(''))
    expect(text.length).toBe(7)
    expect(text.every(line => [...line].length <= 40)).toBe(true)
    expect(text[1]).toContain('│ request │──▶│ auth │')
  })
})

describe('mermaid', () => {
  const FLOW = 'flowchart TD\n  A[Start] --> B{Valid?}\n  B -->|Yes| C[Save]\n  B -->|No| D[Reject]'

  test('draws a flowchart top-down with its labels', () => {
    const lines = renderMermaid(FLOW, 78)
    expect(lines).toBeDefined()
    const art = (lines ?? []).join('\n')
    for (const word of ['Start', 'Valid?', 'Save', 'Reject', 'Yes', 'No', '▼']) expect(art).toContain(word)
  })

  test('turns a graph too wide for the room onto the other axis', () => {
    const wide = 'graph LR\n  a[alpha one] --> b[bravo two] --> c[charlie three] --> d[delta four] --> e[echo five]'
    const lines = renderMermaid(wide, 40)
    expect(lines).toBeDefined()
    expect((lines ?? []).every(line => [...line].length <= 40)).toBe(true)
    expect((lines ?? []).join('\n')).toContain('▼')
  })

  test('draws a sequence diagram with numbered messages', () => {
    const seq = 'sequenceDiagram\n  autonumber\n  participant U as User\n  U->>API: login\n  API-->>U: token'
    const art = (renderMermaid(seq, 78) ?? []).join('\n')
    expect(art).toContain('1. login')
    expect(art).toContain('2. token')
    expect(art).toContain('▶')
    expect(art).toContain('◀')
  })

  test('declines diagram types it does not draw', () => {
    expect(renderMermaid('pie\n  "a": 1\n  "b": 2', 78)).toBeUndefined()
  })
})
