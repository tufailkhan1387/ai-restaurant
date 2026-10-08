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
    console.log("Found restaurant:", restaurant.name);

    // Create 3 Dummy DoorDash Orders and 2 Dummy Uber Orders
    const sources = ["doordash", "doordash", "doordash", "uber", "uber"];
    
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      const orderNumber = `${source === "doordash" ? "DD" : "UB"}-${Math.floor(10000 + Math.random() * 90000)}`;
      const subtotal = Math.floor(20 + Math.random() * 30);
      
      const [order] = await knex("orders")
        .insert({
          restaurant_id: restaurant.id,
          order_number: orderNumber,
          tracking_code: `TRK-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
          customer_name: `Test ${source} Customer ${i + 1}`,
          customer_phone: "Marketplace",
          delivery_address: `${source} Delivery`,
          fulfillment_type: "delivery",
          source: source,
          status: "pending", // or 'new', depending on your DB enum
          payment_method: "card",
          payment_status: "paid",
          subtotal: subtotal,
          tax_amount: 2.5,
          delivery_fee: 0,
          total_amount: subtotal + 2.5,
        })
        .returning("*");

      console.log(`Created ${source} order: ${order.order_number}`);

      await knex("order_items").insert([
        {
          order_id: order.id,
          item_name: "Signature Zinger Burger",
          quantity: 2,
          unit_price: subtotal / 2,
          line_total: subtotal,
          notes: "Spicy",
        }
      ]);
    }

    console.log(`\nSuccessfully created 5 dummy marketplace orders for testing!`);
    process.exit(0);
  } catch (err) {
    console.error("Error creating dummy orders:", err);
    process.exit(1);
  }
}

main();
