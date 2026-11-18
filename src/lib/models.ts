/**
 * Model catalogue shared by the UI and the worker.
 *
 * Every entry points at a single GGUF file that wllama can load from a URL and
 * cache in OPFS. The Bonsai packs use the upstream `Q2_0` container (rather than
 * Prism ML's fork-only `PTQ1_0`/`PQ2_0`) so they run on stock llama.cpp.
 */
export interface ModelSpec {
  id: string;
  /** Short name shown in the header, sidebar, and picker. */
  name: string;
  repo: string;
  file: string;
  /** Exact size of the GGUF file, used for download progress and cache checks. */
  bytes: number;
  quantization: string;
  contextTokens: number;
  description: string;
  /** Optional caveat shown in the picker and settings. */
  warning?: string;
}

export const DEFAULT_MODEL_ID = "qwen35-2b";

export const MODELS: ModelSpec[] = [
  {
    id: "qwen35-2b",
    name: "Qwen3.5 2B",
    repo: "KoarAI/Qwen3.5-2B-text-only-Q4_K_M-GGUF",
    file: "qwen3.5-2b-text-only-q4_k_m.gguf",
    bytes: 1_274_388_448,
    quantization: "Q4_K_M",
    contextTokens: 4096,
    description:
      "The original app model: a balanced 2B coding assistant with Q4_K_M weights. A good default for phones and laptops.",
  },
  {
    id: "bonsai-2b",
    name: "Bonsai 2 · 2B",
    repo: "prism-ml/Ternary-Bonsai-2-2B-gguf",
    file: "Ternary-Bonsai-2-2B-Q2_0.gguf",
    bytes: 546_689_504,
    quantization: "Q2_0 ternary",
    contextTokens: 4096,
    description:
      "Prism ML's ternary 2B, built on the Qwen3.5-2B backbone. Less than half the download of Qwen and much lighter in memory, with text-only chat here.",
  },
  {
    id: "bonsai-4b",
    name: "Bonsai 2 · 4B",
    repo: "prism-ml/Ternary-Bonsai-2-4B-gguf",
    file: "Ternary-Bonsai-2-4B-Q2_0.gguf",
    bytes: 1_212_103_520,
    quantization: "Q2_0 ternary",
    contextTokens: 4096,
    description:
      "A more capable ternary Bonsai at roughly the same download size as Qwen3.5-2B. Still comfortable on a laptop browser.",
  },
  {
    id: "bonsai-9b",
    name: "Bonsai 2 · 9B",
    repo: "prism-ml/Ternary-Bonsai-2-9B-gguf",
    file: "Ternary-Bonsai-2-9B-Q2_0.gguf",
    bytes: 2_556_640_128,
    quantization: "Q2_0 ternary",
    contextTokens: 4096,
    description:
      "The largest pack that can realistically fit in the browser's 32-bit WebAssembly memory. Best tried on a desktop with plenty of free RAM.",
    warning:
      "Desktop-class: about 2.56 GB to download and a large amount of RAM while it runs. It may fail on phones or memory-constrained tabs.",
  },
];

export function getModel(id: string | null | undefined): ModelSpec {
  return MODELS.find((model) => model.id === id) ?? MODELS[0];
}

export function modelUrl(model: ModelSpec): string {
  // Resolving the file URL directly (instead of asking the HF API) lets a
  // fully cached model load without contacting Hugging Face.
  return `https://huggingface.co/${model.repo}/resolve/main/${model.file}`;
}
