/**
 * Sequential per-restaurant order numbers: ORD-0001, ORD-0002, ...
 * Locked inside the current transaction so two simultaneous orders cannot collide.
 */
export async function nextOrderNumber(trx, restaurantId) {
  const key = String(restaurantId || "global");
  await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [key]);

  const row = await trx("orders")
    .where({ restaurant_id: restaurantId })
    .whereRaw("order_number ~ '^ORD-[0-9]+$'")
    .select(trx.raw("COALESCE(MAX(CAST(SUBSTRING(order_number FROM 5) AS INTEGER)), 0) as max_n"))
    .first();

  const next = Number(row?.max_n || 0) + 1;
  return `ORD-${String(next).padStart(4, "0")}`;
}
