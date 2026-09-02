import pg from "pg";
import { randomUUID } from "node:crypto";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:123456@127.0.0.1:5432/airestaurants";

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();

  const restaurants = await client.query(
    `SELECT id, name FROM restaurants ORDER BY created_at DESC NULLS LAST, name LIMIT 8`
  );
  console.log("Restaurants:", restaurants.rows);

  if (!restaurants.rows.length) {
    throw new Error("No restaurants found — create a restaurant first.");
  }

  const restaurant = restaurants.rows[0];
  const menu = await client.query(
    `SELECT id, name, price, restaurant_id
     FROM menu_items
     WHERE restaurant_id = $1
       AND COALESCE(is_available, true) = true
     ORDER BY name
     LIMIT 10`,
    [restaurant.id]
  );
  console.log(`Menu items for ${restaurant.name}:`, menu.rows);

  let items = menu.rows;
  if (items.length < 1) {
    // Fallback: any menu items in DB
    const any = await client.query(
      `SELECT id, name, price, restaurant_id FROM menu_items ORDER BY name LIMIT 5`
    );
    items = any.rows;
    console.log("Fallback menu items:", items);
  }

  if (!items.length) {
    throw new Error("No menu items found — cannot create order_items.");
  }

  const rid = items[0].restaurant_id || restaurant.id;
  const i0 = items[0];
  const i1 = items[1] || items[0];
  const i2 = items[2] || items[0];

  const before = await client.query(`SELECT COUNT(*)::int AS n FROM orders`);
  console.log("Orders before:", before.rows[0].n);

  const samples = [
    {
      customer_name: "Zain Ahmed",
      customer_phone: "+15550101",
      customer_email: "zain@example.com",
      delivery_address: "123 Main Street, Suite 4, Downtown",
      fulfillment_type: "delivery",
      status: "pending",
      source: "web",
      lines: [
        { ...i0, quantity: 1 },
        { ...i1, quantity: 1 },
      ],
    },
    {
      customer_name: "Ali Khan",
      customer_phone: "+15550102",
      customer_email: "ali@example.com",
      delivery_address: "Pickup counter",
      fulfillment_type: "pickup",
      status: "confirmed",
      source: "phone",
      lines: [{ ...i1, quantity: 2 }],
    },
    {
      customer_name: "Sarah Malik",
      customer_phone: "+15550103",
      customer_email: "sarah@example.com",
      delivery_address: "45 Park Avenue, Apt 12B",
      fulfillment_type: "delivery",
      status: "preparing",
      source: "web",
      lines: [
        { ...i0, quantity: 1 },
        { ...i2, quantity: 1 },
      ],
    },
  ];

  await client.query("BEGIN");
  try {
    for (const o of samples) {
      const subtotal = o.lines.reduce(
        (s, line) => s + Number(line.price) * Number(line.quantity),
        0
      );
      const tax = Math.round(subtotal * 0.08 * 100) / 100;
      const delivery_fee = o.fulfillment_type === "delivery" ? 4.99 : 0;
      const total = Math.round((subtotal + tax + delivery_fee) * 100) / 100;
      const tracking = `TRK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
      const orderId = randomUUID();

      await client.query(
        `INSERT INTO orders (
          id, restaurant_id, order_number, tracking_code,
          customer_name, customer_phone, customer_email, delivery_address,
          fulfillment_type, status, source, payment_method, payment_status,
          subtotal, tax_amount, delivery_fee, discount_amount, total_amount
        ) VALUES (
          $1,$2,$3,$4,
          $5,$6,$7,$8,
          $9,$10,$11,'cash','pending',
          $12,$13,$14,0,$15
        )`,
        [
          orderId,
          rid,
          orderNumber,
          tracking,
          o.customer_name,
          o.customer_phone,
          o.customer_email,
          o.delivery_address,
          o.fulfillment_type,
          o.status,
          o.source,
          subtotal,
          tax,
          delivery_fee,
          total,
        ]
      );

      for (const line of o.lines) {
        const qty = Number(line.quantity);
        const unit = Number(line.price);
        await client.query(
          `INSERT INTO order_items (
            order_id, menu_item_id, item_name, quantity, unit_price, line_total
          ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [orderId, line.id, line.name, qty, unit, Math.round(unit * qty * 100) / 100]
        );
      }

      console.log(
        `Created ${orderNumber} (${tracking}) for ${o.customer_name} — $${total.toFixed(2)} [${o.status}]`
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }

  const after = await client.query(
    `SELECT order_number, customer_name, status, fulfillment_type, total_amount, tracking_code
     FROM orders
     ORDER BY created_at DESC
     LIMIT 5`
  );
  console.log("Latest orders:", after.rows);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
