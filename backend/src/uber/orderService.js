/**
 * Persist and query Uber Eats orders in uber_orders.
 */
import { getKnex } from "../db.js";
import { uberLog } from "./logger.js";
import { syncUberOrderToRestaurant, syncUberStateToRestaurant } from "./syncRestaurantOrder.js";

/** pg/knex can bind JS arrays as Postgres arrays; force jsonb. */
function asJsonb(knex, value) {
  return knex.raw("?::jsonb", [JSON.stringify(value ?? null)]);
}

/**
 * Normalize v2 Get Order Details (or delivery list item) into our row shape.
 * Field names follow Uber's documented Order payload where available.
 */
export function mapUberOrderToRow(order) {
  if (order?.order && typeof order.order === "object") order = order.order;
  if (!order || typeof order !== "object") {
    throw new Error("Invalid Uber order payload");
  }

  const uberOrderId = order.id || order.order_id;
  if (!uberOrderId) throw new Error("Uber order missing id");

  const storeId =
    order.store?.id ||
    order.store_id ||
    order.store?.store_id ||
    null;

  const customerName =
    order.eater?.first_name ||
    order.customers?.[0]?.name?.display_name ||
    order.customers?.[0]?.name?.first_name ||
    [order.eater?.first_name, order.eater?.last_name].filter(Boolean).join(" ") ||
    null;

  // v2 uses cart.items; delivery list API uses carts[].items
  let items = [];
  if (Array.isArray(order.cart?.items)) {
    items = order.cart.items;
  } else if (Array.isArray(order.carts)) {
    items = order.carts.flatMap((c) => (Array.isArray(c?.items) ? c.items : []));
  } else if (Array.isArray(order.items)) {
    items = order.items;
  }

  const totals =
    order.payment ||
    order.payment_detail ||
    order.payment?.payment_detail ||
    null;

  const currentState = order.current_state || order.state || null;

  // TODO: v2 Get Order Details docs sample emphasizes cart/eater; confirm placed_at
  // is always present for your API version. Fall back to null if absent.
  const placedAtRaw = order.placed_at || order.created_time || order.order_time || null;
  let placedAt = null;
  if (placedAtRaw) {
    const d = new Date(placedAtRaw);
    placedAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  return {
    uber_order_id: String(uberOrderId),
    display_id: order.display_id != null ? String(order.display_id) : null,
    store_id: storeId != null ? String(storeId) : null,
    current_state: currentState != null ? String(currentState) : null,
    placed_at: placedAt,
    customer_name: customerName,
    items,
    totals,
    raw_payload: order,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Upsert by uber_order_id (idempotent).
 * @returns {Promise<{ row: object; created: boolean }>}
 */
function toDbRow(knex, row) {
  return {
    uber_order_id: row.uber_order_id,
    display_id: row.display_id,
    store_id: row.store_id,
    current_state: row.current_state,
    placed_at: row.placed_at,
    customer_name: row.customer_name,
    items: asJsonb(knex, row.items),
    totals: row.totals != null ? asJsonb(knex, row.totals) : null,
    raw_payload: asJsonb(knex, row.raw_payload),
    updated_at: row.updated_at,
  };
}

export async function upsertUberOrder(order, opts = {}) {
  const knex = getKnex();
  const mapped = mapUberOrderToRow(order);
  const row = toDbRow(knex, mapped);
  const existing = await knex("uber_orders").where({ uber_order_id: mapped.uber_order_id }).first();

  let saved;
  let created = false;
  if (existing) {
    const [updated] = await knex("uber_orders")
      .where({ uber_order_id: mapped.uber_order_id })
      .update(row)
      .returning("*");
    saved = updated;
    uberLog.info("Updated uber_order", {
      uber_order_id: mapped.uber_order_id,
      current_state: mapped.current_state,
    });
  } else {
    const [inserted] = await knex("uber_orders")
      .insert({
        ...row,
        created_at: new Date().toISOString(),
      })
      .returning("*");
    saved = inserted;
    created = true;
    uberLog.info("Inserted uber_order", {
      uber_order_id: mapped.uber_order_id,
      current_state: mapped.current_state,
    });
  }

  try {
    await syncUberOrderToRestaurant(order, { notify: opts.notify === true && created });
  } catch (e) {
    uberLog.error("Kitchen order sync failed", {
      uber_order_id: mapped.uber_order_id,
      message: e?.message,
    });
  }

  return { row: saved, created };
}

/**
 * Update status only (cancel / failure webhooks) without requiring full details.
 */
export async function updateUberOrderState(uberOrderId, currentState, patch = {}) {
  const knex = getKnex();
  const existing = await knex("uber_orders").where({ uber_order_id: uberOrderId }).first();
  if (!existing) {
    // Insert a stub so cancel events aren't lost if details fetch failed earlier.
    const [created] = await knex("uber_orders")
      .insert({
        uber_order_id: uberOrderId,
        current_state: currentState,
        store_id: patch.store_id || null,
        raw_payload: asJsonb(knex, patch.raw_payload || { stub: true, event: patch }),
        items: asJsonb(knex, []),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .returning("*");
    return { row: created, created: true };
  }

  const prev =
    existing.raw_payload && typeof existing.raw_payload === "object" ? existing.raw_payload : {};
    const [updated] = await knex("uber_orders")
    .where({ uber_order_id: uberOrderId })
    .update({
      current_state: currentState,
      updated_at: new Date().toISOString(),
      ...(patch.raw_payload
        ? { raw_payload: asJsonb(knex, { ...prev, _last_event: patch.raw_payload }) }
        : {}),
    })
    .returning("*");
  try {
    await syncUberStateToRestaurant(uberOrderId, currentState);
  } catch (e) {
    uberLog.error("Kitchen status sync failed", { uber_order_id: uberOrderId, message: e?.message });
  }
  return { row: updated, created: false };
}

export async function getUberOrderById(uberOrderId) {
  const knex = getKnex();
  return knex("uber_orders").where({ uber_order_id: uberOrderId }).first();
}

/**
 * @param {{ state?: string; page?: number; pageSize?: number; storeId?: string }} opts
 */
export async function listStoredUberOrders(opts = {}) {
  const knex = getKnex();
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 20));
  const offset = (page - 1) * pageSize;

  let q = knex("uber_orders");
  if (opts.state) q = q.where({ current_state: opts.state });
  if (opts.storeId) q = q.where({ store_id: opts.storeId });

  const countRow = await q.clone().count({ count: "*" }).first();
  const total = Number(countRow?.count || 0);

  const rows = await q
    .clone()
    .orderBy("placed_at", "desc")
    .orderBy("created_at", "desc")
    .limit(pageSize)
    .offset(offset);

  return {
    data: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 0,
    },
  };
}

/**
 * Record webhook event_id for idempotency across Uber retries.
 * @returns {Promise<boolean>} true if this is a new event, false if already seen
 */
export async function claimWebhookEvent(eventId, eventType, uberOrderId) {
  if (!eventId) return true;
  const knex = getKnex();
  try {
    await knex("uber_webhook_events").insert({
      event_id: eventId,
      event_type: eventType || null,
      uber_order_id: uberOrderId || null,
    });
    return true;
  } catch (e) {
    // unique violation → duplicate delivery
    if (e?.code === "23505") return false;
    throw e;
  }
}
