import { normalizeE164 } from "./voiceWebhookUtils.js";

/**
 * Parse free-text item lists from AI extractors into { name, quantity, notes? }[].
 * Examples: "2 Burgers, 1 Coke" | "Burger x2 and Fries"
 * @param {unknown} raw
 * @returns {{ name: string; quantity: number; notes?: string | null }[]}
 */
export function parseOrderItemsText(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((it) => {
        if (!it) return null;
        if (typeof it === "string") return parseOrderItemsText(it)[0] || null;
        const name = String(it.name || it.item_name || it.item || "").trim();
        if (!name) return null;
        return {
          name,
          quantity: Math.max(1, Number(it.quantity ?? it.qty ?? 1) || 1),
          notes: it.notes != null ? String(it.notes) : null,
        };
      })
      .filter(Boolean);
  }

  if (raw == null) return [];
  const itemStr = String(raw).trim();
  if (!itemStr) return [];

  // Prefer explicit separators over "and"
  const parts = itemStr
    .split(/,|;|\band\b/i)
    .map((p) => p.trim())
    .filter(Boolean);

  return parts
    .map((part) => {
      const match =
        part.match(/^(\d+)\s*[xX×]?\s+(.+)$/) ||
        part.match(/^(.+?)\s+[xX×]\s*(\d+)$/) ||
        part.match(/^(.+?)\s*\((\d+)\)$/);
      if (match) {
        const a = match[1];
        const b = match[2];
        const qtyA = parseInt(a, 10);
        if (!Number.isNaN(qtyA) && String(qtyA) === a.trim()) {
          return { name: b.trim(), quantity: Math.max(1, qtyA), notes: null };
        }
        const qtyB = parseInt(b, 10);
        return { name: a.trim(), quantity: Math.max(1, qtyB || 1), notes: null };
      }
      return { name: part, quantity: 1, notes: null };
    })
    .filter((it) => it.name);
}

/**
 * Match items to menu and compute line totals.
 */
export function matchMenuLines(menu, items) {
  const lines = [];
  const unmatched = [];
  for (const it of items) {
    const qty = Math.max(1, Number(it.quantity ?? 1) || 1);
    const needle = (it.name || "").trim().toLowerCase();
    let m = menu.find((x) => x.name.toLowerCase() === needle);
    if (!m) {
      m = menu.find(
        (x) => x.name.toLowerCase().includes(needle) || needle.includes(x.name.toLowerCase()),
      );
    }
    if (m) {
      const price = Number(m.price);
      lines.push({
        menu_item_id: m.id,
        item_name: m.name,
        quantity: qty,
        unit_price: price,
        line_total: price * qty,
        notes: it.notes ?? null,
        matched: true,
      });
    } else {
      unmatched.push(it.name);
      lines.push({
        menu_item_id: null,
        item_name: it.name,
        quantity: qty,
        unit_price: 0,
        line_total: 0,
        notes: it.notes ?? null,
        matched: false,
      });
    }
  }
  return { lines, unmatched };
}

/**
 * Validate and compute coupon discount for a restaurant.
 * @returns {Promise<{ code: string | null; amount: number; discount_id?: string; error?: string }>}
 */
export async function applyCoupon(knex, { restaurantId, code, subtotal }) {
  const raw = String(code || "").trim();
  if (!raw) return { code: null, amount: 0 };

  const discount = await knex("discounts")
    .where({ restaurant_id: restaurantId })
    .andWhere((qb) => {
      qb.whereRaw("lower(code) = ?", [raw.toLowerCase()]);
    })
    .first();

  if (!discount || discount.is_active === false) {
    return { code: raw, amount: 0, error: "coupon_not_found_or_inactive" };
  }
  const expiresAt = discount.valid_to || discount.ends_at || discount.expires_at;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return { code: raw, amount: 0, error: "coupon_expired" };
  }
  const startsAt = discount.valid_from || discount.starts_at;
  if (startsAt && new Date(startsAt) > new Date()) {
    return { code: raw, amount: 0, error: "coupon_not_started" };
  }
  if (discount.max_uses != null && Number(discount.used_count || 0) >= Number(discount.max_uses)) {
    return { code: raw, amount: 0, error: "coupon_max_uses" };
  }
  const minOrder = Number(discount.min_order_amount || 0);
  if (subtotal < minOrder) {
    return { code: raw, amount: 0, error: "below_min_order" };
  }

  const type = String(discount.discount_type || "percentage").toLowerCase();
  const value = Number(discount.value ?? discount.discount_value ?? 0);
  let amount = 0;
  if (type === "fixed") amount = value;
  else amount = (subtotal * value) / 100;

  amount = Math.max(0, Math.min(subtotal, Number(amount.toFixed(2))));
  return { code: discount.code, amount, discount_id: discount.id };
}

/**
 * Create a phone/AI order with menu matching + optional coupon.
 * @param {import("knex").Knex} knex
 * @param {object} input
 */
export async function createPhoneOrder(knex, input) {
  const {
    restaurantId,
    customer_name,
    customer_phone,
    delivery_address,
    delivery_notes,
    items,
    coupon_code,
    payment_method,
    fulfillment_type,
    call_id,
    source = "phone",
    ai_extracted_data,
  } = input;

  if (!restaurantId) throw new Error("restaurantId is required");
  if (!customer_name) throw new Error("customer_name is required");

  const parsedItems = parseOrderItemsText(items);
  if (!parsedItems.length) throw new Error("No order items to place");

  const [menu, settings] = await Promise.all([
    knex("menu_items")
      .where({ restaurant_id: restaurantId, is_available: true })
      .select("id", "name", "price"),
    knex("restaurant_settings").where({ restaurant_id: restaurantId }).first(),
  ]);

  const { lines, unmatched } = matchMenuLines(menu, parsedItems);
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);

  const coupon = await applyCoupon(knex, {
    restaurantId,
    code: coupon_code,
    subtotal,
  });

  const taxRate = Number(settings?.tax_rate ?? 0) / 100;
  const isPickup = String(fulfillment_type || "delivery").toLowerCase() === "pickup";
  const deliveryFee = isPickup ? 0 : Number(settings?.delivery_fee ?? 0);
  const taxableBase = Math.max(0, subtotal - coupon.amount);
  const tax = Number((taxableBase * taxRate).toFixed(2));
  const total = Number((taxableBase + tax + deliveryFee).toFixed(2));

  const orderNumber = "ORD-" + Math.random().toString(36).substr(2, 9).toUpperCase();
  const trackingCode = Math.random().toString(36).substr(2, 10).toUpperCase();

  const phone = normalizeE164(customer_phone) || String(customer_phone || "0000000000");
  const address = isPickup
    ? delivery_address || "Pickup"
    : delivery_address || "Address not provided";

  const result = await knex.transaction(async (trx) => {
    const [order] = await trx("orders")
      .insert({
        restaurant_id: restaurantId,
        order_number: orderNumber,
        tracking_code: trackingCode,
        customer_name: String(customer_name).trim(),
        customer_phone: phone,
        delivery_address: address,
        delivery_notes: delivery_notes || null,
        fulfillment_type: isPickup ? "pickup" : "delivery",
        source,
        status: "pending",
        payment_method: payment_method || "cash",
        payment_status: "pending",
        subtotal,
        tax_amount: tax,
        delivery_fee: deliveryFee,
        discount_amount: coupon.amount,
        discount_code: coupon.code,
        total_amount: total,
        call_id: call_id || null,
        ai_extracted_data: {
          unmatched,
          coupon_error: coupon.error || null,
          ...(ai_extracted_data && typeof ai_extracted_data === "object" ? ai_extracted_data : {}),
        },
      })
      .returning("*");

    if (lines.length) {
      await trx("order_items").insert(
        lines.map((l) => ({
          order_id: order.id,
          menu_item_id: l.menu_item_id,
          item_name: l.item_name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.line_total,
          notes: l.notes,
        })),
      );
    }

    if (coupon.discount_id && coupon.amount > 0) {
      await trx("discounts")
        .where({ id: coupon.discount_id })
        .update({ used_count: trx.raw("coalesce(used_count, 0) + 1") });
    }

    return order;
  });

  return {
    order: result,
    unmatched,
    coupon,
    totals: { subtotal, tax, deliveryFee, discount: coupon.amount, total },
  };
}
