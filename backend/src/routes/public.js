import { Router } from "express";
import { getKnex } from "../db.js";
import { geocodeAddress } from "../lib/geocoding.js";
import { findNearestBranch } from "../lib/phoneOrderService.js";

const router = Router();

/** Default storefront: first active restaurant (same idea as the old public anon menu). */
router.get("/storefront", async (req, res) => {
  try {
    const knex = getKnex();
    const queryRid = req.query.restaurant_id || req.query.branch_id;
    let r = null;
    if (queryRid) {
      r = await knex("restaurants").where({ id: String(queryRid), is_active: true }).first();
    }
    if (!r) {
      r = await knex("restaurants").where({ is_active: true, is_branch: false }).orderBy("created_at", "asc").first();
    }
    if (!r) {
      r = await knex("restaurants").where({ is_active: true }).orderBy("created_at", "asc").first();
    }
    if (!r) {
      return res.status(404).json({ error: "No active restaurant" });
    }
    // Global default: allow single ElevenLabs agent to power chat/voice across restaurants.
    // Restaurant row can still override by setting restaurants.elevenlabs_agent_id.
    if (!r.elevenlabs_agent_id && process.env.ELEVENLABS_AGENT_ID) {
      r.elevenlabs_agent_id = process.env.ELEVENLABS_AGENT_ID;
    }
    const rid = r.id;
    const parentId = r.parent_restaurant_id || r.id;
    // For branches, menu categories, items, deals, and addons are managed centrally by the parent restaurant
    const menuSourceId = r.is_branch && r.parent_restaurant_id ? r.parent_restaurant_id : rid;

    const [settings, categories, items, deals, hours, variants, addons, itemAddons, branches] = await Promise.all([
      knex("restaurant_settings").where({ restaurant_id: rid }).first(),
      knex("menu_categories").where({ restaurant_id: menuSourceId }).andWhere({ is_active: true }).orderBy("sort_order", "asc"),
      knex("menu_items").where({ restaurant_id: menuSourceId }).orderBy("sort_order", "asc"),
      knex("deals").where({ restaurant_id: menuSourceId }).andWhere({ is_active: true }),
      knex("restaurant_hours").where({ restaurant_id: rid }).orderBy("open_time", "asc"),
      knex("menu_item_variants").where({ is_active: true }).orderBy("sort_order", "asc"),
      knex("menu_addons").where({ restaurant_id: menuSourceId, is_active: true }).orderBy("sort_order", "asc"),
      knex("menu_item_addons").select("menu_item_id", "menu_addon_id"),
      knex("restaurants")
        .where({ parent_restaurant_id: parentId, is_active: true })
        .select("id", "name", "address", "phone", "service_radius_km", "latitude", "longitude", "is_accepting_orders"),
    ]);
    return res.json({
      restaurant: r,
      settings: settings || null,
      categories,
      items,
      deals,
      hours: hours || [],
      variants: variants || [],
      addons: addons || [],
      itemAddons: itemAddons || [],
      branches: branches || [],
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
      branch_id,
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
      fulfillment_type = "delivery",
      delivery_latitude,
      delivery_longitude,
    } = req.body || {};

    if (!restaurant_id || !customer_name || !customer_phone || !delivery_address) {
      await trx.rollback();
      return res.status(400).json({ error: "Missing required fields" });
    }

    const isPickup = String(fulfillment_type).toLowerCase() === "pickup";
    let targetRestaurantId = branch_id || restaurant_id;
    let autoAssigned = false;
    let assignedBranchDistanceKm = null;
    let branchAssignedAt = null;
    let assignmentStatus = "assigned";

    let lat = Number.isFinite(Number(delivery_latitude)) ? Number(delivery_latitude) : null;
    let lng = Number.isFinite(Number(delivery_longitude)) ? Number(delivery_longitude) : null;

    if (!isPickup && !branch_id) {
      if ((lat == null || lng == null) && delivery_address) {
        const geo = await geocodeAddress(delivery_address);
        if (geo) {
          lat = geo.latitude;
          lng = geo.longitude;
        }
      }

      // Check if parent has branches
      const branches = await trx("restaurants")
        .where({ parent_restaurant_id: restaurant_id, is_active: true });

      if (branches.length > 0) {
        if (lat != null && lng != null) {
          const nearest = await findNearestBranch(trx, restaurant_id, lat, lng);
          if (nearest) {
            targetRestaurantId = nearest.branch.id;
            assignedBranchDistanceKm = nearest.distance;
            branchAssignedAt = new Date();
            autoAssigned = true;
            assignmentStatus = "assigned";
          } else {
            targetRestaurantId = restaurant_id;
            assignmentStatus = "unassigned_out_of_range";
            autoAssigned = false;
          }
        } else {
          targetRestaurantId = restaurant_id;
          assignmentStatus = "needs_review";
          autoAssigned = false;
        }
      }
    }

    // Validate if any ordered item is out of stock / out of order
    if (Array.isArray(lines) && lines.length) {
      const itemIds = lines.map((l) => l.menu_item_id).filter(Boolean);
      if (itemIds.length) {
        const dbItems = await trx("menu_items").whereIn("id", itemIds);
        for (const it of dbItems) {
          if (it.is_available === false || (it.track_inventory && Number(it.stock_quantity || 0) <= 0)) {
            await trx.rollback();
            return res.status(400).json({
              error: `Item "${it.name}" is currently out of order / out of stock and cannot be ordered.`,
            });
          }
        }
      }
    }

    const [order] = await trx("orders")
      .insert({
        restaurant_id: targetRestaurantId,
        customer_name,
        customer_phone,
        customer_email: customer_email || null,
        delivery_address,
        fulfillment_type: isPickup ? "pickup" : "delivery",
        notes: notes || null,
        source: "web",
        status: "pending",
        subtotal,
        tax_amount,
        delivery_fee,
        total_amount,
        auto_assigned: autoAssigned,
        delivery_latitude: lat,
        delivery_longitude: lng,
        assigned_branch_distance_km: assignedBranchDistanceKm,
        branch_assigned_at: branchAssignedAt,
        assignment_status: assignmentStatus,
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
