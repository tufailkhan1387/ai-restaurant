import { randomUUID } from "node:crypto";
import { resolveRestaurantFamilyIds, normalizeTableNumber } from "./tableSessions.js";

function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Tables currently occupied by unpaid dine-in guests (stay booked until the bill is paid). */
export async function getOccupiedDiningTableIds(knex, restaurantId) {
  const familyIds = await resolveRestaurantFamilyIds(knex, restaurantId);
  const ids = familyIds.length ? familyIds : restaurantId ? [restaurantId] : [];
  if (!ids.length) return new Set();

  const catalog = await knex("restaurant_tables").whereIn("restaurant_id", ids).select("id", "table_number");
  const occupied = new Set();
  const mark = (tableId, tableNumber) => {
    if (tableId) occupied.add(tableId);
    const norm = normalizeTableNumber(tableNumber);
    if (!norm) return;
    const match = catalog.find((t) => t.id === tableId || normalizeTableNumber(t.table_number) === norm);
    if (match) occupied.add(match.id);
  };

  const openSessions = await knex("table_sessions")
    .whereIn("restaurant_id", ids)
    .andWhere({ status: "open" })
    .select("table_id", "table_number");
  for (const s of openSessions) mark(s.table_id, s.table_number);

  const unpaid = await knex("orders")
    .whereIn("restaurant_id", ids)
    .where({ fulfillment_type: "dine_in" })
    .whereNotIn("status", ["cancelled", "delivered"])
    .where((qb) => {
      qb.whereNull("payment_status").orWhereNot("payment_status", "paid");
    })
    .select("table_id", "table_number");
  for (const o of unpaid) mark(o.table_id, o.table_number);

  return occupied;
}

/**
 * Convert time string "HH:MM" (or "H:MM") to minutes from midnight.
 */
export function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Find an available table for the given date/time/party size.
 */
export async function findAvailableTable(knex, { restaurantId, partySize, reservationDate, startTime, slotDurationHours }) {
  const pSize = Math.max(1, parseInt(partySize, 10) || 1);
  const duration = Number(slotDurationHours) || 1;

  // Get all active tables that can seat the party
  const familyIds = await resolveRestaurantFamilyIds(knex, restaurantId);
  const ids = familyIds.length ? familyIds : [restaurantId];

  const tables = await knex("restaurant_tables")
    .whereIn("restaurant_id", ids)
    .andWhere({ is_active: true })
    .where("capacity", ">=", pSize)
    .orderBy("capacity", "asc");

  if (!tables.length) return null;

  const diningOccupied = reservationDate === localDateStr()
    ? await getOccupiedDiningTableIds(knex, restaurantId)
    : new Set();

  const reqStart = timeToMins(startTime);
  const reqEnd = reqStart + duration * 60;

  // Load all confirmed/pending/seated reservations for that date
  const existing = await knex("table_reservations")
    .whereIn("restaurant_id", ids)
    .andWhere({ reservation_date: reservationDate })
    .whereIn("status", ["pending", "confirmed", "seated"])
    .whereIn("table_id", tables.map((t) => t.id))
    .select("table_id", "start_time", "slot_duration_hours");

  // Group by table_id
  const busyMap = {};
  for (const r of existing) {
    if (!busyMap[r.table_id]) busyMap[r.table_id] = [];
    const s = timeToMins(r.start_time);
    const e = s + Number(r.slot_duration_hours) * 60;
    busyMap[r.table_id].push({ s, e });
  }

  for (const table of tables) {
    if (diningOccupied.has(table.id)) continue;
    const conflicts = busyMap[table.id] || [];
    const blocked = conflicts.some(({ s, e }) => reqStart < e && reqEnd > s);
    if (!blocked) return table;
  }

  return null;
}

/**
 * Create a reservation in the database.
 */
export async function createReservation(knex, {
  restaurantId,
  tableId = null,
  customerName,
  customerPhone = null,
  customerEmail = null,
  partySize = 1,
  reservationDate,
  startTime,
  slotDurationHours = 1,
  status = "confirmed",
  notes = null,
  source = "phone",
  callId = null,
  aiExtractedData = null,
}) {
  const [row] = await knex("table_reservations")
    .insert({
      id: randomUUID(),
      restaurant_id: restaurantId,
      table_id: tableId,
      customer_name: String(customerName).trim(),
      customer_phone: customerPhone ? String(customerPhone).trim() : null,
      customer_email: customerEmail || null,
      party_size: Math.max(1, parseInt(partySize, 10) || 1),
      reservation_date: reservationDate,
      start_time: startTime,
      slot_duration_hours: Number(slotDurationHours) || 1,
      status: status || "confirmed",
      notes: notes || null,
      source: source || "phone",
      call_id: callId || null,
      ai_extracted_data: aiExtractedData || null,
    })
    .returning("*");

  return row;
}
