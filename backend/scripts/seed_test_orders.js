import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  const rid = '94854968-6a74-4f5e-906f-f73a0423328e';
  const items = [
    { id: '3dbd1931-8f86-4dae-a443-8d8c51b207c4', name: 'Beef Burger', price: 15.99 },
    { id: 'b1fe01d9-3c9e-4777-9075-192eff379287', name: 'Margherita Pizza', price: 12.50 }
  ];

  const orders = [
    { name: 'Zain Ahmed', phone: '03001234567', type: 'delivery', addr: 'House 123, Street 5, Karachi', items: [0, 1] },
    { name: 'Ali Khan', phone: '03219876543', type: 'pickup', addr: 'Self Pickup', items: [1] },
    { name: 'Sarah Malik', phone: '03456677889', type: 'delivery', addr: 'Apartment 4B, North Tower, Lahore', items: [0, 0] }
  ];

  for (const o of orders) {
    const subtotal = o.items.reduce((s, idx) => s + items[idx].price, 0);
    const tax = subtotal * 0.16;
    const fee = o.type === 'delivery' ? 5.00 : 0;
    const total = subtotal + tax + fee;
    const tracking = 'ORD-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderNumber = 'RN-' + Math.floor(1000 + Math.random() * 9000);

    const res = await client.query(`
      INSERT INTO orders (id, restaurant_id, customer_name, customer_phone, delivery_address, fulfillment_type, subtotal, tax_amount, delivery_fee, total_amount, status, source, tracking_code, order_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [randomUUID(), rid, o.name, o.phone, o.addr, o.type, subtotal, tax, fee, total, 'pending', 'web', tracking, orderNumber]);

    const oid = res.rows[0].id;
    for (const idx of o.items) {
      const item = items[idx];
      await client.query(`
        INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price, line_total)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [oid, item.id, item.name, 1, item.price, item.price]);
    }
    console.log(`Order created for ${o.name} - ${o.type} - Tracking: ${tracking}`);
  }
  
  await client.end();
}
main().catch(console.error);
