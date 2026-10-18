export type LensEnabled = boolean

declare module 'claude-code' {
  interface PluginState {
    'visualizer-mod': { enabled: LensEnabled }
  }
}
