import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    await client.connect();
    console.log("Connected to DB.");

    // 1. Ensure table exists (re-run part of migration 002 if needed)
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.restaurant_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
        name text NOT NULL DEFAULT 'My Restaurant',
        address text,
        phone text,
        email text,
        currency text NOT NULL DEFAULT 'USD',
        tax_rate numeric(5,2) NOT NULL DEFAULT 0,
        delivery_fee numeric(10,2) NOT NULL DEFAULT 0,
        min_order_amount numeric(10,2) NOT NULL DEFAULT 0,
        is_open boolean NOT NULL DEFAULT true,
        logo_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(restaurant_id)
      )
    `);
    console.log("Verified restaurant_settings table exists.");

    // 2. Get the restaurant ID
    const res = await client.query("SELECT id, name FROM restaurants LIMIT 1");
    if (res.rowCount === 0) {
      console.log("No restaurants found to create settings for.");
      return;
    }
    const restaurantId = res.rows[0].id;
    const restaurantName = res.rows[0].name;

    // 3. Ensure a settings row exists for this restaurant
    await client.query(`
      INSERT INTO restaurant_settings (restaurant_id, name)
      VALUES ($1, $2)
      ON CONFLICT (restaurant_id) DO NOTHING
    `, [restaurantId, restaurantName]);
    
    console.log(`Ensured settings row exists for restaurant: ${restaurantName} (${restaurantId})`);

  } catch (err) {
    console.error("Error fixing settings:", err.message);
  } finally {
    await client.end();
  }
}

run();
