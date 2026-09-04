import { randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { getKnex } from "../db.js";
import { signToken } from "../auth/tokens.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";

const router = Router();

const MANAGEMENT_ROLES = new Set(["super_admin", "admin", "manager"]);

function requireManagement(req, res, next) {
  const roles = req.user?.roles || [];
  if (!roles.some((r) => MANAGEMENT_ROLES.has(r))) {
    return res.status(403).json({ error: "Management access required" });
  }
  next();
}

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    console.log("Login attempt for:", email);
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    const knex = getKnex();
    const profile = await knex("profiles").whereRaw("lower(email) = lower(?)", [email]).first();
    console.log("Profile found:", !!profile);
    if (!profile?.password_hash) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const ok = await bcrypt.compare(password, profile.password_hash);
    console.log("Password match:", ok);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const roles = await knex("user_roles").where({ user_id: profile.id }).select("role");
    const token = signToken({ sub: profile.id, email: profile.email });
    console.log("Login success for:", email);
    return res.json({
      token,
      user: { id: profile.id, email: profile.email },
      roles: roles.map((r) => r.role),
    });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    return res.status(500).json({ error: e.message || "Login failed" });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { email, password, full_name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    const knex = getKnex();
    const existing = await knex("profiles").whereRaw("lower(email) = lower(?)", [email]).first();
    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }
    const hash = await bcrypt.hash(password, 10);
    const [row] = await knex("profiles")
      .insert({
        id: randomUUID(),
        email,
        full_name: full_name || email.split("@")[0],
        password_hash: hash,
      })
      .returning("*");
    await knex("user_roles").insert({ user_id: row.id, role: "admin" });
    const token = signToken({ sub: row.id, email: row.email });
    return res.json({ token, user: { id: row.id, email: row.email } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Registration failed" });
  }
});

/** Create a profiles row + driver role for a new delivery driver (staff only). */
router.post("/create-driver-user", optionalAuth, requireAuth, requireManagement, async (req, res) => {
  try {
    const { email, password, full_name } = req.body || {};
    const em = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!em || !password) {
      return res.status(400).json({ error: "email and password required" });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: "password must be at least 8 characters" });
    }
    const knex = getKnex();
    const existing = await knex("profiles").whereRaw("lower(email) = lower(?)", [em]).first();
    if (existing) {
      return res.status(400).json({ error: "Email already registered" });
    }
    const hash = await bcrypt.hash(String(password), 10);
    const [row] = await knex("profiles")
      .insert({
        id: randomUUID(),
        email: em,
        full_name: (typeof full_name === "string" && full_name.trim()) || em.split("@")[0],
        password_hash: hash,
      })
      .returning("*");
    await knex("user_roles").insert({ user_id: row.id, role: "driver" });
    return res.status(201).json({ user_id: row.id, email: row.email });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to create driver user" });
  }
});

/** Create / Invite a team member (Platform member for super_admin, or restaurant staff for restaurant admin) */
router.post("/create-team-member", optionalAuth, requireAuth, async (req, res) => {
  try {
    const { email, password, full_name, role, restaurant_id } = req.body || {};
    const em = typeof email === "string" ? email.trim().toLowerCase() : "";
    const rid = restaurant_id;
    const isSuperAdmin =
      req.user?.roles?.includes("super_admin") ||
      req.user?.role === "super_admin";

    if (!em || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const knex = getKnex();

    // 1. Case A: Super Admin creating a platform team member (no restaurant_id)
    if (!rid && isSuperAdmin) {
      let platformRole = (role || "admin").toLowerCase();
      if (platformRole !== "super_admin" && platformRole !== "admin") {
        platformRole = "admin";
      }

      let profile = await knex("profiles").whereRaw("lower(email) = lower(?)", [em]).first();
      const hash = await bcrypt.hash(String(password), 10);

      if (!profile) {
        const [newProf] = await knex("profiles")
          .insert({
            id: randomUUID(),
            email: em,
            full_name: (typeof full_name === "string" && full_name.trim()) || em.split("@")[0],
            password_hash: hash,
            status: "available",
          })
          .returning("*");
        profile = newProf;

        await knex("user_roles").insert({ user_id: profile.id, role: platformRole });
      } else {
        await knex("profiles").where({ id: profile.id }).update({
          password_hash: hash,
          full_name: full_name?.trim() || profile.full_name,
        });
        await knex("user_roles").where({ user_id: profile.id }).del();
        await knex("user_roles").insert({ user_id: profile.id, role: platformRole });
      }

      return res.status(201).json({
        success: true,
        user_id: profile.id,
        email: profile.email,
        role: platformRole,
      });
    }

    // 2. Case B: Restaurant Admin creating a restaurant staff member
    if (!rid) {
      return res.status(400).json({ error: "Restaurant ID is required for restaurant staff" });
    }

    let memberRole = (role || "manager").toLowerCase();
    // Only 1 Admin allowed per restaurant. Staff members are Manager, Kitchen, or Cashier.
    if (memberRole === "admin" || memberRole === "owner") {
      memberRole = "manager";
    }

    // Verify restaurant
    const rest = await knex("restaurants").where({ id: rid }).first();
    if (!rest) {
      return res.status(404).json({ error: "Restaurant not found" });
    }

    // Check or create profile
    let profile = await knex("profiles").whereRaw("lower(email) = lower(?)", [em]).first();
    if (!profile) {
      const hash = await bcrypt.hash(String(password), 10);
      const [newProf] = await knex("profiles")
        .insert({
          id: randomUUID(),
          email: em,
          full_name: (typeof full_name === "string" && full_name.trim()) || em.split("@")[0],
          password_hash: hash,
          status: "available",
        })
        .returning("*");
      profile = newProf;

      await knex("user_roles").insert({ user_id: profile.id, role: "manager" });
    } else {
      if (password) {
        const hash = await bcrypt.hash(String(password), 10);
        await knex("profiles").where({ id: profile.id }).update({
          password_hash: hash,
          full_name: full_name?.trim() || profile.full_name,
        });
      }
    }

    // Add or update restaurant_members
    const existingMembership = await knex("restaurant_members")
      .where({ user_id: profile.id, restaurant_id: rid })
      .first();

    if (existingMembership) {
      await knex("restaurant_members")
        .where({ id: existingMembership.id })
        .update({ member_role: memberRole });
    } else {
      await knex("restaurant_members").insert({
        id: randomUUID(),
        user_id: profile.id,
        restaurant_id: rid,
        member_role: memberRole,
      });
    }

    return res.status(201).json({
      success: true,
      user_id: profile.id,
      email: profile.email,
      restaurant_id: rid,
      member_role: memberRole,
    });
  } catch (e) {
    console.error("create-team-member error:", e);
    return res.status(500).json({ error: e.message || "Failed to create team member" });
  }
});

/** Delete team member membership or platform user */
router.delete("/delete-team-member/:id", optionalAuth, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const knex = getKnex();
    const isSuperAdmin =
      req.user?.roles?.includes("super_admin") ||
      req.user?.role === "super_admin";

    // 1. Try deleting from restaurant_members
    const delCount = await knex("restaurant_members").where({ id }).del();

    // 2. If not a restaurant_members row and requester is super_admin, check if it's a user profile id
    if (!delCount && isSuperAdmin) {
      // Protect super admin themselves from accidental self-delete
      if (id === req.user.id) {
        return res.status(400).json({ error: "Cannot delete your own super admin account" });
      }
      await knex("restaurant_members").where({ user_id: id }).del();
      await knex("user_roles").where({ user_id: id }).del();
      await knex("profiles").where({ id }).del();
    }

    return res.json({ success: true });
  } catch (e) {
    console.error("delete-team-member error:", e);
    return res.status(500).json({ error: e.message || "Failed to delete team member" });
  }
});

/** Update team member role */
router.put("/update-team-member-role", optionalAuth, requireAuth, async (req, res) => {
  try {
    const { id, member_role } = req.body || {};
    if (!id || !member_role) {
      return res.status(400).json({ error: "id and member_role are required" });
    }

    let roleToSet = member_role.toLowerCase();
    if (roleToSet === "admin" || roleToSet === "owner") {
      return res.status(400).json({
        error: "This restaurant already has an Admin. You can assign Manager, Kitchen Staff, or Cashier.",
      });
    }

    const knex = getKnex();
    await knex("restaurant_members").where({ id }).update({ member_role: roleToSet });
    return res.json({ success: true });
  } catch (e) {
    console.error("update-team-member-role error:", e);
    return res.status(500).json({ error: e.message || "Failed to update team member role" });
  }
});

router.get("/me", optionalAuth, requireAuth, async (req, res) => {
  try {
    const knex = getKnex();
    const profile = await knex("profiles").where({ id: req.user.id }).first();
    const roles = await knex("user_roles").where({ user_id: req.user.id }).select("role");
    return res.json({
      user: { id: req.user.id, email: profile?.email },
      profile,
      roles: roles.map((r) => r.role),
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

/** Authenticated user changes their own password (current + new). */
router.post("/change-password", optionalAuth, requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};
    const current = typeof current_password === "string" ? current_password : "";
    const next = typeof new_password === "string" ? new_password : "";

    if (!current || !next) {
      return res.status(400).json({ error: "current_password and new_password are required" });
    }
    if (next.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    if (current === next) {
      return res.status(400).json({ error: "New password must be different from the current password" });
    }

    const knex = getKnex();
    const profile = await knex("profiles").where({ id: req.user.id }).first();
    if (!profile?.password_hash) {
      return res.status(400).json({ error: "Password login is not set up for this account" });
    }

    const ok = await bcrypt.compare(current, profile.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hash = await bcrypt.hash(next, 10);
    await knex("profiles").where({ id: req.user.id }).update({
      password_hash: hash,
      updated_at: knex.fn.now(),
    });

    return res.json({ success: true });
  } catch (e) {
    console.error("change-password error:", e);
    return res.status(500).json({ error: e.message || "Failed to change password" });
  }
});

/** Demo forgot-password: every account uses OTP 123456 (no email send). */
const DEMO_RESET_OTP = String(process.env.DEMO_RESET_OTP || "123456").trim();
/** email → requestedAt ms */
const pendingPasswordResets = new Map();
const RESET_WINDOW_MS = 30 * 60 * 1000;

router.post("/forgot-password", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const knex = getKnex();
    const profile = await knex("profiles").whereRaw("lower(email) = lower(?)", [email]).first();

    // Always respond the same way to avoid account enumeration; only mark pending when found.
    if (profile) {
      pendingPasswordResets.set(email, Date.now());
    }

    return res.json({
      success: true,
      message: "If an account exists for that email, you can continue with the demo OTP.",
      // Demo mode: always expose OTP for local/testing convenience
      demo_otp: DEMO_RESET_OTP,
    });
  } catch (e) {
    console.error("forgot-password error:", e);
    return res.status(500).json({ error: e.message || "Failed to start password reset" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const otp = typeof req.body?.otp === "string" ? req.body.otp.trim() : String(req.body?.otp || "").trim();
    const newPassword = typeof req.body?.new_password === "string" ? req.body.new_password : "";

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "email, otp, and new_password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    if (otp !== DEMO_RESET_OTP) {
      return res.status(401).json({ error: "Invalid OTP" });
    }

    const requestedAt = pendingPasswordResets.get(email);
    if (!requestedAt || Date.now() - requestedAt > RESET_WINDOW_MS) {
      return res.status(400).json({
        error: "Reset not started or expired. Request a new OTP first.",
      });
    }

    const knex = getKnex();
    const profile = await knex("profiles").whereRaw("lower(email) = lower(?)", [email]).first();
    if (!profile) {
      return res.status(404).json({ error: "Account not found" });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await knex("profiles").where({ id: profile.id }).update({
      password_hash: hash,
      updated_at: knex.fn.now(),
    });
    pendingPasswordResets.delete(email);

    return res.json({ success: true, message: "Password updated. You can sign in with the new password." });
  } catch (e) {
    console.error("reset-password error:", e);
    return res.status(500).json({ error: e.message || "Failed to reset password" });
  }
});

export default router;
