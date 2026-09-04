import { Router } from "express";
import { getKnex } from "../db.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";

const router = Router();

const COMPLETED_STATUSES = ["delivered", "completed"];

function isSuperAdmin(user) {
  return user?.roles?.includes("super_admin");
}

/** Resolve which restaurant IDs the caller may read in reports. */
function resolveReportRestaurantIds(user, queryRestaurantId) {
  const requested =
    typeof queryRestaurantId === "string" && queryRestaurantId.trim() ? queryRestaurantId.trim() : null;

  if (isSuperAdmin(user)) {
    return { allowed: true, restaurantIds: requested ? [requested] : null, scopeAll: !requested };
  }

  const memberIds = [...new Set(user?.restaurantIds || [])];
  if (!memberIds.length) {
    return { allowed: false, restaurantIds: [], scopeAll: false };
  }

  if (requested) {
    if (!memberIds.includes(requested)) {
      return { allowed: false, restaurantIds: [], scopeAll: false };
    }
    return { allowed: true, restaurantIds: [requested], scopeAll: false };
  }

  return { allowed: true, restaurantIds: memberIds, scopeAll: memberIds.length > 1 };
}

function applyRestaurantScope(qb, knex, column, scope) {
  if (!scope.allowed) {
    qb.whereRaw("1 = 0");
    return;
  }
  if (scope.restaurantIds?.length) {
    qb.whereIn(column, scope.restaurantIds);
  }
}

function parsePositiveInt(value, fallback, max = 500) {
  const n = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

router.get("/global", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();

    // Check if super_admin via DB (more reliable than JWT payload)
    const roleRow = await knex("user_roles")
      .where({ user_id: req.user.id })
      .whereIn("role", ["super_admin"])
      .first();

    const isSuperAdmin = !!roleRow;
    const restaurantIds = req.user.restaurantIds || [];

    let totalRestaurants = 0;
    let totalMenuItems = 0;
    let totalDeals = 0;
    let totalDrivers = 0;
    let totalVehicles = 0;

    if (isSuperAdmin) {
      const [rr, mr, dr, drv, veh] = await Promise.all([
        knex("restaurants").count("* as cnt"),
        knex("menu_items").count("* as cnt"),
        knex("deals").count("* as cnt"),
        knex("drivers").count("* as cnt"),
        knex("vehicles").count("* as cnt"),
      ]);
      totalRestaurants = Number(rr[0]?.cnt || 0);
      totalMenuItems = Number(mr[0]?.cnt || 0);
      totalDeals = Number(dr[0]?.cnt || 0);
      totalDrivers = Number(drv[0]?.cnt || 0);
      totalVehicles = Number(veh[0]?.cnt || 0);
    } else if (restaurantIds.length > 0) {
      const [rr, mr, dr, drvRow, veh] = await Promise.all([
        knex("restaurants").whereIn("id", restaurantIds).count("* as cnt"),
        knex("menu_items").whereIn("restaurant_id", restaurantIds).count("* as cnt"),
        knex("deals").whereIn("restaurant_id", restaurantIds).count("* as cnt"),
        knex("driver_restaurants")
          .whereIn("restaurant_id", restaurantIds)
          .countDistinct("driver_id as cnt")
          .first(),
        knex("vehicles").whereIn("restaurant_id", restaurantIds).count("* as cnt"),
      ]);
      totalRestaurants = Number(rr[0]?.cnt || 0);
      totalMenuItems = Number(mr[0]?.cnt || 0);
      totalDeals = Number(dr[0]?.cnt || 0);
      totalDrivers = Number((drvRow && drvRow.cnt) ?? 0);
      totalVehicles = Number(veh[0]?.cnt || 0);
    }

    return res.json({ totalRestaurants, totalMenuItems, totalDeals, totalDrivers, totalVehicles });
  } catch (e) {
    console.error("STATS ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

router.get("/earnings", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const scope = resolveReportRestaurantIds(req.user, req.query.restaurant_id);
    if (!scope.allowed) {
      return res.json({
        restaurants: [],
        summary: {
          total_sales: 0,
          total_orders: 0,
          total_admin_earning: 0,
          total_restaurant_earning: 0,
        },
      });
    }

    const stats = await knex("orders")
      .join("restaurants", "orders.restaurant_id", "restaurants.id")
      .select(
        "restaurants.id as restaurant_id",
        "restaurants.name as restaurant_name",
        "restaurants.commission_rate",
        knex.raw("SUM(orders.total_amount) as total_sales"),
        knex.raw("COUNT(orders.id) as order_count")
      )
      .whereIn("orders.status", ["delivered", "completed"])
      .modify((qb) => {
        applyRestaurantScope(qb, knex, "restaurants.id", scope);
      })
      .groupBy("restaurants.id", "restaurants.name", "restaurants.commission_rate")
      .orderBy("total_sales", "desc");

    let totalAdminEarning = 0;
    let totalRestaurantEarning = 0;
    let totalSales = 0;
    let totalOrders = 0;

    const formattedStats = stats.map((s) => {
      const sales = Number(s.total_sales || 0);
      const rate = Number(s.commission_rate || 10);
      const adminPart = (sales * rate) / 100;
      const restPart = sales - adminPart;

      totalSales += sales;
      totalAdminEarning += adminPart;
      totalRestaurantEarning += restPart;
      totalOrders += Number(s.order_count || 0);

      return {
        restaurant_id: s.restaurant_id,
        restaurant_name: s.restaurant_name,
        commission_rate: rate,
        total_sales: sales,
        order_count: Number(s.order_count || 0),
        admin_earning: adminPart,
        restaurant_earning: restPart,
      };
    });

    res.json({
      restaurants: formattedStats,
      summary: {
        total_sales: totalSales,
        total_orders: totalOrders,
        total_admin_earning: totalAdminEarning,
        total_restaurant_earning: totalRestaurantEarning,
      },
    });
  } catch (e) {
    console.error("EARNINGS STATS ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Menu item sales (line items) for delivered / completed orders. */
router.get("/item-reports", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const scope = resolveReportRestaurantIds(req.user, req.query.restaurant_id);
    if (!scope.allowed) {
      return res.json({ items: [] });
    }

    const q = knex("order_items")
      .join("orders", "order_items.order_id", "orders.id")
      .join("restaurants", "orders.restaurant_id", "restaurants.id")
      .leftJoin("menu_items", "order_items.menu_item_id", "menu_items.id")
      .select(
        "restaurants.id as restaurant_id",
        "restaurants.name as restaurant_name",
        knex.raw("COALESCE(menu_items.id, order_items.menu_item_id) as menu_item_id"),
        knex.raw("COALESCE(menu_items.name, order_items.item_name) as item_name"),
        knex.raw("SUM(order_items.quantity::integer) as quantity_sold"),
        knex.raw("COUNT(DISTINCT orders.id) as order_count"),
        knex.raw("SUM(order_items.line_total) as revenue")
      )
      .whereIn("orders.status", ["delivered", "completed"])
      .modify((qb) => {
        applyRestaurantScope(qb, knex, "restaurants.id", scope);
      })
      .groupBy([
        "restaurants.id",
        "restaurants.name",
        knex.raw("COALESCE(menu_items.id, order_items.menu_item_id)"),
        knex.raw("COALESCE(menu_items.name, order_items.item_name)"),
      ])
      .orderBy("revenue", "desc");

    const rows = await q;

    const items = rows.map((r) => ({
      restaurant_id: r.restaurant_id,
      restaurant_name: r.restaurant_name,
      menu_item_id: r.menu_item_id,
      item_name: r.item_name || "Unknown item",
      quantity_sold: Number(r.quantity_sold || 0),
      order_count: Number(r.order_count || 0),
      revenue: Number(r.revenue || 0),
    }));

    res.json({ items });
  } catch (e) {
    console.error("ITEM REPORTS STATS ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Restaurants available in report filters for the current user. */
router.get("/accessible-restaurants", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    let q = knex("restaurants")
      .select("id as restaurant_id", "name as restaurant_name")
      .where("is_active", true)
      .orderBy("name", "asc");

    if (!isSuperAdmin(req.user)) {
      const ids = req.user.restaurantIds || [];
      if (!ids.length) return res.json({ restaurants: [] });
      q = q.whereIn("id", ids);
    }

    const rows = await q;
    res.json({ restaurants: rows });
  } catch (e) {
    console.error("ACCESSIBLE RESTAURANTS ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/** All restaurants with full details — Super Admin only. */
router.get("/all-restaurants", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const roleRow = await knex("user_roles")
      .where({ user_id: req.user.id, role: "super_admin" })
      .first();
    if (!roleRow) return res.status(403).json({ error: "Super admin only." });

    const restaurants = await knex("restaurants")
      .select(
        "id", "name", "slug", "phone", "contact_email", "address",
        "logo_url", "cover_image_url", "twilio_phone_number", "elevenlabs_agent_id",
        "is_active", "created_at", "agent_language", "agent_voice_id",
        "agent_first_message", "agent_system_prompt", "commission_rate",
        "allows_delivery", "allows_pickup"
      )
      .orderBy("created_at", "desc");

    const ids = restaurants.map((r) => r.id);
    const ownerEmailByRestaurant = {};
    const cuisineMap = {};

    if (ids.length) {
      const members = await knex("restaurant_members")
        .select("restaurant_id", "user_id")
        .whereIn("restaurant_id", ids);

      const userIds = [...new Set(members.map((m) => m.user_id))];
      if (userIds.length) {
        const profiles = await knex("profiles").select("id", "email").whereIn("id", userIds);
        const emailByUser = Object.fromEntries(profiles.map((p) => [p.id, p.email]));
        for (const m of members) {
          if (ownerEmailByRestaurant[m.restaurant_id] !== undefined) continue;
          ownerEmailByRestaurant[m.restaurant_id] = emailByUser[m.user_id] ?? "";
        }
      }

      const links = await knex("restaurant_cuisines")
        .select("restaurant_id", "cuisine_id")
        .whereIn("restaurant_id", ids);
      const cuisineIds = [...new Set(links.map((l) => l.cuisine_id))];
      if (cuisineIds.length) {
        const cuisines = await knex("cuisines").select("id", "name").whereIn("id", cuisineIds);
        const nameById = Object.fromEntries(cuisines.map((c) => [c.id, c.name]));
        for (const l of links) {
          if (!cuisineMap[l.restaurant_id]) cuisineMap[l.restaurant_id] = [];
          const name = nameById[l.cuisine_id];
          if (name) cuisineMap[l.restaurant_id].push(name);
        }
      }
    }

    const result = restaurants.map((r) => ({
      ...r,
      owner_login_email: ownerEmailByRestaurant[r.id] ?? "",
      cuisines: cuisineMap[r.id] ?? [],
    }));

    res.json({ restaurants: result });
  } catch (e) {
    console.error("ALL RESTAURANTS ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Top-selling menu items (quantity or revenue). Available to members + super admin. */
router.get("/best-sellers", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const scope = resolveReportRestaurantIds(req.user, req.query.restaurant_id);
    if (!scope.allowed) {
      return res.status(403).json({ error: "Access denied for this restaurant." });
    }

    const limit = parsePositiveInt(req.query.limit, 10, 100);
    const days = parsePositiveInt(req.query.days, 0, 3650);
    const sortBy = req.query.sort === "quantity" ? "quantity" : "revenue";

    const q = knex("order_items")
      .join("orders", "order_items.order_id", "orders.id")
      .join("restaurants", "orders.restaurant_id", "restaurants.id")
      .leftJoin("menu_items", "order_items.menu_item_id", "menu_items.id")
      .leftJoin("menu_categories", "menu_items.category_id", "menu_categories.id")
      .select(
        "restaurants.id as restaurant_id",
        "restaurants.name as restaurant_name",
        knex.raw("COALESCE(menu_items.id, order_items.menu_item_id) as menu_item_id"),
        knex.raw("COALESCE(menu_items.name, order_items.item_name) as item_name"),
        knex.raw("menu_categories.name as category_name"),
        knex.raw("SUM(order_items.quantity::integer) as quantity_sold"),
        knex.raw("COUNT(DISTINCT orders.id) as order_count"),
        knex.raw("SUM(order_items.line_total) as revenue"),
      )
      .whereIn("orders.status", COMPLETED_STATUSES)
      .modify((qb) => {
        applyRestaurantScope(qb, knex, "orders.restaurant_id", scope);
        if (days > 0) {
          qb.where("orders.created_at", ">=", knex.raw("NOW() - ?::interval", [`${days} days`]));
        }
      })
      .groupBy([
        "restaurants.id",
        "restaurants.name",
        knex.raw("COALESCE(menu_items.id, order_items.menu_item_id)"),
        knex.raw("COALESCE(menu_items.name, order_items.item_name)"),
        "menu_categories.name",
      ])
      .orderBy(sortBy === "quantity" ? "quantity_sold" : "revenue", "desc")
      .limit(limit);

    const rows = await q;
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.revenue || 0), 0);

    const items = rows.map((r, idx) => {
      const revenue = Number(r.revenue || 0);
      return {
        rank: idx + 1,
        restaurant_id: r.restaurant_id,
        restaurant_name: r.restaurant_name,
        menu_item_id: r.menu_item_id,
        item_name: r.item_name || "Unknown item",
        category_name: r.category_name || null,
        quantity_sold: Number(r.quantity_sold || 0),
        order_count: Number(r.order_count || 0),
        revenue,
        revenue_share_pct: totalRevenue > 0 ? Math.round((revenue / totalRevenue) * 1000) / 10 : 0,
      };
    });

    res.json({
      items,
      summary: {
        total_revenue: totalRevenue,
        total_units: items.reduce((s, i) => s + i.quantity_sold, 0),
        period_days: days || null,
        sort_by: sortBy,
      },
    });
  } catch (e) {
    console.error("BEST SELLERS STATS ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Stock levels and inventory health per menu item. */
router.get("/inventory", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const scope = resolveReportRestaurantIds(req.user, req.query.restaurant_id);
    if (!scope.allowed) {
      return res.status(403).json({ error: "Access denied for this restaurant." });
    }

    const lowStockThreshold = parsePositiveInt(req.query.low_stock_threshold, 10, 1000);

    const q = knex("menu_items")
      .join("restaurants", "menu_items.restaurant_id", "restaurants.id")
      .leftJoin("menu_categories", "menu_items.category_id", "menu_categories.id")
      .select(
        "restaurants.id as restaurant_id",
        "restaurants.name as restaurant_name",
        "menu_items.id as menu_item_id",
        "menu_items.name as item_name",
        "menu_categories.name as category_name",
        "menu_items.price",
        "menu_items.is_available",
        "menu_items.track_inventory",
        "menu_items.stock_quantity",
        "menu_items.max_order_quantity",
      )
      .modify((qb) => applyRestaurantScope(qb, knex, "menu_items.restaurant_id", scope))
      .orderBy([
        { column: "menu_items.track_inventory", order: "desc" },
        { column: "menu_items.stock_quantity", order: "asc", nulls: "last" },
        { column: "menu_items.name", order: "asc" },
      ]);

    const rows = await q;

    const items = rows.map((r) => {
      const tracked = Boolean(r.track_inventory);
      const stock = r.stock_quantity == null ? null : Number(r.stock_quantity);
      let stock_status = "not_tracked";
      if (tracked) {
        if (stock == null || stock <= 0) stock_status = "out_of_stock";
        else if (stock <= lowStockThreshold) stock_status = "low_stock";
        else stock_status = "in_stock";
      }

      return {
        restaurant_id: r.restaurant_id,
        restaurant_name: r.restaurant_name,
        menu_item_id: r.menu_item_id,
        item_name: r.item_name,
        category_name: r.category_name || null,
        price: Number(r.price || 0),
        is_available: Boolean(r.is_available),
        track_inventory: tracked,
        stock_quantity: stock,
        max_order_quantity: r.max_order_quantity == null ? null : Number(r.max_order_quantity),
        stock_status,
      };
    });

    const trackedItems = items.filter((i) => i.track_inventory);
    const summary = {
      total_items: items.length,
      tracked_items: trackedItems.length,
      in_stock: trackedItems.filter((i) => i.stock_status === "in_stock").length,
      low_stock: trackedItems.filter((i) => i.stock_status === "low_stock").length,
      out_of_stock: trackedItems.filter((i) => i.stock_status === "out_of_stock").length,
      unavailable_items: items.filter((i) => !i.is_available).length,
      low_stock_threshold: lowStockThreshold,
    };

    res.json({ items, summary });
  } catch (e) {
    console.error("INVENTORY REPORT STATS ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Customer spend and repeat-order analytics from orders. */
router.get("/customer-analytics", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const scope = resolveReportRestaurantIds(req.user, req.query.restaurant_id);
    if (!scope.allowed) {
      return res.status(403).json({ error: "Access denied for this restaurant." });
    }

    const days = parsePositiveInt(req.query.days, 0, 3650);
    const limit = parsePositiveInt(req.query.limit, 25, 200);

    const baseOrders = knex("orders")
      .whereNot("status", "cancelled")
      .modify((qb) => {
        applyRestaurantScope(qb, knex, "orders.restaurant_id", scope);
        if (days > 0) {
          qb.where("orders.created_at", ">=", knex.raw("NOW() - ?::interval", [`${days} days`]));
        }
      });

    const customerRows = await baseOrders
      .clone()
      .select(
        "orders.restaurant_id",
        knex.raw("TRIM(orders.customer_phone) as customer_phone"),
        knex.raw("MAX(orders.customer_name) as customer_name"),
        knex.raw("MAX(orders.customer_email) as customer_email"),
        knex.raw("COUNT(*)::int as order_count"),
        knex.raw("SUM(orders.total_amount) as total_spent"),
        knex.raw("AVG(orders.total_amount) as avg_order_value"),
        knex.raw("MAX(orders.created_at) as last_order_at"),
        knex.raw("MIN(orders.created_at) as first_order_at"),
      )
      .whereRaw("TRIM(COALESCE(orders.customer_phone, '')) <> ''")
      .groupBy("orders.restaurant_id", knex.raw("TRIM(orders.customer_phone)"))
      .orderBy("total_spent", "desc")
      .limit(limit);

    const restaurantIds = [...new Set(customerRows.map((r) => r.restaurant_id))];
    const restaurantNameById = new Map();
    if (restaurantIds.length) {
      const rests = await knex("restaurants").select("id", "name").whereIn("id", restaurantIds);
      for (const r of rests) restaurantNameById.set(r.id, r.name);
    }

    const customers = customerRows.map((r) => ({
      restaurant_id: r.restaurant_id,
      restaurant_name: restaurantNameById.get(r.restaurant_id) || "—",
      customer_phone: r.customer_phone,
      customer_name: r.customer_name || "—",
      customer_email: r.customer_email || null,
      order_count: Number(r.order_count || 0),
      total_spent: Number(r.total_spent || 0),
      avg_order_value: Number(r.avg_order_value || 0),
      last_order_at: r.last_order_at,
      first_order_at: r.first_order_at,
      is_repeat: Number(r.order_count || 0) > 1,
    }));

    const [totalsRow] = await baseOrders
      .clone()
      .select(
        knex.raw("COUNT(*)::int as total_orders"),
        knex.raw("SUM(orders.total_amount) as total_revenue"),
        knex.raw("AVG(orders.total_amount) as avg_order_value"),
        knex.raw("COUNT(DISTINCT TRIM(orders.customer_phone))::int as unique_customers"),
      )
      .whereRaw("TRIM(COALESCE(orders.customer_phone, '')) <> ''");

    const repeatRow = await knex
      .from(
        baseOrders
          .clone()
          .select(
            knex.raw("TRIM(orders.customer_phone) as customer_phone"),
            knex.raw("COUNT(*)::int as order_count"),
          )
          .whereRaw("TRIM(COALESCE(orders.customer_phone, '')) <> ''")
          .groupBy(knex.raw("TRIM(orders.customer_phone)"))
          .having(knex.raw("COUNT(*) > 1"))
          .as("repeat_customers"),
      )
      .count("* as cnt");

    const newCustomersSubq = baseOrders
      .clone()
      .select(knex.raw("TRIM(orders.customer_phone) as customer_phone"))
      .select(knex.raw("MIN(orders.created_at) as first_order_at"))
      .whereRaw("TRIM(COALESCE(orders.customer_phone, '')) <> ''")
      .groupBy(knex.raw("TRIM(orders.customer_phone)"))
      .havingRaw("MIN(orders.created_at) >= NOW() - INTERVAL '30 days'")
      .as("new_customers");

    const newCustomersRow = await knex.count("* as cnt").from(newCustomersSubq);

    const totalOrders = Number(totalsRow?.total_orders || 0);
    const uniqueCustomers = Number(totalsRow?.unique_customers || 0);

    res.json({
      customers,
      summary: {
        total_orders: totalOrders,
        total_revenue: Number(totalsRow?.total_revenue || 0),
        avg_order_value: Number(totalsRow?.avg_order_value || 0),
        unique_customers: uniqueCustomers,
        repeat_customers: Number(repeatRow[0]?.cnt || 0),
        new_customers_30d: Number(newCustomersRow[0]?.cnt || 0),
        repeat_rate_pct:
          uniqueCustomers > 0
            ? Math.round((Number(repeatRow[0]?.cnt || 0) / uniqueCustomers) * 1000) / 10
            : 0,
        orders_per_customer:
          uniqueCustomers > 0 ? Math.round((totalOrders / uniqueCustomers) * 10) / 10 : 0,
        period_days: days || null,
      },
    });
  } catch (e) {
    console.error("CUSTOMER ANALYTICS STATS ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});


/** Super Admin Dashboard: monthly revenue trend (last 12 months) + per-restaurant breakdown */
router.get("/superadmin-dashboard", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const roleRow = await knex("user_roles")
      .where({ user_id: req.user.id, role: "super_admin" })
      .first();
    if (!roleRow) return res.status(403).json({ error: "Super admin only." });

    const [
      restaurantsCount,
      totalOrders,
      totalRevenue,
      activeRestaurants,
      totalCustomers,
      pendingOrders,
      monthlyRows,
      restaurantSalesRows,
      orderStatusRows,
    ] = await Promise.all([
      knex("restaurants").count("* as cnt").first(),
      knex("orders").count("* as cnt").first(),
      knex("orders").whereIn("status", ["delivered", "completed"]).sum("total_amount as s").first(),
      knex("restaurants").where("is_active", true).count("* as cnt").first(),
      knex("orders").countDistinct("customer_phone as cnt").first(),
      knex("orders").whereNotIn("status", ["delivered", "completed", "cancelled"]).count("* as cnt").first(),

      // Monthly revenue last 12 months
      knex("orders")
        .whereIn("status", ["delivered", "completed"])
        .where("created_at", ">=", knex.raw("NOW() - INTERVAL '12 months'"))
        .select(
          knex.raw("TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') as month"),
          knex.raw("DATE_TRUNC('month', created_at) as month_date"),
          knex.raw("COUNT(*) as orders"),
          knex.raw("COALESCE(SUM(total_amount), 0) as revenue"),
        )
        .groupByRaw("DATE_TRUNC('month', created_at)")
        .orderByRaw("DATE_TRUNC('month', created_at) ASC"),

      // Per-restaurant sales (top 8)
      knex("orders")
        .join("restaurants", "orders.restaurant_id", "restaurants.id")
        .whereIn("orders.status", ["delivered", "completed"])
        .select(
          "restaurants.name as restaurant_name",
          knex.raw("COUNT(orders.id) as order_count"),
          knex.raw("COALESCE(SUM(orders.total_amount), 0) as revenue"),
        )
        .groupBy("restaurants.id", "restaurants.name")
        .orderBy("revenue", "desc")
        .limit(8),

      // Order status distribution
      knex("orders")
        .select("status", knex.raw("COUNT(*) as cnt"))
        .groupBy("status")
        .orderBy("cnt", "desc"),
    ]);

    res.json({
      summary: {
        total_restaurants: Number(restaurantsCount?.cnt || 0),
        active_restaurants: Number(activeRestaurants?.cnt || 0),
        total_orders: Number(totalOrders?.cnt || 0),
        pending_orders: Number(pendingOrders?.cnt || 0),
        total_revenue: Number(totalRevenue?.s || 0),
        total_customers: Number(totalCustomers?.cnt || 0),
      },
      monthly_revenue: monthlyRows.map((r) => ({
        month: r.month,
        orders: Number(r.orders),
        revenue: Number(r.revenue),
      })),
      restaurant_sales: restaurantSalesRows.map((r) => ({
        name: r.restaurant_name,
        order_count: Number(r.order_count),
        revenue: Number(r.revenue),
      })),
      order_status: orderStatusRows.map((r) => ({
        status: r.status,
        count: Number(r.cnt),
      })),
    });
  } catch (e) {
    console.error("SUPERADMIN DASHBOARD STATS ERROR:", e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
