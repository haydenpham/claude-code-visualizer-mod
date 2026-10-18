import type { On } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'

const REPLY = [
  'Here is the flow:',
  '',
  '```mermaid',
  'graph TD',
  '  A[Start] --> B[End]',
  '```',
  '',
  'request → auth → db',
].join('\n')

const message = (text: string) => ({ text, isFirstOfReply: true })

/** Runs `/lens <args>` as the person typing it does. */
const lens = ($: Engine, args: string) =>
  $.command.run({ command: 'lens', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

/** Stands in for the engine's own drawing of a reply. */
const engine = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine's own</Text>
  })

test('redraws mermaid and chains on the terminal, leaves desktop alone', async ($, on) => {
  mock.store(on)
  engine(on)
  const terminal = await $.ui.mount({
    plugin: 'visualizer-mod',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: message(REPLY),
    viewport: { columns: 80, rows: 40 },
  })
  expect(await terminal.find({ type: 'Markdown', text: /Here is the flow/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /\/lens open [0-9a-f]{6}/ })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /──▶/ })).toBeDefined()
  await terminal.unmount()

  const desktop = await $.ui.mount({
    plugin: 'visualizer-mod',
    surface: 'desktop',
    component: 'AssistantMessage',
    props: message(REPLY),
    viewport: { columns: 80, rows: 40 },
  })
  expect(await desktop.find({ type: 'Text', text: /\/lens open/ })).toBeUndefined()
  await desktop.unmount()
})

test('leaves a plain reply to the engine', async ($, on) => {
  mock.store(on)
  engine(on)
  const ui = await $.ui.mount({
    plugin: 'visualizer-mod',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: message('Just text, a table that fits:\n\n| a | b |\n|---|---|\n| 1 | 2 |'),
    viewport: { columns: 80, rows: 40 },
  })
  expect(await ui.find({ type: 'Text', text: "engine's own" })).toBeDefined()
  await ui.unmount()
})

test('/lens off draws replies as written, /lens on again', async ($, on) => {
  mock.store(on)
  engine(on)
  expect((await lens($, 'off')).text).toContain('off')
  const ui = await $.ui.mount({
    plugin: 'visualizer-mod',
    surface: 'terminal',
    component: 'AssistantMessage',
    props: message(REPLY),
    viewport: { columns: 80, rows: 40 },
  })
  expect(await ui.find({ type: 'Text', text: /\/lens open/ })).toBeUndefined()
  expect((await lens($, 'on')).text).toContain('on')
  expect(await ui.find({ type: 'Text', text: /\/lens open/ })).toBeDefined()
  await ui.unmount()
})

test('/lens open writes a page for the latest diagrams and opens it', async ($, on) => {
  mock.store(on)
  engine(on)
  const written: { path: string; text: string }[] = []
  const ran: (readonly string[])[] = []
  on('session.messages', () => ({
    value: [
      { role: 'user', text: 'draw it', toolUses: [] },
      { role: 'assistant', text: REPLY, toolUses: [] },
    ],
  }))
  on('fs.write', (_$, e) => {
    written.push(e)
    return { value: undefined }
  })
  on('process.run', (_$, e) => {
    ran.push(e.argv)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  const result = await lens($, 'open')
  expect(result.text).toContain('Opened diagram')
  expect(written).toHaveLength(1)
  expect(written[0]?.path).toMatch(/^\/tmp\/visualizer-mod\/[0-9a-f]{6}\.html$/)
  expect(written[0]?.text).toContain('A[Start] --&gt; B[End]')
  expect(ran[0]?.[0]).toBe('open')

  expect((await lens($, 'open ffffff')).text).toContain('No mermaid diagram')
})
