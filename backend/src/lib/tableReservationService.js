import { randomUUID } from "node:crypto";
import { resolveRestaurantFamilyIds, normalizeTableNumber } from "./tableSessions.js";

export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Parse "today" / "tomorrow" / YYYY-MM-DD without UTC day-shift. */
export function parseReservationDate(raw) {
  const s = String(raw || "").trim().toLowerCase();
  const today = new Date();
  if (!s || s === "today" || s === "tonight" || s === "now") return localDateStr(today);
  if (s === "tomorrow") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return localDateStr(d);
  }
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return localDateStr(parsed);
  return localDateStr(today);
}

const HOUR_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  noon: 12,
  midnight: 0,
};

function ampmFrom(text) {
  const m = String(text || "").match(/\b(a\.?m\.?|p\.?m\.?)\b/i);
  return m ? m[1].replace(/\./g, "").toLowerCase() : null;
}

function toHHMM(h, min, ampm) {
  if (!Number.isFinite(h) || h > 23 || h < 0) return null;
  let minutes = Number.isFinite(min) ? min : 0;
  if (minutes > 59 || minutes < 0) minutes = 0;
  if (ampm === "pm" && h < 12) h += 12;
  else if (ampm === "am" && h === 12) h = 0;
  else if (!ampm && h >= 1 && h <= 11) h += 12;
  return `${String(h).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Parse spoken/agent times to HH:MM 24-hour.
 * "7 PM", "7", "seven" → 19:00 (restaurant evening default for 1–11 without am/pm).
 */
export function parseReservationTime(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return null;
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 6 && !/\d{1,2}[:.]\d{2}/.test(text) && !/\b(a\.?m\.?|p\.?m\.?)\b/i.test(text)) {
    return null;
  }

  const ampm = ampmFrom(text);

  let m = text.match(/\b([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (m) {
    return toHHMM(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0, m[3].replace(/\./g, "").toLowerCase());
  }

  m = text.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (m) return toHHMM(parseInt(m[1], 10), parseInt(m[2], 10), ampm);

  m = text.match(/\bat\s+([01]?\d|2[0-3])(?:\s*o'?clock)?\b/i) || text.match(/\b([01]?\d|2[0-3])\s*o'?clock\b/i);
  if (m) return toHHMM(parseInt(m[1], 10), 0, ampm);

  const wordNames = Object.keys(HOUR_WORDS).join("|");
  m =
    text.match(new RegExp(`\\b(${wordNames})\\s*(?:o'?clock|a\\.?m\\.?|p\\.?m\\.?)\\b`, "i")) ||
    text.match(new RegExp(`\\bat\\s+(${wordNames})\\b`, "i")) ||
    text.match(/\b(noon|midnight)\b/i);
  if (m) {
    const hour = HOUR_WORDS[String(m[1]).toLowerCase()];
    return toHHMM(hour, 0, ampm);
  }

  if (/^\d{1,2}$/.test(text)) return toHHMM(parseInt(text, 10), 0, ampm);

  if (text.length <= 40) {
    const wm = text.match(new RegExp(`\\b(${wordNames})\\b`, "i"));
    if (wm) return toHHMM(HOUR_WORDS[wm[1].toLowerCase()], 0, ampm);
    const bare = text.match(/\b([01]?\d|2[0-3])\b/);
    if (bare) return toHHMM(parseInt(bare[1], 10), 0, ampm);
  }

  return null;
}

/** Last clock time spoken in a transcript (later answers overwrite earlier ones). */
export function lastSpokenReservationTime(text) {
  if (!text) return null;
  const s = String(text);
  const wordNames = Object.keys(HOUR_WORDS).join("|");
  const pattern = new RegExp(
    [
      String.raw`\b\d{1,2}[:.]\d{2}\s*(?:a\.?m\.?|p\.?m\.?)?\b`,
      String.raw`\b\d{1,2}\s*(?:a\.?m\.?|p\.?m\.?)\b`,
      String.raw`\b\d{1,2}\s*o'?clock\b`,
      String.raw`\bat\s+\d{1,2}\b`,
      String.raw`\b(?:${wordNames})\s*(?:o'?clock|a\.?m\.?|p\.?m\.?)\b`,
      String.raw`\bat\s+(?:${wordNames})\b`,
      String.raw`\b(?:noon|midnight)\b`,
    ].join("|"),
    "gi"
  );
  const found = [];
  let m;
  while ((m = pattern.exec(s)) !== null) {
    const parsed = parseReservationTime(m[0]);
    if (parsed) found.push({ i: m.index, t: parsed });
  }
  const lines = s.split(/\r?\n/);
  let offset = 0;
  for (const line of lines) {
    const cleaned = line.replace(/^(customer|user|human|caller|ai|agent|bot)\s*:\s*/i, "").trim();
    const parsed = parseReservationTime(cleaned);
    if (parsed) found.push({ i: offset, t: parsed });
    offset += line.length + 1;
  }
  if (!found.length) return null;
  found.sort((a, b) => a.i - b.i);
  return found[found.length - 1].t;
}

/** Current dine-in sitting only blocks a short window around now, not the whole day. */
export function currentDiningBlockWindow(now = new Date()) {
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return {
    s: Math.max(0, nowMins - 30),
    e: Math.min(24 * 60, nowMins + 120),
  };
}

export function diningOccupancyBlocksSlot(startTime, slotDurationHours = 1, now = new Date()) {
  const win = currentDiningBlockWindow(now);
  const reqStart = timeToMins(startTime);
  const reqEnd = reqStart + (Number(slotDurationHours) || 1) * 60;
  return reqStart < win.e && reqEnd > win.s;
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
  const diningBlocksThisSlot =
    diningOccupied.size > 0 && diningOccupancyBlocksSlot(startTime, duration);

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
    if (diningBlocksThisSlot && diningOccupied.has(table.id)) continue;
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
