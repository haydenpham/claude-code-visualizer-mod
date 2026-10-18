// A page that renders mermaid diagrams with mermaid itself, for the browser.

import { segment } from './segment'
import { shortId } from './width'

export type Diagram = { id: string; source: string }

/** The mermaid fences of a text, each with its short id. */
export function diagramsIn(text: string): Diagram[] {
  return segment(text).flatMap(part =>
    part.kind === 'mermaid' ? [{ id: shortId(part.source.trim()), source: part.source }] : [],
  )
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function page(diagrams: readonly Diagram[]): string {
  const cards = diagrams
    .map(
      d => `<section>
  <header>mermaid · ${d.id}</header>
  <pre class="mermaid">${escape(d.source)}</pre>
  <details><summary>Source</summary><pre class="src">${escape(d.source)}</pre></details>
</section>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visualizer diagrams</title>
<style>
  :root { color-scheme: light dark; --bg: #f7f7f5; --card: #fff; --ink: #1f1f1f; --dim: #6b6b6b; --line: #e3e3df; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1b1b1a; --card: #252524; --ink: #ececea; --dim: #9a9a96; --line: #3a3a38; } }
  body { margin: 0; padding: 24px 16px; background: var(--bg); color: var(--ink); font: 14px/1.5 -apple-system, system-ui, sans-serif; }
  section { max-width: 1100px; margin: 0 auto 24px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px; overflow-x: auto; }
  header { color: var(--dim); font-size: 12px; margin-bottom: 8px; }
  pre.mermaid { display: flex; justify-content: center; margin: 0; }
  details { margin-top: 12px; color: var(--dim); }
  pre.src { font: 12px/1.4 ui-monospace, Menlo, monospace; white-space: pre-wrap; color: var(--ink); }
</style>
</head>
<body>
${cards}
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<script>
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  mermaid.initialize({ startOnLoad: true, theme: dark ? 'dark' : 'default', securityLevel: 'strict' })
</script>
</body>
</html>
`
}
