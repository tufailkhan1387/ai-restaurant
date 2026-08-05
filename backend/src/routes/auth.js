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
