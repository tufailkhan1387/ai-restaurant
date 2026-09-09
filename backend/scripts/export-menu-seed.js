/**
 * Export current restaurant menu, categories, sub-categories, add-ons,
 * variants (sizes & flavors), deals, and coupons into JSON for seeding on live/production.
 *
 * Usage:
 *   node backend/scripts/export-menu-seed.js
 */
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    console.error("❌ Set DATABASE_URL in backend/.env");
    process.exit(1);
  }

  const client = new Client({ connectionString: url.trim() });
  await client.connect();

  try {
    const restaurantSlug = process.env.RESTAURANT_SLUG || "royal-restaurant";
    const restRes = await client.query("SELECT * FROM restaurants WHERE slug = $1 LIMIT 1", [restaurantSlug]);
    if (restRes.rowCount === 0) {
      console.error(`❌ Restaurant with slug "${restaurantSlug}" not found.`);
      process.exit(1);
    }
    const restaurant = restRes.rows[0];
    const rId = restaurant.id;

    console.log(`📦 Exporting menu for: ${restaurant.name} (${restaurant.slug})...`);

    const categories = await client.query("SELECT * FROM menu_categories WHERE restaurant_id = $1 ORDER BY sort_order", [rId]);
    const subCategories = await client.query("SELECT * FROM menu_sub_categories WHERE restaurant_id = $1 ORDER BY sort_order", [rId]);
    const addons = await client.query("SELECT * FROM menu_addons WHERE restaurant_id = $1 ORDER BY sort_order", [rId]);
    const items = await client.query("SELECT * FROM menu_items WHERE restaurant_id = $1 ORDER BY sort_order, name", [rId]);
    const variants = await client.query(
      "SELECT v.* FROM menu_item_variants v JOIN menu_items i ON v.menu_item_id = i.id WHERE i.restaurant_id = $1 ORDER BY v.sort_order",
      [rId],
    );
    const itemAddonLinks = await client.query(
      "SELECT a.* FROM menu_item_addons a JOIN menu_items i ON a.menu_item_id = i.id WHERE i.restaurant_id = $1",
      [rId],
    );
    const deals = await client.query("SELECT * FROM deals WHERE restaurant_id = $1", [rId]);
    const discounts = await client.query("SELECT * FROM discounts WHERE restaurant_id = $1", [rId]);
    const hours = await client.query("SELECT * FROM restaurant_hours WHERE restaurant_id = $1 ORDER BY day_of_week", [rId]);
    const settings = await client.query("SELECT * FROM restaurant_settings WHERE restaurant_id = $1 LIMIT 1", [rId]);

    const exportData = {
      exported_at: new Date().toISOString(),
      restaurant: {
        name: restaurant.name,
        slug: restaurant.slug,
        phone: restaurant.phone,
        address: restaurant.address,
        contact_email: restaurant.contact_email,
        commission_rate: restaurant.commission_rate,
      },
      settings: settings.rows[0] || null,
      hours: hours.rows,
      categories: categories.rows,
      subCategories: subCategories.rows,
      addons: addons.rows,
      items: items.rows,
      variants: variants.rows,
      itemAddonLinks: itemAddonLinks.rows,
      deals: deals.rows,
      discounts: discounts.rows,
    };

    const outPath = path.join(__dirname, "menu-seed-export.json");
    await fs.writeFile(outPath, JSON.stringify(exportData, null, 2), "utf8");

    console.log(`\n✅ Menu successfully exported to: ${outPath}`);
    console.log(`   - ${categories.rowCount} Categories`);
    console.log(`   - ${subCategories.rowCount} Sub-categories`);
    console.log(`   - ${addons.rowCount} Add-ons`);
    console.log(`   - ${items.rowCount} Menu items`);
    console.log(`   - ${variants.rowCount} Variants (sizes & flavors)`);
    console.log(`   - ${deals.rowCount} Deals`);
    console.log(`   - ${discounts.rowCount} Coupons`);
  } catch (e) {
    console.error("❌ Export failed:", e);
  } finally {
    await client.end();
  }
}

main();
