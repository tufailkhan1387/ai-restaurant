/** Base URL for the Node API (no trailing slash). Empty = same origin (use Vite proxy in dev). */
export function getApiBase(): string {
  const v = import.meta.env.VITE_API_URL as string | undefined;
  if (v && v.trim().length) return v.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return "";
}

/** Turn stored paths like `/api/uploads/...` into a full URL when the API is on another origin. */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (url == null || url === "") return null;
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  const base = getApiBase();
  if (url.startsWith("/")) return base ? `${base}${url}` : url;
  return url;
}
