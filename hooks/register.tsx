import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { diagramsIn, page } from './browser'
import { drawChain, type ArtLine } from './flow'
import { renderMermaid } from './mermaid/index'
import { segment, type Segment } from './segment'
import { tableWidth, type Table } from './table'
import { cellWidth, shortId } from './width'

const enabled = atom({ plugin: 'visualizer-mod', key: 'enabled' } as const, true)

/** Columns the reply's own gutter (`⏺ `) takes from the viewport. */
const GUTTER = 3
const OUT_DIR = '/tmp/visualizer-mod'

type Drawn =
  | { kind: 'markdown'; text: string }
  | { kind: 'cards'; table: Table }
  | { kind: 'diagram'; id: string; lines?: string[]; source: string }
  | { kind: 'chain'; label?: string; isListed: boolean; lines: ArtLine[] }

/** What visualize draws for one part; markdown where the engine's own drawing is fine. */
function draw(part: Segment, width: number): Drawn {
  switch (part.kind) {
    case 'markdown':
      return { kind: 'markdown', text: part.text }
    case 'table':
      return tableWidth(part.table) <= width ? { kind: 'markdown', text: part.text } : { kind: 'cards', table: part.table }
    case 'mermaid': {
      const source = part.source.trim()
      return { kind: 'diagram', id: shortId(source), lines: renderMermaid(source, width), source }
    }
    case 'chain': {
      const indent = part.chain.isListed ? 2 : 0
      return { kind: 'chain', label: part.chain.label, isListed: part.chain.isListed, lines: drawChain(part.chain.steps, width - indent) }
    }
  }
}

/** Neighbouring markdown parts joined, blank edges trimmed, empty ones dropped. */
function merge(parts: Drawn[]): Drawn[] {
  const out: Drawn[] = []
  for (const part of parts) {
    const last = out[out.length - 1]
    if (part.kind === 'markdown' && last?.kind === 'markdown') last.text += `\n${part.text}`
    else out.push({ ...part })
  }
  return out
    .map(part => (part.kind === 'markdown' ? { ...part, text: part.text.replace(/^\s*\n|\n\s*$/g, '').trimEnd() } : part))
    .filter(part => part.kind !== 'markdown' || part.text.trim() !== '')
}

async function openDiagrams($: EngineInterface, id: string | undefined): Promise<string> {
  const replies = (await $.session.messages()).filter(message => message.role === 'assistant')
  let diagrams = id
    ? replies.flatMap(message => diagramsIn(message.text)).filter(d => d.id === id)
    : [...replies].reverse().map(message => diagramsIn(message.text)).find(found => found.length > 0) ?? []
  diagrams = diagrams.filter((d, i) => diagrams.findIndex(other => other.id === d.id) === i)
  if (diagrams.length === 0) return id ? `No mermaid diagram with id ${id} in this session.` : 'No mermaid diagrams in this session yet.'

  const path = `${OUT_DIR}/${id ?? diagrams.map(d => d.id).join('-').slice(0, 48)}.html`
  await $.fs.write(path, page(diagrams))
  const opened = await $.process.run(['open', path]).catch(() => undefined)
  const what = diagrams.length === 1 ? `diagram ${diagrams[0]?.id}` : `${diagrams.length} diagrams`
  return opened?.exitCode === 0 ? `Opened ${what} in your browser.` : `Wrote ${what} to ${path}; open it in a browser.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const stored = await $.store.get('enabled')
    if (typeof stored === 'boolean') await update($, enabled, () => stored)
    await $.command.register({
      name: 'visualize',
      description: 'Toggle readable tables/diagrams, or open a mermaid diagram in the browser',
      argumentHint: '[on|off|open [id]]',
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: 'visualize' }, async ($, e) => {
    const [verb = '', arg] = e.args.trim().split(/\s+/)
    if (verb === 'open') return { text: await openDiagrams($, arg) }

    const isOn = verb === 'on' ? true : verb === 'off' ? false : !(await read($, enabled))
    await update($, enabled, () => isOn)
    await $.store.set('enabled', isOn)

    return { text: isOn ? 'visualize is on: wide tables, mermaid and arrow flows are redrawn.' : 'visualize is off: replies draw as written.' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || !(await read($, enabled))) return next(e)
    const width = Math.max(20, (e.viewport?.columns ?? 80) - GUTTER)
    const parts = merge(segment(e.props.text).map(part => draw(part, width)))
    if (parts.every(part => part.kind === 'markdown')) return next(e)

    const { Box, Text, Markdown, Code } = $.ui.resolve(e)

    const cards = (table: Table) => {
      const labelWidth = Math.min(24, Math.max(...table.header.slice(1).map(cellWidth)))
      return (
        <Box flexDirection="column" gap={1}>
          <Text dimColor>
            table · {table.rows.length} rows × {table.header.length} columns, shown as cards to fit {width} columns
          </Text>
          {table.rows.map((row, i) => (
            <Box flexDirection="column">
              <Text>
                <Text dimColor>{table.header[0]} </Text>
                <Text bold color="claude">
                  {row[0] || `#${i + 1}`}
                </Text>
              </Text>
              {table.header.slice(1).map((head, c) => (
                <Box flexDirection="row" paddingLeft={2}>
                  <Box width={labelWidth + 2} flexShrink={0}>
                    <Text color="suggestion" wrap="truncate-end">
                      {head}
                    </Text>
                  </Box>
                  <Text>{row[c + 1] || '—'}</Text>
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )
    }

    const chain = (part: Extract<Drawn, { kind: 'chain' }>) => (
      <Box flexDirection="column" paddingLeft={part.isListed ? 2 : 0}>
        {part.label && <Text bold>{part.label}</Text>}
        {part.lines.map(line => (
          <Text wrap="truncate-end">
            {line.map(run =>
              run.tone === 'arrow' ? (
                <Text color="claude">{run.text}</Text>
              ) : run.tone === 'frame' ? (
                <Text dimColor>{run.text}</Text>
              ) : (
                <Text bold>{run.text}</Text>
              ),
            )}
          </Text>
        ))}
      </Box>
    )

    const diagram = (part: Extract<Drawn, { kind: 'diagram' }>) => (
      <Box flexDirection="column">
        {part.lines ? (
          <Text wrap="truncate-end">{part.lines.join('\n')}</Text>
        ) : (
          <Code source={part.source} language="mermaid" />
        )}
        <Text dimColor>
          mermaid{part.lines ? '' : ' (too large to draw here)'} · /visualize open {part.id} to view it rendered
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        {parts.map(part =>
          part.kind === 'markdown' ? <Markdown text={part.text} />
          : part.kind === 'cards' ? cards(part.table)
          : part.kind === 'chain' ? chain(part)
          : diagram(part),
        )}
      </Box>
    )
  })
}
