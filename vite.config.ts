import { defineConfig, type Plugin } from "vite";
import solidPlugin from "@solidjs/vite-plugin";
import { transformAsync } from "@babel/core";
import solidBabelPlugin from "@solidjs/babel-plugin";
import presetTypeScript from "@babel/preset-typescript";

// SharedArrayBuffer (threaded ONNX Runtime WASM) requires cross-origin
// isolation. GitHub Pages cannot set headers, so the folder-scoped service
// worker in public/coi-serviceworker.js adds them at runtime as well.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

/**
 * The official plugin uses a native compiler. Android/Termux has no prebuilt
 * binary and Node cannot instantiate its WASI fallback, so use the pure-JS
 * Babel compiler there instead. Everything else gets the official plugin and
 * its HMR/diagnostics support.
 */
function solidBabelFallback(): Plugin {
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
        presets: [[presetTypeScript, { allExtensions: true, isTSX: true }]],
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

export default defineConfig(({ command }) => ({
  plugins: [useBabelCompiler ? solidBabelFallback() : solidPlugin()],
  // A relative base lets the same build live at /repo/, /team/repo/ or at the
  // origin root on GitHub Pages. Workers and the service worker resolve
  // against this base at runtime.
  base: command === "build" ? "./" : "/",
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
    headers: isolationHeaders,
  },
  preview: {
    host: true,
    headers: isolationHeaders,
  },
}));
