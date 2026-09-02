/**
 * Full demo restaurant: settings, hours, cuisines, menu, add-ons, deals, coupons.
 * Idempotent — safe to re-run.
 *
 * Prerequisites:
 *   npm run db:migrate
 *   npm run db:seed:admin
 *   npm run db:seed:cuisines   (optional; cuisines are created if missing)
 *
 * Usage:
 *   npm run db:seed:restaurant --prefix backend
 *
 * Env (optional):
 *   ADMIN_EMAIL=admin@admin.com
 */
import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@admin.com").trim().toLowerCase();
const RESTAURANT_SLUG = "royal-restaurant";

const RESTAURANT = {
  name: "Royal Restaurant",
  slug: RESTAURANT_SLUG,
  phone: "+1 (555) 123-4567",
  address: "123 Main Street, Downtown, NY 10001",
  contact_email: "orders@royalrestaurant.com",
  allows_delivery: true,
  allows_pickup: true,
  commission_rate: 10,
};

const SETTINGS = {
  name: "Royal Restaurant",
  address: "123 Main Street, Downtown, NY 10001",
  phone: "+1 (555) 123-4567",
  email: "orders@royalrestaurant.com",
  currency: "USD",
  tax_rate: 8.5,
  delivery_fee: 4.99,
  min_order_amount: 15,
  is_open: true,
};

const HOURS = [
  { day: 0, open: "11:00", close: "20:00", closed: false },
  { day: 1, open: "10:00", close: "22:00", closed: false },
  { day: 2, open: "10:00", close: "22:00", closed: false },
  { day: 3, open: "10:00", close: "22:00", closed: false },
  { day: 4, open: "10:00", close: "22:00", closed: false },
  { day: 5, open: "10:00", close: "23:00", closed: false },
  { day: 6, open: "10:00", close: "23:00", closed: false },
];

const CUISINE_NAMES = ["Fast Food", "American", "BBQ"];

const CATEGORIES = [
  { key: "burgers", name: "Burgers", description: "Hand-crafted burgers", sort: 1 },
  { key: "pizza", name: "Pizza", description: "Stone-baked pizzas", sort: 2 },
  { key: "sides", name: "Sides", description: "Fries, wings & more", sort: 3 },
  { key: "drinks", name: "Drinks", description: "Soft drinks & shakes", sort: 4 },
];

const SUB_CATEGORIES = [
  { key: "classic-burgers", category: "burgers", name: "Classic", sort: 1 },
  { key: "premium-burgers", category: "burgers", name: "Premium", sort: 2 },
];

const ADDONS = [
  { key: "extra-cheese", name: "Extra Cheese", price: 1.5, sort: 1 },
  { key: "jalapenos", name: "Jalapeños", price: 0.99, sort: 2 },
  { key: "garlic-sauce", name: "Garlic Sauce", price: 0.75, sort: 3 },
  { key: "bacon", name: "Crispy Bacon", price: 2.5, sort: 4 },
];

const MENU_ITEMS = [
  {
    key: "beef-burger",
    category: "burgers",
    subCategory: "classic-burgers",
    name: "Beef Burger",
    description: "Angus beef patty, lettuce, tomato, house sauce",
    price: 12.99,
    prep: 15,
    tags: [],
    spice: 0,
    track_inventory: true,
    stock_quantity: 50,
    max_order_quantity: 5,
    addonKeys: ["extra-cheese", "jalapenos", "bacon"],
    variants: [
      { name: "Regular", price: 12.99 },
      { name: "Large", price: 15.99 },
    ],
  },
  {
    key: "zinger-burger",
    category: "burgers",
    subCategory: "premium-burgers",
    name: "Zinger Burger",
    description: "Spicy crispy chicken, coleslaw, mayo",
    price: 13.99,
    prep: 18,
    tags: ["spicy"],
    spice: 3,
    track_inventory: true,
    stock_quantity: 30,
    max_order_quantity: 4,
    addonKeys: ["extra-cheese", "garlic-sauce"],
    variants: [],
  },
  {
    key: "margherita",
    category: "pizza",
    name: "Margherita Pizza",
    description: "Tomato, mozzarella, fresh basil",
    price: 14.5,
    prep: 20,
    tags: ["vegetarian"],
    spice: 0,
    track_inventory: false,
    stock_quantity: null,
    max_order_quantity: 3,
    addonKeys: ["extra-cheese"],
    variants: [
      { name: "10 inch", price: 14.5 },
      { name: "14 inch", price: 19.99 },
    ],
  },
  {
    key: "pepperoni",
    category: "pizza",
    name: "Pepperoni Pizza",
    description: "Classic pepperoni with mozzarella",
    price: 16.99,
    prep: 20,
    tags: [],
    spice: 1,
    track_inventory: false,
    stock_quantity: null,
    max_order_quantity: 3,
    addonKeys: ["extra-cheese", "jalapenos"],
    variants: [],
  },
  {
    key: "fries",
    category: "sides",
    name: "Crispy Fries",
    description: "Golden seasoned fries",
    price: 4.99,
    prep: 8,
    tags: ["vegetarian"],
    spice: 0,
    track_inventory: true,
    stock_quantity: 100,
    max_order_quantity: 10,
    addonKeys: ["garlic-sauce"],
    variants: [],
  },
  {
    key: "wings",
    category: "sides",
    name: "Buffalo Wings (6pc)",
    description: "Spicy buffalo sauce, ranch dip",
    price: 8.99,
    prep: 15,
    tags: ["spicy"],
    spice: 2,
    track_inventory: true,
    stock_quantity: 40,
    max_order_quantity: 6,
    addonKeys: ["garlic-sauce"],
    variants: [],
  },
  {
    key: "cola",
    category: "drinks",
    name: "Cola",
    description: "Chilled soft drink",
    price: 2.49,
    prep: 2,
    tags: [],
    spice: 0,
    track_inventory: true,
    stock_quantity: 200,
    max_order_quantity: 12,
    addonKeys: [],
    variants: [
      { name: "Regular", price: 2.49 },
      { name: "Large", price: 3.49 },
    ],
  },
  {
    key: "milkshake",
    category: "drinks",
    name: "Chocolate Milkshake",
    description: "Thick chocolate shake",
    price: 5.99,
    prep: 5,
    tags: ["vegetarian"],
    spice: 0,
    track_inventory: false,
    stock_quantity: null,
    max_order_quantity: 6,
    addonKeys: [],
    variants: [],
  },
];

const DEALS = [
  {
    name: "Lunch Special",
    description: "Burger + fries + drink",
    price: 18.99,
    original_price: 24.99,
  },
  {
    name: "Family Pizza Deal",
    description: "Two 14-inch pizzas + 2L drink",
    price: 34.99,
    original_price: 42.99,
  },
];

const COUPONS = [
  {
    code: "WELCOME10",
    description: "10% off your first order",
    discount_type: "percentage",
    discount_value: 10,
    min_order_amount: 20,
    max_uses: 500,
  },
  {
    code: "SAVE5",
    description: "$5 off orders over $30",
    discount_type: "fixed",
    discount_value: 5,
    min_order_amount: 30,
    max_uses: null,
  },
];

async function getAdminId(client) {
  const res = await client.query("SELECT id FROM profiles WHERE lower(email) = lower($1)", [ADMIN_EMAIL]);
  if (res.rowCount === 0) {
    throw new Error(
      `No profile for ${ADMIN_EMAIL}. Run: npm run db:seed:admin --prefix backend`,
    );
  }
  return res.rows[0].id;
}

async function ensureRestaurant(client) {
  const existing = await client.query("SELECT id FROM restaurants WHERE slug = $1", [RESTAURANT_SLUG]);
  if (existing.rowCount > 0) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE restaurants
       SET name = $2, phone = $3, address = $4, contact_email = $5,
           allows_delivery = $6, allows_pickup = $7, commission_rate = $8, is_active = true
       WHERE id = $1`,
      [
        id,
        RESTAURANT.name,
        RESTAURANT.phone,
        RESTAURANT.address,
        RESTAURANT.contact_email,
        RESTAURANT.allows_delivery,
        RESTAURANT.allows_pickup,
        RESTAURANT.commission_rate,
      ],
    );
    console.log("Restaurant exists, updated:", id);
    return id;
  }

  const id = randomUUID();
  await client.query(
    `INSERT INTO restaurants
       (id, name, slug, phone, address, contact_email, allows_delivery, allows_pickup, commission_rate, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
    [
      id,
      RESTAURANT.name,
      RESTAURANT.slug,
      RESTAURANT.phone,
      RESTAURANT.address,
      RESTAURANT.contact_email,
      RESTAURANT.allows_delivery,
      RESTAURANT.allows_pickup,
      RESTAURANT.commission_rate,
    ],
  );
  console.log("Restaurant created:", id);
  return id;
}

async function ensureSettings(client, restaurantId) {
  await client.query(
    `INSERT INTO restaurant_settings
       (restaurant_id, name, address, phone, email, currency, tax_rate, delivery_fee, min_order_amount, is_open)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (restaurant_id) DO UPDATE SET
       name = EXCLUDED.name,
       address = EXCLUDED.address,
       phone = EXCLUDED.phone,
       email = EXCLUDED.email,
       currency = EXCLUDED.currency,
       tax_rate = EXCLUDED.tax_rate,
       delivery_fee = EXCLUDED.delivery_fee,
       min_order_amount = EXCLUDED.min_order_amount,
       is_open = EXCLUDED.is_open`,
    [
      restaurantId,
      SETTINGS.name,
      SETTINGS.address,
      SETTINGS.phone,
      SETTINGS.email,
      SETTINGS.currency,
      SETTINGS.tax_rate,
      SETTINGS.delivery_fee,
      SETTINGS.min_order_amount,
      SETTINGS.is_open,
    ],
  );
  console.log("Restaurant settings ready.");
}

async function ensureHours(client, restaurantId) {
  const existing = await client.query(
    "SELECT COUNT(*)::int AS n FROM restaurant_hours WHERE restaurant_id = $1",
    [restaurantId],
  );
  if (existing.rows[0].n >= 7) {
    console.log("Opening hours already set.");
    return;
  }
  await client.query("DELETE FROM restaurant_hours WHERE restaurant_id = $1", [restaurantId]);
  for (const row of HOURS) {
    await client.query(
      `INSERT INTO restaurant_hours (restaurant_id, day_of_week, open_time, close_time, is_closed)
       VALUES ($1, $2, $3, $4, $5)`,
      [restaurantId, row.day, row.open, row.close, row.closed],
    );
  }
  console.log("Opening hours created (7 days).");
}

async function ensureCuisines(client, restaurantId) {
  for (const name of CUISINE_NAMES) {
    let cuisine = await client.query("SELECT id FROM cuisines WHERE lower(name) = lower($1)", [name]);
    let cuisineId;
    if (cuisine.rowCount === 0) {
      cuisineId = randomUUID();
      await client.query("INSERT INTO cuisines (id, name) VALUES ($1, $2)", [cuisineId, name]);
    } else {
      cuisineId = cuisine.rows[0].id;
    }
    await client.query(
      `INSERT INTO restaurant_cuisines (restaurant_id, cuisine_id)
       VALUES ($1, $2) ON CONFLICT (restaurant_id, cuisine_id) DO NOTHING`,
      [restaurantId, cuisineId],
    );
  }
  console.log("Cuisines linked:", CUISINE_NAMES.join(", "));
}

async function ensureMembership(client, restaurantId, adminId) {
  await client.query(
    `INSERT INTO restaurant_members (restaurant_id, user_id, member_role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT (restaurant_id, user_id) DO UPDATE SET member_role = 'owner'`,
    [restaurantId, adminId],
  );
  console.log("Admin linked as restaurant owner.");
}

async function ensureCategory(client, restaurantId, cat) {
  const found = await client.query(
    "SELECT id FROM menu_categories WHERE restaurant_id = $1 AND lower(name) = lower($2)",
    [restaurantId, cat.name],
  );
  if (found.rowCount > 0) return found.rows[0].id;

  const id = randomUUID();
  await client.query(
    `INSERT INTO menu_categories (id, restaurant_id, name, description, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [id, restaurantId, cat.name, cat.description, cat.sort],
  );
  return id;
}

async function ensureSubCategory(client, restaurantId, categoryId, sub) {
  const found = await client.query(
    "SELECT id FROM menu_sub_categories WHERE restaurant_id = $1 AND lower(name) = lower($2)",
    [restaurantId, sub.name],
  );
  if (found.rowCount > 0) return found.rows[0].id;

  const id = randomUUID();
  await client.query(
    `INSERT INTO menu_sub_categories (id, restaurant_id, category_id, name, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [id, restaurantId, categoryId, sub.name, sub.sort],
  );
  return id;
}

async function ensureAddon(client, restaurantId, addon) {
  const found = await client.query(
    "SELECT id FROM menu_addons WHERE restaurant_id = $1 AND lower(name) = lower($2)",
    [restaurantId, addon.name],
  );
  if (found.rowCount > 0) return found.rows[0].id;

  const id = randomUUID();
  await client.query(
    `INSERT INTO menu_addons (id, restaurant_id, name, price, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [id, restaurantId, addon.name, addon.price, addon.sort],
  );
  return id;
}

async function ensureMenuItem(client, restaurantId, item, categoryId, subCategoryId) {
  const found = await client.query(
    "SELECT id FROM menu_items WHERE restaurant_id = $1 AND lower(name) = lower($2)",
    [restaurantId, item.name],
  );
  if (found.rowCount > 0) {
    const id = found.rows[0].id;
    await client.query(
      `UPDATE menu_items SET
         category_id = $2, sub_category_id = $3, description = $4, price = $5,
         prep_time_minutes = $6, dietary_tags = $7, spice_level = $8,
         track_inventory = $9, stock_quantity = $10, max_order_quantity = $11, is_available = true
       WHERE id = $1`,
      [
        id,
        categoryId,
        subCategoryId,
        item.description,
        item.price,
        item.prep,
        item.tags,
        item.spice,
        item.track_inventory,
        item.stock_quantity,
        item.max_order_quantity,
      ],
    );
    return id;
  }

  const id = randomUUID();
  await client.query(
    `INSERT INTO menu_items
       (id, restaurant_id, category_id, sub_category_id, name, description, price,
        prep_time_minutes, dietary_tags, spice_level, track_inventory, stock_quantity,
        max_order_quantity, is_available, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, 0)`,
    [
      id,
      restaurantId,
      categoryId,
      subCategoryId,
      item.name,
      item.description,
      item.price,
      item.prep,
      item.tags,
      item.spice,
      item.track_inventory,
      item.stock_quantity,
      item.max_order_quantity,
    ],
  );
  return id;
}

async function ensureVariants(client, itemId, variants) {
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const found = await client.query(
      "SELECT id FROM menu_item_variants WHERE menu_item_id = $1 AND lower(name) = lower($2)",
      [itemId, v.name],
    );
    if (found.rowCount > 0) continue;
    await client.query(
      `INSERT INTO menu_item_variants (menu_item_id, name, price, sort_order, is_active)
       VALUES ($1, $2, $3, $4, true)`,
      [itemId, v.name, v.price, i],
    );
  }
}

async function linkAddons(client, itemId, addonIds) {
  for (const addonId of addonIds) {
    await client.query(
      `INSERT INTO menu_item_addons (menu_item_id, menu_addon_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [itemId, addonId],
    );
  }
}

async function ensureDeal(client, restaurantId, deal) {
  const found = await client.query(
    "SELECT id FROM deals WHERE restaurant_id = $1 AND lower(name) = lower($2)",
    [restaurantId, deal.name],
  );
  if (found.rowCount > 0) return;
  await client.query(
    `INSERT INTO deals (restaurant_id, name, description, price, original_price, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [restaurantId, deal.name, deal.description, deal.price, deal.original_price],
  );
}

async function ensureCoupon(client, restaurantId, coupon) {
  const found = await client.query(
    "SELECT id FROM discounts WHERE restaurant_id = $1 AND upper(code) = upper($2)",
    [restaurantId, coupon.code],
  );
  if (found.rowCount > 0) return;
  await client.query(
    `INSERT INTO discounts
       (restaurant_id, code, description, discount_type, discount_value, value,
        min_order_amount, max_uses, used_count, is_active)
     VALUES ($1, $2, $3, $4, $5, $5, $6, $7, 0, true)`,
    [
      restaurantId,
      coupon.code,
      coupon.description,
      coupon.discount_type,
      coupon.discount_value,
      coupon.min_order_amount,
      coupon.max_uses,
    ],
  );
}

async function seed() {
  const url = process.env.DATABASE_URL;
  if (!url?.trim()) {
    console.error("Set DATABASE_URL in backend/.env");
    process.exit(1);
  }

  const client = new Client({ connectionString: url.trim() });
  await client.connect();
  console.log("Seeding full restaurant demo data…\n");

  try {
    const adminId = await getAdminId(client);
    const restaurantId = await ensureRestaurant(client);
    await ensureSettings(client, restaurantId);
    await ensureHours(client, restaurantId);
    await ensureCuisines(client, restaurantId);
    await ensureMembership(client, restaurantId, adminId);

    const categoryIds = {};
    for (const cat of CATEGORIES) {
      categoryIds[cat.key] = await ensureCategory(client, restaurantId, cat);
    }

    const subCategoryIds = {};
    for (const sub of SUB_CATEGORIES) {
      const categoryId = categoryIds[sub.category];
      subCategoryIds[sub.key] = await ensureSubCategory(client, restaurantId, categoryId, sub);
    }

    const addonIds = {};
    for (const addon of ADDONS) {
      addonIds[addon.key] = await ensureAddon(client, restaurantId, addon);
    }

    for (const item of MENU_ITEMS) {
      const categoryId = categoryIds[item.category];
      const subCategoryId = item.subCategory ? subCategoryIds[item.subCategory] : null;
      const itemId = await ensureMenuItem(client, restaurantId, item, categoryId, subCategoryId);
      await ensureVariants(client, itemId, item.variants);
      const linkedAddonIds = (item.addonKeys || []).map((k) => addonIds[k]).filter(Boolean);
      await linkAddons(client, itemId, linkedAddonIds);
    }
    console.log(`Menu seeded: ${MENU_ITEMS.length} items, ${ADDONS.length} add-ons.`);

    for (const deal of DEALS) {
      await ensureDeal(client, restaurantId, deal);
    }
    console.log(`Deals seeded: ${DEALS.length}.`);

    for (const coupon of COUPONS) {
      await ensureCoupon(client, restaurantId, coupon);
    }
    console.log(`Coupons seeded: ${COUPONS.length}.`);

    const summary = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM restaurants) AS restaurants,
         (SELECT COUNT(*) FROM menu_categories WHERE restaurant_id = $1) AS categories,
         (SELECT COUNT(*) FROM menu_items WHERE restaurant_id = $1) AS menu_items,
         (SELECT COUNT(*) FROM menu_addons WHERE restaurant_id = $1) AS addons,
         (SELECT COUNT(*) FROM deals WHERE restaurant_id = $1) AS deals,
         (SELECT COUNT(*) FROM discounts WHERE restaurant_id = $1) AS coupons`,
      [restaurantId],
    );

    console.log("\nDone — Royal Restaurant is ready.");
    console.log("Restaurant ID:", restaurantId);
    console.log("Admin:", ADMIN_EMAIL);
    console.log("Counts:", summary.rows[0]);
  } finally {
    await client.end();
  }
}

seed().catch((e) => {
  console.error("Seed failed:", e.message || e);
  process.exit(1);
});
