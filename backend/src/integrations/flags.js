function flag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return defaultValue;
  return String(raw).trim().toLowerCase() === "true";
}

export function isUberEnabled() {
  return flag("UBER_ENABLED", true);
}

export function isDeliverooEnabled() {
  return flag("DELIVEROO_ENABLED", false);
}

export function isJustEatEnabled() {
  return flag("JUSTEAT_ENABLED", false);
}

export function isDoorDashEnabled() {
  return flag("DOORDASH_ENABLED", false);
}
