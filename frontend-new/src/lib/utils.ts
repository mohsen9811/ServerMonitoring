export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function getApiBaseUrl() {
  return "/api";
}

export function getErrorMessage(error: unknown, fallback = "خطای ناشناخته رخ داد."): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const err = error as { message?: string };
    if (err.message) return err.message;
  }
  return fallback;
}

export function formatNumber(num: number, decimals = 0): string {
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

export function formatUptime(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${formatNumber(days)} روز`);
  if (hours > 0) parts.push(`${formatNumber(hours)} ساعت`);
  if (minutes > 0) parts.push(`${formatNumber(minutes)} دقیقه`);
  return parts.join(" و ") || "کمتر از یک دقیقه";
}

export function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatRelativeTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return "—";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return "چند لحظه پیش";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${formatNumber(diffMin)} دقیقه پیش`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${formatNumber(diffHour)} ساعت پیش`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${formatNumber(diffDay)} روز پیش`;
  return formatDate(date);
}

export function truncate(str: string, max = 120): string {
  if (!str) return "";
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), ms);
  };
}

export function getStatusVariant(status: string): "success" | "warning" | "danger" | "muted" {
  const s = String(status || "").toLowerCase();
  if (["running", "succeeded", "healthy", "connected", "synchronized", "synchronizing", "idle", "online", "started"].includes(s))
    return "success";
  if (["failed", "critical", "notfound", "not found", "disabled", "offline", "suspect", "emergency", "not synced", "stopped"].includes(s))
    return "danger";
  if (["warning", "retry", "cancelled", "unknown", "not tested", "restoring", "recovering", "recovery pending", "paused"].includes(s))
    return "warning";
  return "muted";
}

export function getStatusBadgeClass(status: string): string {
  return `badge-${getStatusVariant(status)}`;
}