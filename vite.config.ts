import { defineConfig, type Plugin } from "vite";
import solidPlugin from "@solidjs/vite-plugin";
import { transformAsync } from "@babel/core";
import solidBabelPlugin from "@solidjs/babel-plugin";
import presetTypeScript from "@babel/preset-typescript";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const WLLAMA_WASM = fileURLToPath(
  new URL("./node_modules/@wllama/wllama/esm/wasm/wllama.wasm", import.meta.url),
);

// SharedArrayBuffer (threaded llama.cpp/wllama WASM) requires cross-origin
// isolation. GitHub Pages cannot set headers, so the folder-scoped service
// worker in public/coi-serviceworker.js adds them at runtime as well.
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

/**
 * Serve the wllama WASM runtime from our own origin in dev, and copy it into
 * the production build. Self-hosting keeps the runtime version in lockstep with
 * the npm package and avoids a third-party CDN fetch under COEP.
 */
function bundleWllamaWasm(): Plugin {
  let outDir = "dist";

  return {
    name: "bundle-wllama-wasm",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || req.url.split("?")[0] !== "/wllama.wasm") {
          next();
          return;
        }

        void (async () => {
          try {
            const info = await stat(WLLAMA_WASM);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/wasm");
            res.setHeader("Content-Length", String(info.size));
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
            if (req.method === "HEAD") {
              res.end();
            } else {
              createReadStream(WLLAMA_WASM).pipe(res);
            }
          } catch (error) {
            next(error);
          }
        })();
      });
    },
    async writeBundle() {
      await mkdir(outDir, { recursive: true });
      await copyFile(WLLAMA_WASM, resolve(outDir, "wllama.wasm"));
    },
  };
}

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
  plugins: [useBabelCompiler ? solidBabelFallback() : solidPlugin(), bundleWllamaWasm()],
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
    // wllama contains a large self-contained ESM bundle plus worker/WASM
    // strings. Pre-bundling it can rewrite the runtime URLs it builds.
    exclude: ["@wllama/wllama"],
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
