# claude-code-visualizer-mod

A Claude Code mod (plugin name `visualizer-mod`) that makes Claude's terminal replies easier to read:

- **Wide tables** that don't fit the terminal are redrawn as cards.
- **Mermaid diagrams** (flowcharts and sequence diagrams) are drawn as text art, with a command to open them rendered in the browser.
- **Arrow flows** like `request → auth → db` are drawn as connected boxes.

This is a community project, not an official Anthropic plugin.

## Install

```sh
git clone https://github.com/haydenpham/claude-code-visualizer-mod.git
claude --plugin-dir ./claude-code-visualizer-mod
```

## Usage

| Command | Effect |
|---|---|
| `/visualize` | Toggle redrawing on or off |
| `/visualize on` / `/visualize off` | Turn redrawing on or off |
| `/visualize open [id]` | Open the latest mermaid diagrams (or the one with `id`) in your browser |

## Development

```sh
claude plugin validate .
claude plugin test .
```

## License

[MIT](LICENSE)
