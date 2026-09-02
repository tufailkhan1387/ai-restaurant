// backend/src/routes/inventory.js
import { Router } from "express";
import { getKnex } from "../db.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

const router = Router();

// Helper to check management roles
function requireManagement(req, res, next) {
  const allowed = ["manager", "super_admin", "admin", "owner", "staff"];
  const roles = req.user?.roles || [];
  if (roles.includes("super_admin") || req.user?.restaurantIds?.length > 0 || roles.some(r => allowed.includes(r))) {
    return next();
  }
  return res.status(403).json({ error: "Management access required" });
}

/**
 * GET /api/inventory/report
 * Returns a list of inventory‑tracked menu items with stock, total sold, and remaining quantity.
 * Query parameters:
 *   limit (optional) – number of items per page (default 100)
 *   offset (optional) – pagination offset (default 0)
 */
router.get("/report", optionalAuth, requireAuth, requireManagement, async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const offset = parseInt(req.query.offset) || 0;

  const knex = getKnex();

  try {
    const user = req.user;
    const isSuperAdmin = user?.roles?.includes("super_admin");
    const memberIds = user?.restaurantIds || [];

    const reqRestaurantId = req.query.restaurant_id;

    if (!isSuperAdmin) {
      if (!memberIds.length) {
        return res.json({ data: [], limit, offset });
      }
      if (reqRestaurantId && reqRestaurantId !== "all") {
        if (!memberIds.includes(reqRestaurantId)) {
          return res.status(403).json({ error: "Access denied for this restaurant." });
        }
      }
    }

    let query = knex("menu_items")
      .where({ "menu_items.track_inventory": true })
      .leftJoin("restaurants", "menu_items.restaurant_id", "restaurants.id")
      .leftJoin("order_items", "menu_items.id", "order_items.menu_item_id")
      .leftJoin("orders", "order_items.order_id", "orders.id")
      .groupBy("menu_items.id", "restaurants.name")
      .select(
        "menu_items.id",
        "menu_items.name",
        "menu_items.stock_quantity",
        "menu_items.updated_at",
        "restaurants.name AS restaurant_name",
        knex.raw(
          `COALESCE(SUM(CASE WHEN orders.status IN ('delivered', 'completed') THEN order_items.quantity::integer ELSE 0 END), 0) AS sold_quantity`
        )
      );

    if (reqRestaurantId && reqRestaurantId !== "all") {
      query = query.where("menu_items.restaurant_id", reqRestaurantId);
    } else if (!isSuperAdmin) {
      query = query.whereIn("menu_items.restaurant_id", memberIds);
    }

    const rows = await query.limit(limit).offset(offset);

    const result = rows.map(r => {
        const sold = Number(r.sold_quantity);
        const stock = r.stock_quantity != null ? Number(r.stock_quantity) : null;
        const remaining = stock != null ? Math.max(0, stock - sold) : null;
        const lastUpdated = r.updated_at ? new Date(r.updated_at).toISOString().split('T')[0] : null;
        return {
          id: r.id,
          name: r.name,
          restaurant_name: r.restaurant_name,
          stock_quantity: stock,
          sold_quantity: sold,
          remaining_quantity: remaining,
          last_updated: lastUpdated,
        };
      });

    res.json({ data: result, limit, offset });
  } catch (err) {
    console.error("Inventory report error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch inventory report" });
  }
});

export default router;
