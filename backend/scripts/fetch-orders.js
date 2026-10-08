/**
 * Backfill real marketplace orders (no dummy rows).
 *
 *   npm run fetch-orders --prefix backend -- --source=uber|deliveroo|justeat|doordash|all
 */
import "../src/loadEnv.js";
import { runMigrations } from "../src/db/runMigrations.js";
import {
  isDeliverooEnabled,
  isDoorDashEnabled,
  isJustEatEnabled,
  isUberEnabled,
} from "../src/integrations/flags.js";
import { isConfigured as deliverooConfigured } from "../src/integrations/deliveroo/adapter.js";
import { isConfigured as justeatConfigured } from "../src/integrations/justeat/adapter.js";
import { isConfigured as doordashConfigured } from "../src/integrations/doordash/adapter.js";
import { NotConfiguredError } from "../src/integrations/errors.js";
import { backfillUberOrders } from "../src/uber/backfill.js";
import * as deliveroo from "../src/integrations/deliveroo/adapter.js";
import * as justeat from "../src/integrations/justeat/adapter.js";
import * as doordash from "../src/integrations/doordash/adapter.js";

function parseArgs(argv) {
  const out = {
    source: "all",
    storeId: null,
    start: null,
    end: null,
    fallbackCreated: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--source=")) out.source = a.slice("--source=".length).toLowerCase();
    else if (a === "--source") out.source = String(argv[++i] || "all").toLowerCase();
    else if (a === "--store-id" || a === "--storeId") out.storeId = argv[++i];
    else if (a === "--start") out.start = argv[++i];
    else if (a === "--end") out.end = argv[++i];
    else if (a === "--fallback-created") out.fallbackCreated = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function selectedSources(source) {
  if (source === "all") return ["uber", "deliveroo", "justeat", "doordash"];
  if (["uber", "deliveroo", "justeat", "doordash"].includes(source)) return [source];
  throw new Error(`Unknown --source=${source} (use uber|deliveroo|justeat|doordash|all)`);
}

async function runDeliveroo() {
  if (!isDeliverooEnabled()) {
    console.log("Deliveroo skipped: DELIVEROO_ENABLED is not true.");
    return { skipped: true };
  }
  if (!deliverooConfigured()) {
    console.log("Deliveroo skipped: credentials not set (DELIVEROO_CLIENT_ID / SECRET / WEBHOOK_SECRET).");
    return { skipped: true };
  }
  try {
    for await (const page of deliveroo.backfill()) {
      void page;
    }
  } catch (e) {
    if (e instanceof NotConfiguredError) {
      console.log(`Deliveroo backfill not run: ${e.message}`);
      return { skipped: true };
    }
    throw e;
  }
  return { skipped: false };
}

async function runJustEat() {
  if (!isJustEatEnabled()) {
    console.log("Just Eat skipped: JUSTEAT_ENABLED is not true.");
    return { skipped: true };
  }
  if (!justeatConfigured()) {
    console.log("Just Eat skipped: credentials not set (JUSTEAT_API_KEY / JUSTEAT_WEBHOOK_SECRET).");
    return { skipped: true };
  }
  try {
    for await (const page of justeat.backfill()) {
      void page;
    }
  } catch (e) {
    if (e instanceof NotConfiguredError) {
      console.log(`Just Eat backfill not run: ${e.message}`);
      return { skipped: true };
    }
    throw e;
  }
  return { skipped: false };
}

async function runDoorDash() {
  if (!isDoorDashEnabled()) {
    console.log("DoorDash skipped: DOORDASH_ENABLED is not true.");
    return { skipped: true };
  }
  if (!doordashConfigured()) {
    console.log(
      "DoorDash skipped: credentials not set (DOORDASH_DEVELOPER_ID / KEY_ID / SIGNING_SECRET / WEBHOOK_AUTH).",
    );
    return { skipped: true };
  }
  try {
    for await (const page of doordash.backfill()) {
      void page;
    }
  } catch (e) {
    if (e instanceof NotConfiguredError) {
      console.log(`DoorDash backfill not run: ${e.message}`);
      return { skipped: true };
    }
    throw e;
  }
  return { skipped: false };
}

async function runUber(args) {
  if (!isUberEnabled()) {
    console.log("Uber skipped: UBER_ENABLED is not true.");
    return { skipped: true };
  }
  if (!process.env.UBER_CLIENT_ID?.trim() || !process.env.UBER_CLIENT_SECRET?.trim()) {
    console.log("Uber skipped: UBER_CLIENT_ID / UBER_CLIENT_SECRET not set.");
    return { skipped: true };
  }
  const result = await backfillUberOrders(args);
  if (result.noStores) {
    console.log(result.message);
    return { skipped: false, noStores: true, result };
  }
  console.log(
    `Uber backfill complete. Synced ${result.total} real order(s) across ${result.storeCount} store(s).`,
  );
  return { skipped: false, result };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/fetch-orders.js [--source=uber|deliveroo|justeat|doordash|all]

Options:
  --source <name>     uber | deliveroo | justeat | doordash | all (default: all)
  --store-id <uuid>   Uber store id (or set UBER_STORE_ID)
  --start <RFC3339>
  --end <RFC3339>
  --fallback-created  Uber created-orders / canceled-orders only
`);
    process.exit(0);
  }

  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  await runMigrations(process.env.DATABASE_URL);

  const sources = selectedSources(args.source);
  for (const src of sources) {
    if (src === "uber") await runUber(args);
    else if (src === "deliveroo") await runDeliveroo();
    else if (src === "justeat") await runJustEat();
    else if (src === "doordash") await runDoorDash();
  }
}

main().catch((e) => {
  console.error("fetch-orders failed:", e.message || e);
  process.exit(1);
});
