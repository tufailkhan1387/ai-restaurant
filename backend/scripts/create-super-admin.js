/**
 * Creates or updates a super_admin user (profiles + user_roles).
 * Requires DATABASE_URL in backend/.env (or environment).
 *
 * Usage: npm run db:seed:admin --prefix backend
 *        (alias: npm run seed:super-admin --prefix backend)
 *
 * Override defaults:
 *   ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=secret npm run seed:super-admin --prefix backend
 */
import "../src/loadEnv.js";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import knex from "knex";

const EMAIL = (process.env.ADMIN_EMAIL || "admin@admin.com").trim().toLowerCase();
const PASSWORD = process.env.ADMIN_PASSWORD || "11223344";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL in backend/.env (or the environment).");
    process.exit(1);
  }

  const k = knex({ client: "pg", connection: url });

  try {
    const hash = await bcrypt.hash(PASSWORD, 10);
    let profile = await k("profiles").whereRaw("lower(email) = lower(?)", [EMAIL]).first();

    if (!profile) {
      const [row] = await k("profiles")
        .insert({
          id: randomUUID(),
          email: EMAIL,
          full_name: "Super Admin",
          password_hash: hash,
        })
        .returning("*");
      profile = row;
      console.log("Created profile:", profile.id);
    } else {
      await k("profiles").where({ id: profile.id }).update({
        password_hash: hash,
        full_name: profile.full_name || "Super Admin",
      });
      console.log("Updated profile password:", profile.id);
    }

    await k("user_roles").where({ user_id: profile.id }).delete();
    await k("user_roles").insert({ user_id: profile.id, role: "super_admin" });
    console.log("Assigned role: super_admin");
    console.log("Done. Sign in with:", EMAIL);
  } finally {
    await k.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
