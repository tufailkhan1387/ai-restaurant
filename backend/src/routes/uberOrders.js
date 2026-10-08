import { Router } from "express";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { listStoredUberOrders } from "../uber/orderService.js";
import { backfillUberOrders } from "../uber/backfill.js";
import { listMarketplaceOrders } from "../integrations/orderService.js";
import { syncAllMarketplaces } from "../integrations/marketplaceSync.js";

const router = Router();

const SOURCES = new Set(["uber", "doordash", "deliveroo", "justeat"]);

/**
 * GET /api/orders — kitchen + marketplace orders mixed, newest first.
 * Query: source=uber|doordash|deliveroo|justeat, status, page, pageSize
 */
router.get("/orders", optionalAuth, requireAuth, async (req, res) => {
  try {
    const source = typeof req.query.source === "string" ? req.query.source.toLowerCase() : undefined;
    if (source && !SOURCES.has(source)) {
      return res.status(400).json({ error: "source must be uber, doordash, deliveroo, or justeat" });
    }
    const restaurantIds = req.user?.roles?.includes("super_admin")
      ? undefined
      : req.user?.restaurantIds || [];
    const result = await listMarketplaceOrders({
      source,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      page: req.query.page,
      pageSize: req.query.pageSize || req.query.limit,
      restaurantIds,
    });
    res.json(result);
  } catch (e) {
    console.error("GET /api/orders failed:", e);
    res.status(500).json({ error: e.message || "Failed to list orders" });
  }
});

/**
 * GET /api/uber/orders — list stored Uber Eats orders (raw uber_orders table).
 */
router.get("/uber/orders", optionalAuth, requireAuth, async (req, res) => {
  try {
    const result = await listStoredUberOrders({
      page: req.query.page,
      pageSize: req.query.pageSize || req.query.limit,
      state: typeof req.query.state === "string" ? req.query.state : undefined,
      storeId: typeof req.query.storeId === "string" ? req.query.storeId : undefined,
    });
    res.json(result);
  } catch (e) {
    console.error("GET /api/uber/orders failed:", e);
    res.status(500).json({ error: e.message || "Failed to list orders" });
  }
});

/** POST /api/uber/sync — pull real Uber orders and mix into kitchen All Orders. */
router.post("/uber/sync", optionalAuth, requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await backfillUberOrders({
      storeId: body.storeId || req.query.storeId,
      start: body.start,
      end: body.end,
      fallbackCreated: Boolean(body.fallbackCreated),
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("POST /api/uber/sync failed:", e);
    res.status(e.status && e.status < 500 ? e.status : 500).json({
      error: e.message || "Uber sync failed",
    });
  }
});

/**
 * POST /api/marketplace/sync — Uber + DoorDash + Deliveroo (+ Just Eat) in one call.
 * Syncs every store linked to each platform app — not one restaurant at a time.
 */
router.post("/marketplace/sync", optionalAuth, requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const result = await syncAllMarketplaces({
      storeId: body.storeId || req.query.storeId,
      start: body.start,
      end: body.end,
      fallbackCreated: Boolean(body.fallbackCreated),
    });
    res.json(result);
  } catch (e) {
    console.error("POST /api/marketplace/sync failed:", e);
    res.status(500).json({ error: e.message || "Marketplace sync failed" });
  }
});

export default router;

