import { getUberConfig } from "./config.js";
import {
  getOrderDetails,
  listCanceledOrders,
  listCreatedOrders,
  listStoreOrders,
  listStores,
} from "./uberClient.js";
import { upsertUberOrder } from "./orderService.js";
import { uberLog } from "./logger.js";

async function resolveStoreIds(cliStoreId) {
  const cfg = getUberConfig();
  if (cliStoreId) return [cliStoreId];
  if (cfg.defaultStoreId) return [cfg.defaultStoreId];

  uberLog.info("No store id provided — listing stores from Uber API");
  const stores = [];
  let startKey = null;
  do {
    const page = await listStores({ limit: 50, startKey });
    for (const s of page?.stores || []) {
      const id = s.store_id || s.id;
      if (id) stores.push(String(id));
    }
    startKey = page?.next_key || null;
  } while (startKey);

  return stores;
}

async function persistDetails(orderId) {
  const full = await getOrderDetails(orderId);
  await upsertUberOrder(full, { notify: false });
}

async function backfillViaDeliveryList(storeId, { start, end }) {
  let nextPageToken = null;
  let page = 0;
  let upserted = 0;
  do {
    page += 1;
    const resp = await listStoreOrders(storeId, {
      startTime: start || undefined,
      endTime: end || undefined,
      nextPageToken: nextPageToken || undefined,
      pageSize: 50,
      expand: "carts,payment",
    });
    const orders = resp?.data || resp?.orders || [];
    uberLog.info("Fetched orders page", { storeId, page, count: orders.length });
    for (const order of orders) {
      const id = order.id || order.order_id;
      if (!id) continue;
      await persistDetails(id);
      upserted += 1;
    }
    nextPageToken = resp?.pagination_data?.next_page_token || resp?.next_page_token || null;
  } while (nextPageToken);
  return upserted;
}

async function backfillSummaries(storeId) {
  let upserted = 0;
  const created = await listCreatedOrders(storeId);
  for (const summary of created?.orders || []) {
    if (!summary?.id) continue;
    await persistDetails(summary.id);
    upserted += 1;
  }
  try {
    const canceled = await listCanceledOrders(storeId);
    for (const summary of canceled?.orders || []) {
      if (!summary?.id) continue;
      await persistDetails(summary.id);
      upserted += 1;
    }
  } catch (e) {
    uberLog.warn("canceled-orders fetch skipped", { storeId, status: e?.status, message: e?.message });
  }
  return upserted;
}

/**
 * Pull real Uber orders (no fake data) and upsert into uber_orders + kitchen orders.
 */
export async function backfillUberOrders(opts = {}) {
  const storeIds = await resolveStoreIds(opts.storeId || null);
  if (!storeIds.length) {
    uberLog.warn(
      "No Uber store is linked to this app yet. Ask Uber for a sandbox test store, or complete order-manager linking for a live store.",
    );
    return {
      total: 0,
      storeCount: 0,
      storeIds: [],
      noStores: true,
      message:
        "No Uber store is linked to this Client ID. GET /v1/eats/stores returned zero stores. Ask Uber Integration Tech Support for a sandbox test store, or complete order-manager / POS linking for a live store.",
    };
  }
  let total = 0;
  for (const storeId of storeIds) {
    uberLog.info("Backfilling real Uber orders", {
      storeId,
      start: opts.start,
      end: opts.end,
    });
    if (opts.fallbackCreated) {
      total += await backfillSummaries(storeId);
      continue;
    }
    try {
      total += await backfillViaDeliveryList(storeId, { start: opts.start, end: opts.end });
    } catch (e) {
      uberLog.warn("Delivery list API failed — trying created/canceled fallback", {
        storeId,
        status: e?.status,
        message: e?.message,
      });
      total += await backfillSummaries(storeId);
    }
  }
  return { total, storeCount: storeIds.length, storeIds };
}
