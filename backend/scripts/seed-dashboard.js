/**
 * Sample data for a first restaurant: membership, categories, items, deal.
 * Idempotent where possible (reuses by slug / first row).
 *
 * Prerequisite: run migrations (`npm run db:migrate`) and create admin (`npm run db:seed:admin`).
 *
 * Usage:
 *   npm run db:seed --prefix backend
 *
 * Env (optional):
 *   ADMIN_EMAIL=admin@admin.com   — must match the user created by db:seed:admin
 */
import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@admin.com").trim().toLowerCase();

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url || typeof url !== "string" || !url.trim()) {
    console.error("Set DATABASE_URL in .env or the environment.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url.trim() });
  await client.connect();
  console.log("Connected to DB for seeding…");

  try {
    const userRes = await client.query("SELECT id FROM profiles WHERE lower(email) = lower($1)", [ADMIN_EMAIL]);
    if (userRes.rowCount === 0) {
      throw new Error(
        `No profile for ${ADMIN_EMAIL}. Run: npm run db:seed:admin --prefix backend (same ADMIN_EMAIL).`,
      );
    }
    const adminId = userRes.rows[0].id;

    const existingRes = await client.query("SELECT id FROM restaurants WHERE slug = 'royal-restaurant'");
    let restaurantId;
    if (existingRes.rowCount > 0) {
      restaurantId = existingRes.rows[0].id;
      console.log("Restaurant already exists, reusing ID:", restaurantId);
    } else {
      restaurantId = randomUUID();
      await client.query(
        `INSERT INTO restaurants (id, name, slug, phone, is_active)
         VALUES ($1, $2, $3, $4, $5)`,
        [restaurantId, "Royal Restaurant", "royal-restaurant", "+123456789", true],
      );
      console.log("Restaurant created:", restaurantId);
    }

    await client.query(
      `INSERT INTO restaurant_members (restaurant_id, user_id, member_role)
       VALUES ($1, $2, $3)
       ON CONFLICT (restaurant_id, user_id) DO NOTHING`,
      [restaurantId, adminId, "owner"],
    );

    const existingCat = await client.query(
      "SELECT id FROM menu_categories WHERE restaurant_id = $1 LIMIT 1",
      [restaurantId],
    );
    let catId;
    if (existingCat.rowCount > 0) {
      catId = existingCat.rows[0].id;
      console.log("Menu category already exists, reusing.");
      // Ensure baseline menu items exist (idempotent inserts)
      const ensureItems = ["Beef Burger", "Margherita Pizza", "Zinger Burger"];
      for (const name of ensureItems) {
        const exists = await client.query(
          "SELECT id FROM menu_items WHERE restaurant_id = $1 AND lower(name) = lower($2) LIMIT 1",
          [restaurantId, name],
        );
        if (exists.rowCount === 0) {
          const price = name === "Margherita Pizza" ? 12.5 : name === "Zinger Burger" ? 13.99 : 15.99;
          await client.query(
            `INSERT INTO menu_items (restaurant_id, category_id, name, price, is_available)
             VALUES ($1, $2, $3, $4, $5)`,
            [restaurantId, catId, name, price, true],
          );
          console.log("Menu item created:", name);
        }
      }
    } else {
      catId = randomUUID();
      await client.query(`INSERT INTO menu_categories (id, restaurant_id, name) VALUES ($1, $2, $3)`, [
        catId,
        restaurantId,
        "Fast Food",
      ]);
      await client.query(
        `INSERT INTO menu_items (restaurant_id, category_id, name, price, is_available)
         VALUES ($1, $2, $3, $4, $5), ($1, $2, $6, $7, $8), ($1, $2, $9, $10, $11)`,
        [restaurantId, catId, "Beef Burger", 15.99, true, "Margherita Pizza", 12.5, true, "Zinger Burger", 13.99, true],
      );
      console.log("Menu items created.");
    }

    const existingDeal = await client.query("SELECT id FROM deals WHERE restaurant_id = $1 LIMIT 1", [
      restaurantId,
    ]);
    if (existingDeal.rowCount === 0) {
      await client.query(
        `INSERT INTO deals (restaurant_id, name, description, price, original_price, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [restaurantId, "Lunch Special", "Buy 1 Get 1 Free", 25.0, 30.0, true],
      );
      console.log("Deal created.");
    } else {
      console.log("Deal already exists, skipping.");
    }

    const counts = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM restaurants) AS restaurants,
        (SELECT COUNT(*) FROM menu_items) AS menu_items,
        (SELECT COUNT(*) FROM deals) AS deals
    `);
    console.log("Final DB counts:", counts.rows[0]);
    console.log("Dashboard seed finished.");
  } finally {
    await client.end();
  }
}

seed().catch((e) => {
  console.error("Seeding failed:", e.message || e);
  process.exit(1);
});
