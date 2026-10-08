/**
 * Safe structured logger. Never logs secrets, tokens, passwords, or auth headers.
 */

function isSensitiveKey(key) {
  const k = String(key);
  if (!k) return false;
  // Keep tokenUrl / apiBase visible — they are not secrets.
  if (/url$/i.test(k) || /^(api|auth)Base$/i.test(k)) return false;
  return /secret|password|authorization|cookie|api[_-]?key|access_token|refresh_token|(^|_)token$|jwt|^bearer$/i.test(
    k,
  );
}

function redactString(value) {
  if (typeof value !== "string") return value;
  if (value.length > 20 && /^(KA\.|eyJ|Bearer\s+)/i.test(value)) return "[redacted]";
  return value;
}

export function redactSecrets(value, key = "") {
  if (value == null) return value;
  if (isSensitiveKey(key)) return "[redacted]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactSecrets(v, k);
    }
    return out;
  }
  return value;
}

function write(level, component, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...(meta != null ? { meta: redactSecrets(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createLogger(component) {
  return {
    info: (message, meta) => write("info", component, message, meta),
    warn: (message, meta) => write("warn", component, message, meta),
    error: (message, meta) => write("error", component, message, meta),
  };
}

export const log = createLogger("app");
