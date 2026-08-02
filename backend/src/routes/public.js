import { Router } from "express";
import { getKnex } from "../db.js";

const router = Router();

/** Default storefront: first active restaurant (same idea as the old public anon menu). */
router.get("/storefront", async (_req, res) => {
  try {
    const knex = getKnex();
    const r = await knex("restaurants").where({ is_active: true }).orderBy("created_at", "asc").first();
    if (!r) {
      return res.status(404).json({ error: "No active restaurant" });
    }
    // Global default: allow single ElevenLabs agent to power chat/voice across restaurants.
    // Restaurant row can still override by setting restaurants.elevenlabs_agent_id.
    if (!r.elevenlabs_agent_id && process.env.ELEVENLABS_AGENT_ID) {
      r.elevenlabs_agent_id = process.env.ELEVENLABS_AGENT_ID;
    }
    const rid = r.id;
    const [settings, categories, items, deals, hours] = await Promise.all([
      knex("restaurant_settings").where({ restaurant_id: rid }).first(),
      knex("menu_categories").where({ restaurant_id: rid }).andWhere({ is_active: true }).orderBy("sort_order", "asc"),
      knex("menu_items").where({ restaurant_id: rid }).andWhere({ is_available: true }).orderBy("sort_order", "asc"),
      knex("deals").where({ restaurant_id: rid }).andWhere({ is_active: true }),
      knex("restaurant_hours").where({ restaurant_id: rid }).orderBy("open_time", "asc"),
    ]);
    return res.json({
      restaurant: r,
      settings: settings || null,
      categories,
      items,
      deals,
      hours: hours || [],
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

router.get("/track/:code", async (req, res) => {
  try {
    const code = (req.params.code || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "Missing code" });
    const knex = getKnex();
    const order = await knex("orders").where({ tracking_code: code }).first();
    if (!order) return res.status(404).json({ error: "Order not found" });
    const [items, history, settings] = await Promise.all([
      knex("order_items").where({ order_id: order.id }),
      knex("order_status_history").where({ order_id: order.id }).orderBy("created_at", "asc"),
      knex("restaurant_settings")
        .where({ restaurant_id: order.restaurant_id })
        .select("name", "logo_url", "phone")
        .first(),
    ]);
    return res.json({ order, items, history, settings: settings || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

router.post("/orders", async (req, res) => {
  const knex = getKnex();
  const trx = await knex.transaction();
  try {
    const {
      restaurant_id,
      customer_name,
      customer_phone,
      customer_email,
      delivery_address,
      notes,
      subtotal,
      tax_amount,
      delivery_fee,
      total_amount,
      lines,
    } = req.body || {};
    if (!restaurant_id || !customer_name || !customer_phone || !delivery_address) {
      await trx.rollback();
      return res.status(400).json({ error: "Missing required fields" });
    }
    const [order] = await trx("orders")
      .insert({
        restaurant_id,
        customer_name,
        customer_phone,
        customer_email: customer_email || null,
        delivery_address,
        fulfillment_type: req.body.fulfillment_type || 'delivery',
        notes: notes || null,
        source: "web",
        status: "pending",
        subtotal,
        tax_amount,
        delivery_fee,
        total_amount,
      })
      .returning("*");
    if (Array.isArray(lines) && lines.length) {
      await trx("order_items").insert(
        lines.map((l) => ({
          order_id: order.id,
          menu_item_id: l.menu_item_id ?? null,
          deal_id: l.deal_id ?? null,
          item_name: l.item_name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.line_total,
        })),
      );
    }
    await trx.commit();
    return res.json({ order });
  } catch (e) {
    await trx.rollback();
    console.error(e);
    return res.status(500).json({ error: e.message || "Order failed" });
  }
});

export default router;
