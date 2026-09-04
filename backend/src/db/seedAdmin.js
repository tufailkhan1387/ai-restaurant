import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

/**
 * Idempotently seeds:
 * 1. Platform Super Admin: admin@admin.com / 11223344 (role: super_admin)
 *    - Full platform control over all restaurants, earnings, and global management.
 * 2. Royal Restaurant Dedicated Admin: royal@gmail.com / 11223344 (role: admin, member: owner)
 *    - Isolated restaurant-level control (orders, menu, settings) exactly like Yasir Broast and Bundu Khan.
 */
export async function seedAdminUser(connectionString) {
  const url = connectionString || process.env.DATABASE_URL;
  if (!url || typeof url !== "string" || !url.trim()) {
    console.warn("[seedAdmin] DATABASE_URL not set — skipping admin seed.");
    return null;
  }

  const superAdminEmail = (process.env.ADMIN_EMAIL || "admin@admin.com").trim().toLowerCase();
  const superAdminPassword = process.env.ADMIN_PASSWORD || "11223344";

  const royalAdminEmail = "royal@gmail.com";
  const royalAdminPassword = "11223344";

  const client = new pg.Client({ connectionString: url.trim() });
  await client.connect();

  try {
    const superAdminHash = await bcrypt.hash(superAdminPassword, 10);
    const royalAdminHash = await bcrypt.hash(royalAdminPassword, 10);

    // 1. Ensure Royal Restaurant exists
    let restCheck = await client.query("SELECT id, name FROM restaurants WHERE slug = 'royal-restaurant' LIMIT 1");
    let royalRestaurantId;
    if (restCheck.rowCount === 0) {
      // Check first restaurant
      const anyRest = await client.query("SELECT id, name FROM restaurants ORDER BY created_at ASC LIMIT 1");
      if (anyRest.rowCount > 0) {
        royalRestaurantId = anyRest.rows[0].id;
      } else {
        royalRestaurantId = randomUUID();
        await client.query(
          `INSERT INTO restaurants (id, name, slug, phone, is_active)
           VALUES ($1, 'Royal Restaurant', 'royal-restaurant', '+123456789', true)`,
          [royalRestaurantId]
        );
        await client.query(
          `INSERT INTO restaurant_settings (restaurant_id, name, currency, is_open)
           VALUES ($1, 'Royal Restaurant', 'USD', true)
           ON CONFLICT (id) DO NOTHING`,
          [royalRestaurantId]
        );
        console.log(`[seedAdmin] Created Royal Restaurant (${royalRestaurantId})`);
      }
    } else {
      royalRestaurantId = restCheck.rows[0].id;
    }

    // 2. Setup Super Admin (admin@admin.com)
    let superProfile = await client.query("SELECT id FROM profiles WHERE lower(email) = lower($1)", [superAdminEmail]);
    let superAdminId;
    if (superProfile.rowCount === 0) {
      superAdminId = randomUUID();
      await client.query(
        `INSERT INTO profiles (id, email, full_name, password_hash, status)
         VALUES ($1, $2, 'Super Admin', $3, 'available')`,
        [superAdminId, superAdminEmail, superAdminHash]
      );
      console.log(`[seedAdmin] Created Super Admin profile: ${superAdminEmail}`);
    } else {
      superAdminId = superProfile.rows[0].id;
      await client.query(
        `UPDATE profiles 
         SET password_hash = $1, 
             full_name = COALESCE(full_name, 'Super Admin'),
             updated_at = NOW()
         WHERE id = $2`,
        [superAdminHash, superAdminId]
      );
      console.log(`[seedAdmin] Updated Super Admin password: ${superAdminEmail}`);
    }

    // Assign role 'super_admin'
    await client.query("DELETE FROM user_roles WHERE user_id = $1", [superAdminId]);
    await client.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, 'super_admin')`,
      [superAdminId]
    );
    // Ensure Super Admin is not listed as a restaurant member for any restaurant
    await client.query("DELETE FROM restaurant_members WHERE user_id = $1", [superAdminId]);
    console.log(`[seedAdmin] Assigned role super_admin to ${superAdminEmail}`);

    // 3. Setup Dedicated Royal Restaurant Admin (royal@gmail.com)
    let royalProfile = await client.query("SELECT id FROM profiles WHERE lower(email) = lower($1)", [royalAdminEmail]);
    let royalAdminId;
    if (royalProfile.rowCount === 0) {
      royalAdminId = randomUUID();
      await client.query(
        `INSERT INTO profiles (id, email, full_name, password_hash, status)
         VALUES ($1, $2, 'Royal Restaurant Admin', $3, 'available')`,
        [royalAdminId, royalAdminEmail, royalAdminHash]
      );
      console.log(`[seedAdmin] Created Royal Restaurant Admin profile: ${royalAdminEmail}`);
    } else {
      royalAdminId = royalProfile.rows[0].id;
      await client.query(
        `UPDATE profiles 
         SET password_hash = $1, 
             full_name = 'Royal Restaurant Admin',
             updated_at = NOW()
         WHERE id = $2`,
        [royalAdminHash, royalAdminId]
      );
      console.log(`[seedAdmin] Updated Royal Restaurant Admin password: ${royalAdminEmail}`);
    }

    // Assign role 'admin' only (isolated to Royal Restaurant, exactly like Yasir Broast / Bundu Khan)
    await client.query("DELETE FROM user_roles WHERE user_id = $1", [royalAdminId]);
    await client.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, 'admin')`,
      [royalAdminId]
    );

    // Link royal@gmail.com as owner of Royal Restaurant
    await client.query(
      `INSERT INTO restaurant_members (restaurant_id, user_id, member_role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (restaurant_id, user_id) DO UPDATE SET member_role = 'owner'`,
      [royalRestaurantId, royalAdminId]
    );
    console.log(`[seedAdmin] Assigned role 'admin' to ${royalAdminEmail} and linked to Royal Restaurant as owner`);

    return {
      superAdmin: { email: superAdminEmail, role: "super_admin" },
      royalAdmin: { email: royalAdminEmail, role: "admin", restaurantId: royalRestaurantId },
    };
  } finally {
    await client.end();
  }
}
