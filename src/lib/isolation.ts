// GitHub Pages cannot send custom headers, so a page served there is not
// cross-origin isolated and `SharedArrayBuffer` is unavailable. The service
// worker in `public/coi-serviceworker.js` adds COOP/COEP to every response in
// the app's own folder. This module registers that worker and reloads once so
// the navigation response itself carries the isolation headers.
//
// On hosts that already send COOP/COEP (Vite dev/preview, Netlify, etc.) the
// worker is a no-op and this function returns without reloading.

const RELOAD_FLAG = "qwen-coder:coi-reload";

export async function ensureCrossOriginIsolation(): Promise<void> {
  // Relative BASE_URL keeps this scoped to the folder the app is served from,
  // including GitHub Pages project sites such as /<repo>/.
  const base = new URL(import.meta.env.BASE_URL, document.baseURI);
  const reloadKey = `${RELOAD_FLAG}:${base.pathname}`;

  if (window.crossOriginIsolated) {
    sessionStorage.removeItem(reloadKey);
    return;
  }

  if (!window.isSecureContext || !("serviceWorker" in navigator)) return;

  const workerUrl = new URL("coi-serviceworker.js", base);

  try {
    await navigator.serviceWorker.register(workerUrl, { scope: base.pathname });

    // `clients.claim()` in the worker's activate handler releases this.
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 5000);
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  } catch (error) {
    console.warn("Could not register the cross-origin isolation worker.", error);
    return;
  }

  if (window.crossOriginIsolated) return;

  // Reload only once per tab and app folder. If isolation still fails, the app
  // keeps working without SharedArrayBuffer instead of reloading forever.
  if (sessionStorage.getItem(reloadKey) === "1") return;
  sessionStorage.setItem(reloadKey, "1");
  window.location.reload();
}
