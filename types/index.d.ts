export type VisualizerEnabled = boolean

declare module 'claude-code' {
  interface PluginState {
    'visualizer-mod': { enabled: VisualizerEnabled }
  }
}
