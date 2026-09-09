/**
 * Import a menu-seed-export.json into any PostgreSQL database.
 * Idempotent — safe to re-run anytime.
 *
 * Usage:
 *   node backend/scripts/import-menu-seed.js
 */
import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    console.error("❌ Set DATABASE_URL in backend/.env");
    process.exit(1);
  }

  const jsonPath = path.join(__dirname, "menu-seed-export.json");
  let fileContent;
  try {
    fileContent = await fs.readFile(jsonPath, "utf8");
  } catch (e) {
    console.error(`❌ Could not read ${jsonPath}. Run export-menu-seed.js first.`);
    process.exit(1);
  }

  const data = JSON.parse(fileContent);
  const client = new Client({ connectionString: url.trim() });
  await client.connect();

  console.log(`📥 Importing menu for: ${data.restaurant?.name || "Restaurant"}...`);

  try {
    // 1. Ensure restaurant
    const restRes = await client.query("SELECT id FROM restaurants WHERE slug = $1", [data.restaurant.slug]);
    let restaurantId;
    if (restRes.rowCount > 0) {
      restaurantId = restRes.rows[0].id;
    } else {
      restaurantId = randomUUID();
      await client.query(
        `INSERT INTO restaurants (id, name, slug, phone, address, contact_email, commission_rate, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [
          restaurantId,
          data.restaurant.name,
          data.restaurant.slug,
          data.restaurant.phone,
          data.restaurant.address,
          data.restaurant.contact_email,
          data.restaurant.commission_rate || 10,
        ],
      );
    }

    // 2. Categories
    const catIdMap = new Map();
    for (const cat of data.categories || []) {
      const found = await client.query(
        "SELECT id FROM menu_categories WHERE restaurant_id = $1 AND lower(name) = lower($2)",
        [restaurantId, cat.name],
      );
      let catId;
      if (found.rowCount > 0) {
        catId = found.rows[0].id;
        await client.query(
          "UPDATE menu_categories SET description = $1, sort_order = $2, is_active = true WHERE id = $3",
          [cat.description, cat.sort_order, catId],
        );
      } else {
        catId = randomUUID();
        await client.query(
          `INSERT INTO menu_categories (id, restaurant_id, name, description, sort_order, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [catId, restaurantId, cat.name, cat.description, cat.sort_order],
        );
      }
      catIdMap.set(cat.id, catId);
    }

    // 3. Sub-categories
    const subCatIdMap = new Map();
    for (const sub of data.subCategories || []) {
      const parentCatId = catIdMap.get(sub.category_id) || sub.category_id;
      const found = await client.query(
        "SELECT id FROM menu_sub_categories WHERE restaurant_id = $1 AND lower(name) = lower($2)",
        [restaurantId, sub.name],
      );
      let subId;
      if (found.rowCount > 0) {
        subId = found.rows[0].id;
        await client.query(
          "UPDATE menu_sub_categories SET category_id = $1, description = $2, sort_order = $3, is_active = true WHERE id = $4",
          [parentCatId, sub.description, sub.sort_order, subId],
        );
      } else {
        subId = randomUUID();
        await client.query(
          `INSERT INTO menu_sub_categories (id, restaurant_id, category_id, name, description, sort_order, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [subId, restaurantId, parentCatId, sub.name, sub.description, sub.sort_order],
        );
      }
      subCatIdMap.set(sub.id, subId);
    }

    // 4. Addons
    const addonIdMap = new Map();
    for (const ad of data.addons || []) {
      const found = await client.query(
        "SELECT id FROM menu_addons WHERE restaurant_id = $1 AND lower(name) = lower($2)",
        [restaurantId, ad.name],
      );
      let adId;
      if (found.rowCount > 0) {
        adId = found.rows[0].id;
        await client.query(
          "UPDATE menu_addons SET price = $1, sort_order = $2, is_active = true WHERE id = $3",
          [ad.price, ad.sort_order, adId],
        );
      } else {
        adId = randomUUID();
        await client.query(
          `INSERT INTO menu_addons (id, restaurant_id, name, price, sort_order, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [adId, restaurantId, ad.name, ad.price, ad.sort_order],
        );
      }
      addonIdMap.set(ad.id, adId);
    }

    // 5. Menu Items
    const itemIdMap = new Map();
    for (const item of data.items || []) {
      const catId = catIdMap.get(item.category_id) || null;
      const subId = subCatIdMap.get(item.sub_category_id) || null;
      const found = await client.query(
        "SELECT id FROM menu_items WHERE restaurant_id = $1 AND lower(name) = lower($2)",
        [restaurantId, item.name],
      );
      let itemId;
      if (found.rowCount > 0) {
        itemId = found.rows[0].id;
        await client.query(
          `UPDATE menu_items
           SET category_id = $1, sub_category_id = $2, description = $3, price = $4,
               image_url = $5, is_available = $6, prep_time_minutes = $7,
               dietary_tags = $8, spice_level = $9, track_inventory = $10,
               stock_quantity = $11, max_order_quantity = $12, sort_order = $13
           WHERE id = $14`,
          [
            catId,
            subId,
            item.description,
            item.price,
            item.image_url,
            item.is_available ?? true,
            item.prep_time_minutes || 15,
            item.dietary_tags || [],
            item.spice_level || 0,
            item.track_inventory ?? false,
            item.stock_quantity,
            item.max_order_quantity,
            item.sort_order || 0,
            itemId,
          ],
        );
      } else {
        itemId = randomUUID();
        await client.query(
          `INSERT INTO menu_items
             (id, restaurant_id, category_id, sub_category_id, name, description, price,
              image_url, is_available, prep_time_minutes, dietary_tags, spice_level,
              track_inventory, stock_quantity, max_order_quantity, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
          [
            itemId,
            restaurantId,
            catId,
            subId,
            item.name,
            item.description,
            item.price,
            item.image_url,
            item.is_available ?? true,
            item.prep_time_minutes || 15,
            item.dietary_tags || [],
            item.spice_level || 0,
            item.track_inventory ?? false,
            item.stock_quantity,
            item.max_order_quantity,
            item.sort_order || 0,
          ],
        );
      }
      itemIdMap.set(item.id, itemId);
    }

    // 6. Variants (Sizes & Flavors)
    const variantIdMap = new Map();
    // First pass: Sizes (parent_id is null)
    const sizes = (data.variants || []).filter((v) => !v.parent_id);
    for (const s of sizes) {
      const mappedItemId = itemIdMap.get(s.menu_item_id);
      if (!mappedItemId) continue;
      const vId = randomUUID();
      await client.query(
        `INSERT INTO menu_item_variants
           (id, menu_item_id, name, measurement, price, sort_order, is_active, variant_type, parent_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)`,
        [
          vId,
          mappedItemId,
          s.name,
          s.measurement || null,
          s.price || 0,
          s.sort_order || 0,
          s.is_active ?? true,
          s.variant_type || "size",
        ],
      );
      variantIdMap.set(s.id, vId);
    }

    // Second pass: Child Flavors
    const flavors = (data.variants || []).filter((v) => v.parent_id);
    for (const f of flavors) {
      const mappedItemId = itemIdMap.get(f.menu_item_id);
      const mappedParentId = variantIdMap.get(f.parent_id) || null;
      if (!mappedItemId) continue;
      const fId = randomUUID();
      await client.query(
        `INSERT INTO menu_item_variants
           (id, menu_item_id, name, measurement, price, sort_order, is_active, variant_type, parent_id)
         VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, $8)`,
        [
          fId,
          mappedItemId,
          f.name,
          f.price || 0,
          f.sort_order || 0,
          f.is_active ?? true,
          f.variant_type || "flavor",
          mappedParentId,
        ],
      );
    }

    // 7. Item Addons Links
    for (const link of data.itemAddonLinks || []) {
      const mappedItemId = itemIdMap.get(link.menu_item_id);
      const mappedAddonId = addonIdMap.get(link.menu_addon_id);
      if (mappedItemId && mappedAddonId) {
        await client.query(
          `INSERT INTO menu_item_addons (menu_item_id, menu_addon_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [mappedItemId, mappedAddonId],
        );
      }
    }

    // 8. Deals
    for (const deal of data.deals || []) {
      const found = await client.query(
        "SELECT id FROM deals WHERE restaurant_id = $1 AND lower(name) = lower($2)",
        [restaurantId, deal.name],
      );
      if (found.rowCount > 0) {
        await client.query(
          "UPDATE deals SET description = $1, price = $2, original_price = $3, is_active = true WHERE id = $4",
          [deal.description, deal.price, deal.original_price, found.rows[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO deals (restaurant_id, name, description, price, original_price, is_active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [restaurantId, deal.name, deal.description, deal.price, deal.original_price],
        );
      }
    }

    // 9. Discounts / Coupons
    for (const disc of data.discounts || []) {
      const found = await client.query(
        "SELECT id FROM discounts WHERE restaurant_id = $1 AND upper(code) = upper($2)",
        [restaurantId, disc.code],
      );
      if (found.rowCount > 0) {
        await client.query(
          `UPDATE discounts
           SET description = $1, discount_type = $2, discount_value = $3, value = $3,
               min_order_amount = $4, max_uses = $5, is_active = true WHERE id = $6`,
          [disc.description, disc.discount_type, disc.discount_value, disc.min_order_amount, disc.max_uses, found.rows[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO discounts
             (restaurant_id, code, description, discount_type, discount_value, value, min_order_amount, max_uses, used_count, is_active)
           VALUES ($1, $2, $3, $4, $5, $5, $6, $7, 0, true)`,
          [restaurantId, disc.code, disc.description, disc.discount_type, disc.discount_value, disc.min_order_amount, disc.max_uses],
        );
      }
    }

    console.log("🎉 Menu successfully imported into database!");
  } catch (e) {
    console.error("❌ Import failed:", e);
  } finally {
    await client.end();
  }
}

main();
