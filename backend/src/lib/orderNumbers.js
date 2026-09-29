/** YYMMDD for the current day. The daily sequence resets when this changes. */
export function orderDateStamp(d = new Date()) {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/**
 * Daily per-restaurant order numbers: ORD-260929-01, ORD-260929-02, ...
 * The sequence starts again at 01 the next day.
 * Locked inside the current transaction so two simultaneous orders cannot collide.
 */
export async function nextOrderNumber(trx, restaurantId) {
  const stamp = orderDateStamp();
  const prefix = `ORD-${stamp}-`;
  const key = `${String(restaurantId || "global")}:${stamp}`;
  await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [key]);

  const row = await trx("orders")
    .where({ restaurant_id: restaurantId })
    .where("order_number", "like", `${prefix}%`)
    .whereRaw("order_number ~ ?", [`^ORD-${stamp}-[0-9]+$`])
    .select(trx.raw("COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+$') AS INTEGER)), 0) as max_n"))
    .first();

  let n = Number(row?.max_n || 0) + 1;
  for (let i = 0; i < 500; i += 1) {
    const candidate = `${prefix}${String(n).padStart(2, "0")}`;
    const existing = await trx("orders")
      .where({ restaurant_id: restaurantId, order_number: candidate })
      .first("id");
    if (!existing) return candidate;
    n += 1;
  }
  return `${prefix}${String(Date.now()).slice(-4)}`;
}
