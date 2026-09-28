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

  let n = Number(row?.max_n || 0) + 1;
  for (let i = 0; i < 200; i += 1) {
    const candidate = `ORD-${String(n).padStart(4, "0")}`;
    const existing = await trx("orders")
      .where({ restaurant_id: restaurantId, order_number: candidate })
      .first("id");
    if (!existing) return candidate;
    n += 1;
  }
  return `ORD-${String(Date.now()).slice(-8)}`;
}
