import { Show } from "solid-js";
import type { Stage } from "../lib/types";
import { formatBytes, formatDuration } from "../lib/utils";
import {
  IconAlert,
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
  onRetry: () => void;
}

export function LoadingOverlay(props: LoadingOverlayProps) {
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
        return "Preparing Qwen…";
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
          when={!props.error}
          fallback={
            <div class="overlay-error">
              <span class="overlay-alert">
                <IconAlert size={20} />
              </span>
              <h1>The model could not load</h1>
              <p>{props.error}</p>
              <div class="overlay-error-actions">
                <button type="button" class="button button--primary" onClick={props.onRetry}>
                  <IconRefresh size={15} />
                  Try again
                </button>
              </div>
              <p class="overlay-small">
                If you are offline, connect once to download the model. If storage is full, clear
                space or use a smaller browser profile.
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
            Getting <span class="gradient-text">Qwen</span> ready
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
              {eta() ? `${eta()} left` : "Q4_K_M · 398 MB"}
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

        <div class="overlay-foot">
          <IconShield size={13} />
          <span>Private by design · nothing is uploaded</span>
        </div>
      </div>
    </div>
  );
}
