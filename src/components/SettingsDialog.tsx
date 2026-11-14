import { createSignal, onSettled, Show, untrack } from "solid-js";
import { Portal } from "@solidjs/web";
import type { Device, Settings } from "../lib/types";
import { formatBytes } from "../lib/utils";
import {
  IconAlert,
  IconClose,
  IconDatabase,
  IconSliders,
  IconTrash,
  IconZap,
} from "./Icons";

interface SettingsDialogProps {
  settings: Settings;
  cacheBytes: number;
  busy: boolean;
  onClose: () => void;
  onSave: (settings: Settings) => void;
  onClearCache: () => void;
}

export function SettingsDialog(props: SettingsDialogProps) {
  const initial = untrack(() => ({ ...props.settings }));
  const [systemPrompt, setSystemPrompt] = createSignal(initial.systemPrompt);
  const [temperature, setTemperature] = createSignal(initial.temperature);
  const [topP, setTopP] = createSignal(initial.topP);
  const [maxNewTokens, setMaxNewTokens] = createSignal(initial.maxNewTokens);
  const [repetitionPenalty, setRepetitionPenalty] = createSignal(initial.repetitionPenalty);
  const [device, setDevice] = createSignal<Device>(initial.device);

  const deviceChanged = () => device() !== props.settings.device;

  onSettled(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const save = () => {
    props.onSave({
      systemPrompt: systemPrompt().trim(),
      temperature: Number(temperature()),
      topP: Number(topP()),
      maxNewTokens: Math.round(Number(maxNewTokens())),
      repetitionPenalty: Number(repetitionPenalty()),
      device: device(),
      dtype: "q4",
    });
  };

  return (
    <Portal>
      <div class="modal-layer" onClick={props.onClose}>
        <div
          class="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header class="modal-head">
            <div class="modal-title">
              <span class="modal-icon">
                <IconSliders size={18} />
              </span>
              <div>
                <h2 id="settings-title">Settings</h2>
                <p>Tune the model and manage local storage.</p>
              </div>
            </div>
            <button type="button" class="icon-button" onClick={props.onClose} aria-label="Close settings">
              <IconClose size={18} />
            </button>
          </header>

          <div class="modal-scroll">
            <section class="settings-section">
              <div class="settings-heading">
                <h3>Instructions</h3>
                <p>The system prompt is sent with every request.</p>
              </div>
              <textarea
                class="settings-textarea"
                rows="4"
                value={systemPrompt()}
                onInput={(event) => setSystemPrompt(event.currentTarget.value)}
                placeholder="You are a helpful coding assistant…"
              />
            </section>

            <section class="settings-section">
              <div class="settings-heading">
                <h3>Generation</h3>
                <p>Lower temperature is more focused; higher is more creative.</p>
              </div>

              <label class="field">
                <span class="field-top">
                  <span>Temperature</span>
                  <span class="field-value">{temperature().toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={temperature()}
                  onInput={(event) => setTemperature(Number(event.currentTarget.value))}
                />
                <span class="field-hint">0 = deterministic greedy decoding</span>
              </label>

              <label class="field">
                <span class="field-top">
                  <span>Top-p</span>
                  <span class="field-value">{topP().toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={topP()}
                  onInput={(event) => setTopP(Number(event.currentTarget.value))}
                />
              </label>

              <label class="field">
                <span class="field-top">
                  <span>Max new tokens</span>
                  <span class="field-value">{maxNewTokens()}</span>
                </span>
                <input
                  type="range"
                  min="64"
                  max="2048"
                  step="64"
                  value={maxNewTokens()}
                  onInput={(event) => setMaxNewTokens(Number(event.currentTarget.value))}
                />
              </label>

              <label class="field">
                <span class="field-top">
                  <span>Repetition penalty</span>
                  <span class="field-value">{repetitionPenalty().toFixed(2)}</span>
                </span>
                <input
                  type="range"
                  min="1"
                  max="1.5"
                  step="0.01"
                  value={repetitionPenalty()}
                  onInput={(event) => setRepetitionPenalty(Number(event.currentTarget.value))}
                />
              </label>
            </section>

            <section class="settings-section">
              <div class="settings-heading">
                <h3>Runtime</h3>
                <p>WebGPU is faster when available. WASM works everywhere.</p>
              </div>

              <label class="field field--select">
                <span class="field-top">
                  <span>Compute backend</span>
                </span>
                <select
                  value={device()}
                  disabled={props.busy}
                  onChange={(event) => setDevice(event.currentTarget.value as Device)}
                >
                  <option value="wasm">WASM · CPU (recommended)</option>
                  <option value="webgpu">WebGPU · GPU (experimental)</option>
                </select>
                <span class="field-hint">
                  {props.busy
                    ? "Stop the current response before switching the backend."
                    : "Changing the backend reloads the model. The q4 weights are reused from cache."}
                </span>
              </label>

              <div class="settings-kv">
                <span>
                  <IconZap size={14} />
                  Precision
                </span>
                <strong>Q4 · 4-bit quantized</strong>
              </div>

              <div class="settings-kv">
                <span>
                  <IconDatabase size={14} />
                  Model files in IndexedDB
                </span>
                <strong>{formatBytes(props.cacheBytes)}</strong>
              </div>
            </section>
          </div>

          <Show when={deviceChanged()}>
            <div class="modal-warning">
              <IconAlert size={15} />
              <span>
                Saving will reload Qwen on the {device() === "webgpu" ? "WebGPU" : "WASM"} backend.
              </span>
            </div>
          </Show>

          <footer class="modal-foot">
            <button type="button" class="button button--danger" onClick={props.onClearCache}>
              <IconTrash size={14} />
              Clear model cache
            </button>
            <div class="modal-foot-right">
              <button type="button" class="button button--ghost" onClick={props.onClose}>
                Cancel
              </button>
              <button type="button" class="button button--primary" onClick={save}>
                Save changes
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
