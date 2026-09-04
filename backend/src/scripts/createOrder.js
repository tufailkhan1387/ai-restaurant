import { randomUUID } from "node:crypto";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

async function createSystematicOrder() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // 1. Get Royal Restaurant
    const restRes = await client.query(
      "SELECT id, name, commission_rate FROM restaurants WHERE slug = 'royal-restaurant' LIMIT 1"
    );
    if (restRes.rowCount === 0) {
      throw new Error("Royal Restaurant not found!");
    }
    const restaurant = restRes.rows[0];
    const restaurantId = restaurant.id;
    console.log(`Using Restaurant: ${restaurant.name} (${restaurantId})`);

    // 2. Get menu items for Royal Restaurant
    const itemsRes = await client.query(
      "SELECT id, name, price FROM menu_items WHERE restaurant_id = $1 AND name != '' LIMIT 2",
      [restaurantId]
    );

    let itemsToOrder = [];
    if (itemsRes.rowCount > 0) {
      itemsToOrder = itemsRes.rows.map((row) => ({
        menu_item_id: row.id,
        item_name: row.name,
        price: parseFloat(row.price) || 15.0,
        quantity: 1,
      }));
    } else {
      itemsToOrder = [
        {
          menu_item_id: null,
          item_name: "Margherita Pizza (Large)",
          price: 18.5,
          quantity: 2,
        },
      ];
    }

    // Calculate subtotal, delivery, tax, and total
    let subtotal = 0;
    for (const it of itemsToOrder) {
      subtotal += it.price * it.quantity;
    }
    const deliveryFee = 3.5;
    const taxAmount = parseFloat((subtotal * 0.05).toFixed(2));
    const discountAmount = 0;
    const totalAmount = parseFloat((subtotal + deliveryFee + taxAmount - discountAmount).toFixed(2));

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const trackingCode = `TRK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const orderId = randomUUID();

    console.log(`Creating Order #${orderNumber} for Total: $${totalAmount}...`);

    // 3. Insert into orders table
    const orderInsertQuery = `
      INSERT INTO orders (
        id,
        restaurant_id,
        order_number,
        tracking_code,
        customer_name,
        customer_phone,
        customer_email,
        delivery_address,
        delivery_notes,
        status,
        source,
        payment_method,
        payment_status,
        subtotal,
        tax_amount,
        delivery_fee,
        discount_amount,
        total_amount,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
      ) RETURNING *;
    `;

    const orderValues = [
      orderId,
      restaurantId,
      orderNumber,
      trackingCode,
      "John Doe (VIP Customer)",
      "+1 555-0199",
      "johndoe@example.com",
      "Suite 402, 742 Evergreen Terrace, Springfield",
      "Please ring the bell and leave by the door.",
      "completed", // 'completed' or 'delivered' so it immediately reflects in earnings and item reports
      "online",
      "card",
      "paid",
      subtotal,
      taxAmount,
      deliveryFee,
      discountAmount,
      totalAmount,
    ];

    const orderResult = await client.query(orderInsertQuery, orderValues);
    const createdOrder = orderResult.rows[0];
    console.log("Order created successfully:", {
      id: createdOrder.id,
      order_number: createdOrder.order_number,
      customer_name: createdOrder.customer_name,
      total_amount: createdOrder.total_amount,
      status: createdOrder.status,
    });

    // 4. Insert order items
    for (const it of itemsToOrder) {
      const orderItemId = randomUUID();
      const lineTotal = parseFloat((it.price * it.quantity).toFixed(2));

      await client.query(
        `INSERT INTO order_items (
          id,
          order_id,
          menu_item_id,
          item_name,
          quantity,
          unit_price,
          line_total,
          notes,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          orderItemId,
          orderId,
          it.menu_item_id,
          it.item_name,
          it.quantity,
          it.price,
          lineTotal,
          "Extra crispy & well done",
        ]
      );
      console.log(`  + Added Order Item: ${it.item_name} x${it.quantity} ($${lineTotal})`);
    }

    console.log("\n==========================================");
    console.log("SUCCESS: 1 Systematic Order Added!");
    console.log(`Restaurant: ${restaurant.name}`);
    console.log(`Order Number: ${orderNumber}`);
    console.log(`Tracking Code: ${trackingCode}`);
    console.log(`Customer: John Doe (+1 555-0199)`);
    console.log(`Total: $${totalAmount}`);
    console.log(`Status: ${createdOrder.status}`);
    console.log("==========================================\n");
  } catch (err) {
    console.error("Error creating order:", err);
  } finally {
    await client.end();
  }
}

createSystematicOrder();
