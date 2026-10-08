/**
 * Shared idempotent marketplace upsert into kitchen `orders`.
 * Never invents orders; never downgrades a final marketplace status.
 */
import { getKnex } from "../db.js";
import { createLogger } from "../lib/safeLogger.js";
import { notifyNewOrderLater } from "../lib/orderAlerts.js";
import {
  displayPrefix,
  kitchenToMarketplaceStatus,
  marketplaceToKitchenStatus,
  wouldDowngrade,
} from "./status.js";

const log = createLogger("orderService");

function asJsonb(knex, value) {
  return knex.raw("?::jsonb", [JSON.stringify(value ?? null)]);
}

/**
 * Pure merge used by tests and upsertOrder.
 * @param {object|null} existing  row from `orders` (or null)
 * @param {object} incoming normalized order
 */
export function mergeNormalizedOrder(existing, incoming) {
  const incomingStatus = String(incoming.status || "placed").toLowerCase();
  const existingMarket =
    existing?.marketplace_status ||
    kitchenToMarketplaceStatus(existing?.status) ||
    null;

  const skipStatus = existing && wouldDowngrade(existingMarket, incomingStatus);
  const status = skipStatus ? existingMarket : incomingStatus;
  const kitchenStatus = marketplaceToKitchenStatus(status);

  return {
    skipStatus: Boolean(skipStatus),
    marketplace_status: status,
    kitchen_status: kitchenStatus,
  };
}

export async function claimMarketplaceEvent(source, eventId, eventType, externalOrderId) {
  if (!eventId) return true;
  const knex = getKnex();
  try {
    await knex("marketplace_webhook_events").insert({
      source,
      event_id: String(eventId),
      event_type: eventType || null,
      external_order_id: externalOrderId || null,
    });
    return true;
  } catch (e) {
    if (e?.code === "23505") return false;
    throw e;
  }
}

async function resolveRestaurantId(normalized) {
  if (normalized.restaurant_id) return normalized.restaurant_id;
  const knex = getKnex();
  const sid = normalized.store_id ? String(normalized.store_id) : "";
  const source = String(normalized.source || "");

  if (sid && source === "uber") {
    const mapped = await knex("restaurants").where({ uber_store_id: sid }).first("id");
    if (mapped?.id) return mapped.id;
  }
  if (sid && source === "doordash") {
    const mapped = await knex("restaurants").where({ doordash_store_id: sid }).first("id");
    if (mapped?.id) return mapped.id;
  }

  const uberRestaurant = String(process.env.UBER_RESTAURANT_ID || "").trim();
  if (source === "uber" && uberRestaurant) return uberRestaurant;
  const ddRestaurant = String(process.env.DOORDASH_RESTAURANT_ID || "").trim();
  if (source === "doordash" && ddRestaurant) return ddRestaurant;

  const parent = await knex("restaurants")
    .whereNull("parent_restaurant_id")
    .orderBy("created_at", "asc")
    .first("id", "uber_store_id", "doordash_store_id");
  if (parent?.id && sid && source === "uber" && !parent.uber_store_id) {
    await knex("restaurants").where({ id: parent.id }).update({ uber_store_id: sid });
  }
  if (parent?.id && sid && source === "doordash" && !parent.doordash_store_id) {
    await knex("restaurants").where({ id: parent.id }).update({ doordash_store_id: sid });
  }
  return parent?.id || null;
}

function trackingFor(source, externalId) {
  if (source === "uber") return `UBER-${externalId}`;
  if (source === "deliveroo") return `DELIVEROO-${externalId}`;
  if (source === "justeat") return `JUSTEAT-${externalId}`;
  if (source === "doordash") return `DOORDASH-${externalId}`;
  return `${String(source).toUpperCase()}-${externalId}`;
}

/**
 * @param {object} normalized
 * @param {{ notify?: boolean }} [opts]
 */
export async function upsertOrder(normalized, opts = {}) {
  if (!normalized?.source || !normalized?.external_order_id) {
    throw new Error("upsertOrder requires source and external_order_id");
  }

  const knex = getKnex();
  const source = String(normalized.source);
  const externalId = String(normalized.external_order_id);
  const restaurantId = await resolveRestaurantId(normalized);
  if (!restaurantId) {
    log.warn("No restaurant mapped for marketplace order — skip kitchen upsert", {
      source,
      external_order_id: externalId,
      store_id: normalized.store_id || null,
    });
    return { row: null, created: false, skipped: "no_restaurant" };
  }

  const existing = await knex("orders")
    .where({ source, external_order_id: externalId })
    .first();

  const merged = mergeNormalizedOrder(existing, normalized);
  const displayId =
    normalized.display_id ||
    `${displayPrefix(source)}-${String(externalId).slice(-8).toUpperCase()}`;
  const code = trackingFor(source, externalId);
  const placedAt = normalized.placed_at
    ? new Date(normalized.placed_at).toISOString()
    : existing?.created_at || new Date().toISOString();

  const patch = {
    restaurant_id: restaurantId,
    customer_name: normalized.customer_name || existing?.customer_name || `${source} customer`,
    customer_phone: normalized.customer_phone || existing?.customer_phone || source,
    delivery_address: normalized.delivery_address || existing?.delivery_address || `${source} order`,
    delivery_notes: normalized.delivery_notes ?? existing?.delivery_notes ?? null,
    fulfillment_type: normalized.fulfillment_type || existing?.fulfillment_type || "delivery",
    source,
    external_order_id: externalId,
    marketplace_store_id: normalized.store_id || existing?.marketplace_store_id || null,
    marketplace_status: merged.marketplace_status,
    marketplace_items: asJsonb(knex, normalized.items || []),
    marketplace_totals: normalized.totals != null ? asJsonb(knex, normalized.totals) : existing?.marketplace_totals || null,
    raw_payload: asJsonb(knex, normalized.raw_payload || {}),
    payment_method: source,
    payment_status: merged.kitchen_status === "cancelled" ? "unpaid" : "paid",
    subtotal: Number(normalized.totals?.subtotal ?? existing?.subtotal ?? 0),
    tax_amount: Number(normalized.totals?.tax ?? existing?.tax_amount ?? 0),
    delivery_fee: Number(normalized.totals?.deliveryFee ?? existing?.delivery_fee ?? 0),
    discount_amount: Number(normalized.totals?.discount ?? existing?.discount_amount ?? 0),
    total_amount: Number(normalized.totals?.total ?? existing?.total_amount ?? 0),
    notes: normalized.notes || existing?.notes || displayId,
    updated_at: new Date().toISOString(),
  };

  if (!merged.skipStatus) {
    patch.status = merged.kitchen_status;
  }

  let row;
  let created = false;

  if (existing) {
    const [updated] = await knex("orders").where({ id: existing.id }).update(patch).returning("*");
    row = updated;
    if (Array.isArray(normalized.items) && normalized.items.length && !merged.skipStatus) {
      await knex("order_items").where({ order_id: existing.id }).del();
      await insertItems(knex, existing.id, normalized.items);
    }
  } else {
    const orderNumber = String(displayId).slice(0, 40);
    const collision = await knex("orders")
      .where({ restaurant_id: restaurantId, order_number: orderNumber })
      .first("id");
    const number = collision
      ? `${displayPrefix(source)}-${String(externalId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`
      : orderNumber;

    const [inserted] = await knex("orders")
      .insert({
        ...patch,
        order_number: number,
        tracking_code: code,
        created_at: placedAt,
        status: merged.kitchen_status,
      })
      .returning("*");
    row = inserted;
    created = true;
    if (Array.isArray(normalized.items) && normalized.items.length) {
      await insertItems(knex, inserted.id, normalized.items);
    }
  }

  if (created && opts.notify !== false && (row.status === "pending" || row.status === "confirmed")) {
    notifyNewOrderLater(knex, row);
  }

  log.info("Upserted marketplace order", {
    source,
    external_order_id: externalId,
    local_id: row.id,
    marketplace_status: merged.marketplace_status,
    kitchen_status: row.status,
    created,
    skipStatus: merged.skipStatus,
  });

  return { row, created, skipStatus: merged.skipStatus };
}

async function insertItems(knex, orderId, items) {
  const rows = items.map((item) => ({
    order_id: orderId,
    menu_item_id: null,
    item_name: item.name || item.title || item.id || "Item",
    quantity: Math.max(1, Number(item.quantity) || 1),
    unit_price: Number(item.unit_price ?? item.price ?? 0),
    line_total: Number(item.line_total ?? (Number(item.unit_price ?? item.price ?? 0) * Math.max(1, Number(item.quantity) || 1))),
    notes: item.notes || null,
  }));
  await knex("order_items").insert(rows);
}

/**
 * @param {{ source?: string; status?: string; page?: number; pageSize?: number; restaurantIds?: string[] }} opts
 */
export async function listMarketplaceOrders(opts = {}) {
  const knex = getKnex();
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  let q = knex("orders");
  if (Array.isArray(opts.restaurantIds)) {
    if (!opts.restaurantIds.length) {
      return {
        data: [],
        pagination: { page, pageSize, total: 0, totalPages: 0 },
      };
    }
    q = q.whereIn("restaurant_id", opts.restaurantIds);
  }
  if (opts.source) {
    q = q.where({ source: String(opts.source).toLowerCase() });
  }
  if (opts.status) {
    const st = String(opts.status).toLowerCase();
    q = q.where((builder) => {
      builder.where({ marketplace_status: st }).orWhere({ status: st });
    });
  }

  const countRow = await q.clone().count({ count: "*" }).first();
  const total = Number(countRow?.count || 0);

  const rows = await q
    .clone()
    .select(
      "id",
      "restaurant_id",
      "order_number",
      "source",
      "external_order_id",
      "marketplace_status",
      "marketplace_store_id",
      "status",
      "customer_name",
      "customer_phone",
      "total_amount",
      "created_at",
      "updated_at",
    )
    .orderBy("created_at", "desc")
    .limit(pageSize)
    .offset(offset);

  return {
    data: rows.map((r) => ({
      ...r,
      display_id: r.order_number,
      placed_at: r.created_at,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
    },
  };
}
