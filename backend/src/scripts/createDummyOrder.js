import "../loadEnv.js";
import { getKnex } from "../db.js";

async function main() {
  const knex = getKnex();
  try {
    const restaurant = await knex("restaurants").where({ is_active: true }).first();
    if (!restaurant) {
      console.error("No active restaurant found!");
      process.exit(1);
    }
    console.log("Found restaurant:", restaurant.name, `(${restaurant.id})`);

    // Fetch existing menu items if any
    const menuItems = await knex("menu_items")
      .where({ restaurant_id: restaurant.id })
      .limit(10);

    const dummyItems = [
      { name: "Margherita Pizza (Large)", quantity: 2, unit_price: 18.5, notes: "Extra cheese" },
      { name: "BBQ Chicken Wings + Ranch", quantity: 1, unit_price: 12.0, notes: "Well done" },
      { name: "Garlic Breadsticks", quantity: 1, unit_price: 6.5, notes: null },
      { name: "Lunch Specials", quantity: 1, unit_price: 15.0, notes: "Spicy" },
      { name: "Chocolate Lava Cake", quantity: 2, unit_price: 7.5, notes: "Warm" },
      { name: "Fresh Mint Lemonade (500ml)", quantity: 2, unit_price: 4.5, notes: "Less ice" },
    ];

    const lines = dummyItems.map((item, idx) => {
      const match = menuItems[idx % menuItems.length];
      return {
        menu_item_id: match ? match.id : null,
        item_name: item.name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.unit_price * item.quantity,
        notes: item.notes,
      };
    });

    const subtotal = lines.reduce((acc, l) => acc + l.line_total, 0);
    const tax = Number((subtotal * 0.05).toFixed(2));
    const deliveryFee = 3.5;
    const total = Number((subtotal + tax + deliveryFee).toFixed(2));

    const orderNumber = "ORD-" + Math.floor(1000 + Math.random() * 9000);
    const trackingCode = "TRK-" + Math.random().toString(36).substr(2, 8).toUpperCase();

    // Check if there's any driver
    const driver = await knex("drivers").where({ restaurant_id: restaurant.id }).first();

    const [order] = await knex("orders")
      .insert({
        restaurant_id: restaurant.id,
        order_number: orderNumber,
        tracking_code: trackingCode,
        customer_name: "Farhan Ali",
        customer_phone: "+92 300 9876543",
        delivery_address: "House 42, Block B, Model Town",
        delivery_notes: "Please ring the bell twice",
        fulfillment_type: "delivery",
        source: "phone",
        status: "out_for_delivery",
        payment_method: "cash",
        payment_status: "pending",
        driver_id: driver ? driver.id : null,
        subtotal: subtotal,
        tax_amount: tax,
        delivery_fee: deliveryFee,
        discount_amount: 0,
        total_amount: total,
      })
      .returning("*");

    console.log("Created order:", order.order_number, `(ID: ${order.id}) with status: ${order.status}`);

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

    console.log(`Successfully added ${lines.length} items to order ${order.order_number}!`);
    process.exit(0);
  } catch (err) {
    console.error("Error creating dummy order:", err);
    process.exit(1);
  }
}

main();
