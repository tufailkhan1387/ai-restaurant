import { verifyToken } from "../auth/tokens.js";
import { getKnex } from "../db.js";

export async function optionalAuth(req, _res, next) {
  try {
    const h = req.headers.authorization || "";
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
      knex("restaurant_members").where({ user_id: decoded.sub }).select("restaurant_id", "member_role"),
      knex("drivers").where({ user_id: decoded.sub }).first(),
    ]);

    const safeRoles = (roles || []).map((r) => r.role);
    const safeMemberships = memberships || [];
    const directMemberIds = safeMemberships.map((m) => m.restaurant_id).filter(Boolean);
    const ownedParentIds = safeMemberships
      .filter((m) => m.member_role === "owner" || m.member_role === "admin")
      .map((m) => m.restaurant_id)
      .filter(Boolean);

    let branchIds = [];
    if (ownedParentIds.length) {
      const branches = await knex("restaurants")
        .whereIn("parent_restaurant_id", ownedParentIds)
        .select("id");
      branchIds = (branches || []).map((b) => b.id);
    }

    const fromDriver = [];
    if (driverRow?.id) {
      const links = await knex("driver_restaurants").where({ driver_id: driverRow.id }).select("restaurant_id");
      for (const l of (links || [])) fromDriver.push(l.restaurant_id);
      if (driverRow.restaurant_id) fromDriver.push(driverRow.restaurant_id);
    }
    const restaurantIds = [...new Set([...directMemberIds, ...branchIds, ...fromDriver])];
    req.user = {
      id: decoded.sub,
      email: profile?.email ?? null,
      roles: safeRoles,
      restaurantIds,
      directMemberIds,
      ownedParentIds,
      memberships: safeMemberships,
    };
    next();
  } catch (e) {
    console.error("Auth middleware error:", e);
    req.user = null;
    next();
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
