/** Turn stored paths like `/api/uploads/...` into a public HTTPS URL for the live frontend. */
export function absoluteMediaUrl(url) {
  if (url == null || url === "") return url;
  const value = String(url);
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) return value;
  const base = String(process.env.PUBLIC_API_URL || "").trim().replace(/\/$/, "");
  if (!base) return value;
  if (value.startsWith("/")) return `${base}${value}`;
  return value;
}

export function withAbsoluteMedia(row, keys = ["image_url", "logo_url", "cover_image_url"]) {
  if (!row || typeof row !== "object") return row;
  const out = { ...row };
  for (const key of keys) {
    if (out[key]) out[key] = absoluteMediaUrl(out[key]);
  }
  return out;
}
