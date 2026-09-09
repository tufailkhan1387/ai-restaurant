import "../loadEnv.js";
import { getKnex } from "../db.js";

async function main() {
  const knex = getKnex();
  try {
    // Target Royal Restaurant HQ
    let restaurant = await knex("restaurants")
      .where({ is_active: true, is_branch: false })
      .whereILike("name", "%Royal Restaurant%")
      .first();

    if (!restaurant) {
      restaurant = await knex("restaurants").where({ is_active: true, is_branch: false }).first();
    }
    if (!restaurant) {
      console.error("No active restaurant found!");
      process.exit(1);
    }

    console.log("Creating new order for:", restaurant.name, `(${restaurant.id})`);

    const menuItems = await knex("menu_items")
      .where({ restaurant_id: restaurant.id, is_available: true })
      .limit(6);

    const customers = [
      { name: "Aslam Khan", phone: "+92 301 5551234", address: "House 54, Sector C, Bahria Town, Lahore" },
      { name: "Muhammad Usman", phone: "+92 322 8884321", address: "Flat 4B, Gulberg Greens, Lahore" },
      { name: "Ayesha Malik", phone: "+92 333 4449876", address: "Street 12, DHA Phase 6, Lahore" },
      { name: "Bilal Ahmed", phone: "+92 345 7776543", address: "House 18, Block G, Model Town, Lahore" },
    ];

    const customer = customers[Math.floor(Math.random() * customers.length)];

    let lines = [];
    if (menuItems.length > 0) {
      lines = menuItems.slice(0, 3).map((mi) => ({
        menu_item_id: mi.id,
        item_name: mi.name,
        quantity: Math.floor(1 + Math.random() * 2),
        unit_price: Number(mi.price || 12.0),
        line_total: Number(mi.price || 12.0) * Math.floor(1 + Math.random() * 2),
        notes: "Fresh & hot",
      }));
    } else {
      lines = [
        { menu_item_id: null, item_name: "Royal Special Chicken Karahi (Full)", quantity: 1, unit_price: 28.0, line_total: 28.0, notes: "Mild spicy" },
        { menu_item_id: null, item_name: "Garlic Roghani Naan", quantity: 4, unit_price: 2.5, line_total: 10.0, notes: "Crispy" },
        { menu_item_id: null, item_name: "Fresh Mint Raita & Salad", quantity: 2, unit_price: 3.0, line_total: 6.0, notes: null },
      ];
    }

    const subtotal = lines.reduce((acc, l) => acc + l.line_total, 0);
    const tax = Number((subtotal * 0.05).toFixed(2));
    const deliveryFee = 3.5;
    const total = Number((subtotal + tax + deliveryFee).toFixed(2));

    const orderNumber = "ORD-" + Math.floor(1000 + Math.random() * 9000);
    const trackingCode = "TRK-" + Math.random().toString(36).substr(2, 8).toUpperCase();

    const [order] = await knex("orders")
      .insert({
        restaurant_id: restaurant.id,
        order_number: orderNumber,
        tracking_code: trackingCode,
        customer_name: customer.name,
        customer_phone: customer.phone,
        delivery_address: customer.address,
        delivery_notes: "Please call upon arrival",
        fulfillment_type: "delivery",
        source: "online",
        status: "pending",
        payment_method: "cash",
        payment_status: "pending",
        subtotal: subtotal,
        tax_amount: tax,
        delivery_fee: deliveryFee,
        discount_amount: 0,
        total_amount: total,
      })
      .returning("*");

    console.log(`✓ Order Created: ${order.order_number} (ID: ${order.id})`);
    console.log(`  Customer: ${order.customer_name} | Phone: ${order.customer_phone}`);
    console.log(`  Address: ${order.delivery_address}`);
    console.log(`  Total Amount: $${order.total_amount}`);

    await knex("order_items").insert(
      lines.map((l) => ({
        order_id: order.id,
        menu_item_id: l.menu_item_id,
        item_name: l.item_name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_total: l.line_total,
        notes: l.notes,
      }))
    );

    console.log(`✓ Added ${lines.length} items to order ${order.order_number}`);
    process.exit(0);
  } catch (err) {
    console.error("Error creating new order:", err);
    process.exit(1);
  }
}

main();
