// A few build-time packages ship no type declarations. Keep the shims narrow:
// they are only used by vite.config.ts.

declare module "@solidjs/babel-plugin" {
  const plugin: any;
  export default plugin;
}

declare module "@babel/preset-typescript" {
  const preset: any;
  export default preset;
}

declare module "@babel/core" {
  export function transformAsync(
    code: string,
    options?: Record<string, unknown>,
  ): Promise<{ code?: string | null; map?: any } | null>;
}
