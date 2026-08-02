import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function seed() {
  await client.connect();
  const r = await client.query("SELECT id FROM restaurants WHERE slug = $1", ["royal-restaurant"]);
  if (r.rowCount === 0) {
    throw new Error('No restaurant with slug "royal-restaurant". Run: node scripts/seed-dashboard.js');
  }
  const restaurantId = r.rows[0].id;
  console.log("Seeding test orders for restaurant", restaurantId);

  const orders = [
    { name: "Zain Ahmed", total: 45.50, status: "new", phone: "+923001234567", addr: "House 123, Street 4, Karachi" },
    { name: "Sarah Khan", total: 120.00, status: "confirmed", phone: "+923001112223", addr: "Apartment 5B, Gulshan Tower, Lahore" },
    { name: "John Doe", total: 25.99, status: "preparing", phone: "+15550001111", addr: "456 Maple Avenue, New York, NY" },
    { name: "Emma Wilson", total: 67.20, status: "out_for_delivery", phone: "+447700900123", addr: "10 Downing Street, London" },
    { name: "Ali Raza", total: 89.00, status: "delivered", phone: "+923005556667", addr: "Plot 45, Phase 6, DHA, Islamabad" },
  ];

  for (const o of orders) {
    const orderNum = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const tracking = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    await client.query(`
      INSERT INTO orders (
        restaurant_id, customer_name, total_amount, status, 
        customer_phone, tracking_code, order_number, delivery_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      restaurantId,
      o.name, 
      o.total, 
      o.status, 
      o.phone,
      tracking,
      orderNum,
      o.addr
    ]);
    
    console.log(`Created order ${orderNum} for ${o.name}`);
  }

  console.log("Seeding complete!");
  await client.end();
}

seed().catch(console.error);
