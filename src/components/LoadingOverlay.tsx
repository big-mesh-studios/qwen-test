import { For, Show } from "solid-js";
import type { ModelSpec } from "../lib/models";
import type { CacheStats, Stage } from "../lib/types";
import { formatBytes, formatDuration } from "../lib/utils";
import {
  IconAlert,
  IconCpu,
  IconDatabase,
  IconDownload,
  IconRefresh,
  IconShield,
  IconZap,
} from "./Icons";

interface LoadingOverlayProps {
  open: boolean;
  error: string | null;
  stage: Stage;
  percent: number | null;
  loaded: number;
  total: number;
  speed: number;
  cachedBytes: number;
  choosing: boolean;
  models: ModelSpec[];
  modelId: string;
  modelCache: Record<string, CacheStats>;
  onSelectModel: (id: string) => void;
  onStart: () => void;
  onChangeModel: () => void;
  onRetry: () => void;
}

export function LoadingOverlay(props: LoadingOverlayProps) {
  const selectedModel = () =>
    props.models.find((model) => model.id === props.modelId) ?? props.models[0];

  const cachedFor = (id: string) => props.modelCache[id]?.bytes ?? 0;
  const isFullyCached = (model: ModelSpec) => cachedFor(model.id) >= model.bytes;
  const isPartiallyCached = (model: ModelSpec) => {
    const bytes = cachedFor(model.id);
    return bytes > 0 && bytes < model.bytes;
  };

  const downloadLabel = () => {
    const model = selectedModel();
    const bytes = cachedFor(model.id);
    if (bytes >= model.bytes) {
      return `Cached in OPFS · ${formatBytes(model.bytes)}`;
    }
    if (bytes > 0) {
      return `${formatBytes(bytes)} of ${formatBytes(model.bytes)} cached`;
    }
    return `Download ${formatBytes(model.bytes)}`;
  };

  const stageLabel = () => {
    switch (props.stage) {
      case "cache-check":
        return "Checking the local model cache…";
      case "downloading":
        return "Downloading the GGUF model from Hugging Face";
      case "initializing":
        return "Loading the model into memory…";
      case "stopping":
        return "Stopping…";
      case "ready":
        return "Ready";
      default:
        return "Preparing the model…";
    }
  };

  const percent = () => Math.min(100, Math.max(0, props.percent || 0));
  const eta = () => {
    if (!props.speed || !props.total || props.loaded >= props.total) return null;
    return formatDuration(((props.total - props.loaded) / props.speed) * 1000);
  };

  return (
    <div
      class={["overlay", { "overlay--hidden": !props.open }]}
      aria-hidden={props.open ? "false" : "true"}
    >
      <div class="overlay-card">
        <div class="overlay-mark" aria-hidden="true">
          <span>{"{ }"}</span>
          <span class="overlay-ring" />
        </div>

        <Show
          when={props.choosing}
          fallback={
            <Show
              when={!props.error}
              fallback={
                <div class="overlay-error">
                  <span class="overlay-alert">
                    <IconAlert size={20} />
                  </span>
                  <h1>The model could not load</h1>
                  <p>{props.error}</p>
                  <div class="overlay-error-actions">
                    <button
                      type="button"
                      class="button button--primary"
                      onClick={props.onRetry}
                    >
                      <IconRefresh size={15} />
                      Try again
                    </button>
                    <button
                      type="button"
                      class="button button--ghost"
                      onClick={props.onChangeModel}
                    >
                      Choose another model
                    </button>
                  </div>
                  <p class="overlay-small">
                    If you are offline, connect once to download the model. If storage is full,
                    clear space or try a smaller model.
                  </p>
                </div>
              }
            >
              <p class="overlay-eyebrow">
                <span class="eyebrow-dot" />
                {props.cachedBytes > 0 && props.stage !== "downloading"
                  ? "Found in your local cache"
                  : "One-time setup"}
              </p>

              <h1>
                Getting <span class="gradient-text">{selectedModel().name}</span> ready
              </h1>

              <p class="overlay-stage">{stageLabel()}</p>

              <div class="progress-track">
                <div
                  class={[
                    "progress-bar",
                    {
                      "progress-bar--indeterminate":
                        props.percent == null || props.stage === "initializing",
                    },
                  ]}
                  style={{ width: `${percent() || 2}%` }}
                />
              </div>

              <div class="progress-numbers">
                <span class="progress-percent">
                  {props.percent == null ? "…" : `${Math.round(percent())}%`}
                </span>
                <span class="progress-bytes">
                  <Show when={props.total} fallback={<span>Reading cached files</span>}>
                    {formatBytes(props.loaded)} / {formatBytes(props.total)}
                  </Show>
                </span>
              </div>

              <div class="overlay-stats">
                <span>
                  <IconDownload size={13} />
                  {props.speed > 0 ? `${formatBytes(props.speed)}/s` : "Waiting for data"}
                </span>
                <span>
                  <IconZap size={13} />
                  {eta()
                    ? `${eta()} left`
                    : `${selectedModel().quantization} · ${formatBytes(selectedModel().bytes)}`}
                </span>
              </div>

              <p class="overlay-note">
                <IconDatabase size={14} />
                <span>
                  The GGUF model is cached in this browser's private file storage (OPFS). After the
                  first download, it starts from local storage and does not download again.
                </span>
              </p>
            </Show>
          }
        >
          <p class="overlay-eyebrow">
            <span class="eyebrow-dot" />
            Local inference · choose a model
          </p>

          <h1>
            Pick a <span class="gradient-text">model</span>
          </h1>

          <p class="overlay-stage">
            Download once, then it starts from this browser's cache.
          </p>

          <label class="model-picker">
            <span class="model-picker-label">Model</span>
            <select
              value={props.modelId}
              onChange={(event) => props.onSelectModel(event.currentTarget.value)}
            >
              <For each={props.models}>
                {(model) => (
                  <option value={model.id}>
                    {model.name} · {model.quantization} · {formatBytes(model.bytes)}
                    {isFullyCached(model)
                      ? " · cached"
                      : isPartiallyCached(model)
                        ? " · partial"
                        : ""}
                  </option>
                )}
              </For>
            </select>
          </label>

          <div class="model-summary">
            <div class="model-summary-top">
              <strong>{selectedModel().name}</strong>
              <span class="model-summary-badge">{selectedModel().quantization}</span>
            </div>
            <p>{selectedModel().description}</p>
            <div class="model-summary-meta">
              <span>
                <IconDownload size={13} />
                {downloadLabel()}
              </span>
              <span>
                <IconCpu size={13} />
                {selectedModel().contextTokens.toLocaleString()} ctx
              </span>
              <span>
                <IconDatabase size={13} />
                OPFS cache
              </span>
            </div>
            <Show when={selectedModel().warning}>
              <p class="model-summary-warning">
                <IconAlert size={13} />
                <span>{selectedModel().warning}</span>
              </p>
            </Show>
          </div>

          <button type="button" class="button button--primary overlay-start" onClick={props.onStart}>
            <IconDownload size={15} />
            {isFullyCached(selectedModel()) ? "Load from cache" : "Download & start"}
          </button>

          <p class="overlay-note">
            <IconDatabase size={14} />
            <span>
              Each model is cached separately in OPFS, so switching later in Settings does not
              download the same file again.
            </span>
          </p>
        </Show>

        <div class="overlay-foot">
          <IconShield size={13} />
          <span>Private by design · nothing is uploaded</span>
        </div>
      </div>
    </div>
  );
}
