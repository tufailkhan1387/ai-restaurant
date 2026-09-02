import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

// Get admin user
const adminRes = await client.query("SELECT id, email FROM profiles WHERE email = 'admin@admin.com'");
if (adminRes.rowCount === 0) { console.error("Admin user not found!"); process.exit(1); }
const adminId = adminRes.rows[0].id;
console.log("Admin ID:", adminId);

// Get restaurant
const restRes = await client.query("SELECT id, name FROM restaurants LIMIT 1");
if (restRes.rowCount === 0) { console.error("No restaurant found!"); process.exit(1); }
const restaurantId = restRes.rows[0].id;
const restaurantName = restRes.rows[0].name;
console.log("Restaurant:", restaurantName, restaurantId);

// Link admin to restaurant
await client.query(`
  INSERT INTO restaurant_members (restaurant_id, user_id, member_role)
  VALUES ($1, $2, 'owner')
  ON CONFLICT (restaurant_id, user_id) DO UPDATE SET member_role = 'owner'
`, [restaurantId, adminId]);

console.log("Admin linked to restaurant successfully!");

// Verify
const check = await client.query(
  "SELECT rm.*, r.name FROM restaurant_members rm JOIN restaurants r ON r.id = rm.restaurant_id WHERE rm.user_id = $1",
  [adminId]
);
console.log("Memberships:", check.rows);

await client.end();
