import { verifyToken } from "../auth/tokens.js";
import { getKnex } from "../db.js";

export async function optionalAuth(req, _res, next) {
  try {
    const h = req.headers.authorization || "";
    console.log("Auth Header:", h);
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) {
      req.user = null;
      return next();
    }
    const decoded = verifyToken(token);
    if (!decoded?.sub) {
      req.user = null;
      return next();
    }
    const knex = getKnex();
    const [profile, roles, memberships, driverRow] = await Promise.all([
      knex("profiles").where({ id: decoded.sub }).first(),
      knex("user_roles").where({ user_id: decoded.sub }).select("role"),
      knex("restaurant_members").where({ user_id: decoded.sub }).select("restaurant_id"),
      knex("drivers").where({ user_id: decoded.sub }).first(),
    ]);
    const fromMembers = memberships.map((m) => m.restaurant_id);
    const fromDriver = [];
    if (driverRow?.id) {
      const links = await knex("driver_restaurants").where({ driver_id: driverRow.id }).select("restaurant_id");
      for (const l of links) fromDriver.push(l.restaurant_id);
      if (driverRow.restaurant_id) fromDriver.push(driverRow.restaurant_id);
    }
    const restaurantIds = [...new Set([...fromMembers, ...fromDriver])];
    req.user = {
      id: decoded.sub,
      email: profile?.email ?? null,
      roles: roles.map((r) => r.role),
      restaurantIds,
    };
    next();
  } catch (e) {
    console.error("Auth middleware error:", e);
    next(e);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user?.id) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

export function requireSuperAdmin(req, res, next) {
  if (!req.user?.roles?.includes("super_admin")) {
    return res.status(403).json({ error: "Forbidden — super admin only" });
  }
  next();
}
