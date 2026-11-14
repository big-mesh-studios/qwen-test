import { defineConfig } from "vite";
import solidPlugin from "@solidjs/vite-plugin";
import { transformAsync } from "@babel/core";
import solidBabelPlugin from "@solidjs/babel-plugin";

/**
 * The official plugin uses a native compiler. Android/Termux has no prebuilt
 * binary and Node cannot instantiate its WASI fallback, so use the pure-JS
 * Babel compiler there instead. Everything else (including normal desktop
 * browsers) gets the official plugin and its HMR/diagnostics support.
 */
function solidBabelFallback() {
  return {
    name: "solid-babel-fallback",
    enforce: "pre",
    async transform(code, id) {
      if (!/\.[jt]sx$/.test(id) || id.includes("node_modules")) return null;

      const result = await transformAsync(code, {
        filename: id,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        plugins: [
          [
            solidBabelPlugin,
            {
              moduleName: "@solidjs/web",
              generate: "dom",
              hydratable: false,
            },
          ],
        ],
      });

      return result?.code ? { code: result.code, map: result.map } : null;
    },
  };
}

const useBabelCompiler =
  process.env.SOLID_BABEL === "1" || process.platform === "android";

export default defineConfig({
  plugins: [useBabelCompiler ? solidBabelFallback() : solidPlugin()],
  worker: {
    format: "es",
  },
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    // Transformers.js ships its own ESM build and fetches ONNX Runtime WASM
    // binaries at runtime. Letting Vite pre-bundle it can break those URLs.
    exclude: ["@huggingface/transformers"],
  },
  server: {
    host: true,
  },
  preview: {
    host: true,
  },
});
