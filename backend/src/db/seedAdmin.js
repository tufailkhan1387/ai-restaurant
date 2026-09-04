import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

/**
 * Idempotently seeds the super admin / admin user (default: admin@admin.com / 11223344)
 * with super_admin and admin roles, and links to the default restaurant.
 */
export async function seedAdminUser(connectionString) {
  const url = connectionString || process.env.DATABASE_URL;
  if (!url || typeof url !== "string" || !url.trim()) {
    console.warn("[seedAdmin] DATABASE_URL not set — skipping admin seed.");
    return null;
  }

  const email = (process.env.ADMIN_EMAIL || "admin@admin.com").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "11223344";

  const client = new pg.Client({ connectionString: url.trim() });
  await client.connect();

  try {
    const hash = await bcrypt.hash(password, 10);

    // 1. Ensure profile exists and password_hash is set
    const res = await client.query("SELECT id, email, full_name FROM profiles WHERE lower(email) = lower($1)", [email]);
    let userId;

    if (res.rowCount === 0) {
      userId = randomUUID();
      await client.query(
        `INSERT INTO profiles (id, email, full_name, password_hash, status)
         VALUES ($1, $2, $3, $4, 'available')`,
        [userId, email, "Super Admin", hash]
      );
      console.log(`[seedAdmin] Created admin profile: ${email} (${userId})`);
    } else {
      userId = res.rows[0].id;
      await client.query(
        `UPDATE profiles 
         SET password_hash = $1, 
             full_name = COALESCE(full_name, 'Super Admin'),
             updated_at = NOW()
         WHERE id = $2`,
        [hash, userId]
      );
      console.log(`[seedAdmin] Updated admin password for: ${email} (${userId})`);
    }

    // 2. Ensure roles: super_admin & admin
    await client.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, 'super_admin')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId]
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, 'admin')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId]
    );
    console.log(`[seedAdmin] Ensured roles (super_admin, admin) for ${email}`);

    // 3. Ensure a default restaurant exists if none found
    const restCheck = await client.query("SELECT id, name FROM restaurants ORDER BY created_at ASC LIMIT 1");
    let restaurantId;
    if (restCheck.rowCount === 0) {
      restaurantId = randomUUID();
      await client.query(
        `INSERT INTO restaurants (id, name, slug, phone, is_active)
         VALUES ($1, 'Royal Restaurant', 'royal-restaurant', '+123456789', true)`,
        [restaurantId]
      );
      await client.query(
        `INSERT INTO restaurant_settings (restaurant_id, name, currency, is_open)
         VALUES ($1, 'Royal Restaurant', 'USD', true)
         ON CONFLICT (id) DO NOTHING`,
        [restaurantId]
      );
      console.log(`[seedAdmin] Created default restaurant: Royal Restaurant (${restaurantId})`);
    } else {
      restaurantId = restCheck.rows[0].id;
    }

    // 4. Ensure admin is linked to the restaurant as owner
    await client.query(
      `INSERT INTO restaurant_members (restaurant_id, user_id, member_role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (restaurant_id, user_id) DO UPDATE SET member_role = 'owner'`,
      [restaurantId, userId]
    );
    console.log(`[seedAdmin] Linked ${email} to restaurant (${restaurantId}) as owner`);

    return { userId, email, restaurantId };
  } finally {
    await client.end();
  }
}
