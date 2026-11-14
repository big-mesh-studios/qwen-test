let counter = 0;

export function uid(prefix = "id") {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // fall through
  }
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random().toString(36).slice(2, 8)}`;
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1000) return `${value} B`;
  if (value < 1000 * 1000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} KB`;
  if (value < 1000 * 1000 * 1000) return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)} MB`;
  return `${(value / 1_000_000_000).toFixed(2)} GB`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

export function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function relativeTime(timestamp) {
  const diff = Date.now() - Number(timestamp || 0);
  if (diff < 45_000) return "now";
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `${Math.round(diff / 86_400_000)}d`;
  try {
    return new Date(timestamp).toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function makeTitle(text) {
  const clean = String(text ?? "")
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/[#>*_`~\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "New chat";
  return clean.length > 46 ? `${clean.slice(0, 45).trimEnd()}…` : clean;
}

export function previewText(text) {
  const clean = String(text ?? "")
    .replace(/```[\s\S]*?```/g, "code snippet")
    .replace(/[#>*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "No messages yet";
  return clean.length > 64 ? `${clean.slice(0, 63).trimEnd()}…` : clean;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}
