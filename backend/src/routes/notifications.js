import { Router } from "express";
import { getKnex } from "../db.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { randomUUID } from "crypto";

const router = Router();

/**
 * Helper to dispatch in-app notifications
 */
export async function createNotification(knex, {
  restaurant_id,
  user_id = null,
  order_id = null,
  type = "info",
  title,
  message,
  metadata = {}
}) {
  try {
    const id = randomUUID();
    const [notif] = await knex("notifications")
      .insert({
        id,
        restaurant_id: restaurant_id || null,
        user_id: user_id || null,
        order_id: order_id || null,
        type,
        title,
        message,
        metadata: JSON.stringify(metadata || {}),
        is_read: false,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return notif;
  } catch (err) {
    console.error("Failed to create notification:", err);
    return null;
  }
}

/**
 * GET /api/notifications
 * Fetch notifications for caller's active restaurant or user
 */
router.get("/", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const { restaurant_id, limit = 50, unread_only } = req.query;

    let q = knex("notifications")
      .orderBy("created_at", "desc")
      .limit(Math.min(parseInt(limit, 10) || 50, 100));

    if (restaurant_id) {
      q = q.where("restaurant_id", restaurant_id);
    } else if (req.user?.restaurantIds?.length) {
      q = q.whereIn("restaurant_id", req.user.restaurantIds);
    } else {
      q = q.where("user_id", req.user.id);
    }

    if (unread_only === "true" || unread_only === "1") {
      q = q.where("is_read", false);
    }

    const notifications = await q;

    // Count unread
    let unreadCountQ = knex("notifications").where("is_read", false);
    if (restaurant_id) {
      unreadCountQ = unreadCountQ.where("restaurant_id", restaurant_id);
    } else if (req.user?.restaurantIds?.length) {
      unreadCountQ = unreadCountQ.whereIn("restaurant_id", req.user.restaurantIds);
    } else {
      unreadCountQ = unreadCountQ.where("user_id", req.user.id);
    }

    const [{ count: unreadCount }] = await unreadCountQ.count("* as count");

    return res.json({
      notifications,
      unread_count: Number(unreadCount || 0),
    });
  } catch (err) {
    console.error("GET /notifications error:", err);
    return res.status(500).json({ error: err.message || "Failed to fetch notifications" });
  }
});

/**
 * POST /api/notifications/:id/read
 * Mark a single notification as read
 */
router.post("/:id/read", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const { id } = req.params;

    await knex("notifications")
      .where({ id })
      .update({ is_read: true, updated_at: new Date() });

    return res.json({ success: true, id });
  } catch (err) {
    console.error("POST /notifications/:id/read error:", err);
    return res.status(500).json({ error: err.message || "Failed to mark notification as read" });
  }
});

/**
 * POST /api/notifications/read-all
 * Mark all notifications as read for current restaurant / user
 */
router.post("/read-all", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const { restaurant_id } = req.body;

    let q = knex("notifications").where("is_read", false);
    if (restaurant_id) {
      q = q.where("restaurant_id", restaurant_id);
    } else if (req.user?.restaurantIds?.length) {
      q = q.whereIn("restaurant_id", req.user.restaurantIds);
    } else {
      q = q.where("user_id", req.user.id);
    }

    await q.update({ is_read: true, updated_at: new Date() });

    return res.json({ success: true });
  } catch (err) {
    console.error("POST /notifications/read-all error:", err);
    return res.status(500).json({ error: err.message || "Failed to mark all notifications as read" });
  }
});

export default router;
