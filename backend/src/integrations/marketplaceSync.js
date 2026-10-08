/**
 * One-shot sync across enabled marketplace platforms (all linked stores / apps).
 * Does not invent orders; skips platforms that are disabled or not configured.
 */
import { NotConfiguredError } from "./errors.js";
import {
  isDeliverooEnabled,
  isDoorDashEnabled,
  isJustEatEnabled,
  isUberEnabled,
} from "./flags.js";
import { backfillUberOrders } from "../uber/backfill.js";
import * as deliveroo from "./deliveroo/adapter.js";
import * as doordash from "./doordash/adapter.js";
import * as justeat from "./justeat/adapter.js";
import { createLogger } from "../lib/safeLogger.js";

const log = createLogger("marketplaceSync");

async function runGeneratorBackfill(adapter, label) {
  if (typeof adapter.isEnabled === "function" && !adapter.isEnabled()) {
    return { source: label, skipped: true, reason: "disabled" };
  }
  if (typeof adapter.isConfigured === "function" && !adapter.isConfigured()) {
    return { source: label, skipped: true, reason: "not_configured" };
  }
  try {
    let last = null;
    for await (const page of adapter.backfill()) {
      last = page;
    }
    return { source: label, skipped: false, ok: true, result: last };
  } catch (e) {
    if (e instanceof NotConfiguredError) {
      return { source: label, skipped: true, reason: "webhook_only", message: e.message };
    }
    return { source: label, skipped: false, ok: false, error: e.message || String(e) };
  }
}

async function runUber(opts = {}) {
  if (!isUberEnabled()) {
    return { source: "uber", skipped: true, reason: "disabled" };
  }
  if (!process.env.UBER_CLIENT_ID?.trim() || !process.env.UBER_CLIENT_SECRET?.trim()) {
    return { source: "uber", skipped: true, reason: "not_configured" };
  }
  try {
    const result = await backfillUberOrders(opts);
    return {
      source: "uber",
      skipped: false,
      ok: true,
      total: result.total ?? 0,
      storeCount: result.storeCount ?? 0,
      noStores: Boolean(result.noStores),
      message: result.message || null,
    };
  } catch (e) {
    return { source: "uber", skipped: false, ok: false, error: e.message || String(e) };
  }
}

/**
 * Sync Uber + DoorDash + Deliveroo (+ Just Eat if enabled) in one call.
 * @returns {{ ok: boolean, total: number, platforms: object[] }}
 */
export async function syncAllMarketplaces(opts = {}) {
  log.info("Starting combined marketplace sync");

  const platforms = await Promise.all([
    runUber(opts),
    isDoorDashEnabled()
      ? runGeneratorBackfill(doordash, "doordash")
      : Promise.resolve({ source: "doordash", skipped: true, reason: "disabled" }),
    isDeliverooEnabled()
      ? runGeneratorBackfill(deliveroo, "deliveroo")
      : Promise.resolve({ source: "deliveroo", skipped: true, reason: "disabled" }),
    isJustEatEnabled()
      ? runGeneratorBackfill(justeat, "justeat")
      : Promise.resolve({ source: "justeat", skipped: true, reason: "disabled" }),
  ]);

  const total = platforms.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
  const hardFail = platforms.some((p) => p.ok === false && !p.skipped);

  return {
    ok: !hardFail,
    total,
    platforms,
  };
}
