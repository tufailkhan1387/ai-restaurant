/**
 * Spoken or typed order numbers become ORD-YYMMDD-NN.
 * "ORD 261002 4", "ORD-261002-04", and "26100204" all become ORD-261002-04.
 */

const WORD_TO_DIGIT = {
  zero: "0",
  oh: "0",
  nought: "0",
  one: "1",
  won: "1",
  two: "2",
  too: "2",
  three: "3",
  tree: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  nine: "9",
  // Roman Hindi / Urdu — do NOT map single-letter "o" (breaks "O R D")
  shunya: "0",
  sifar: "0",
  sifir: "0",
  ek: "1",
  ik: "1",
  do: "2",
  teen: "3",
  tin: "3",
  char: "4",
  chaar: "4",
  paanch: "5",
  panch: "5",
  chhe: "6",
  che: "6",
  chhah: "6",
  chay: "6",
  saat: "7",
  sat: "7",
  aath: "8",
  ath: "8",
  aat: "8",
  nau: "9",
};

/** Turn "two six one..." / "do chhe ek..." into digits before canonicalizing. */
export function replaceSpokenDigits(raw) {
  let text = String(raw || "")
    .toLowerCase()
    .replace(/[’'`]/g, "");

  // Normalize spelled "O R D" / "oh are dee" before digit word replacement
  text = text
    .replace(/\b(o|oh|zero)\s*[-\s]*\b(r|are)\s*[-\s]*\b(d|dee|the)\b/g, "ord")
    .replace(/\border\s*(number|no|num)?\b/g, "ord");

  // "double six" → 66, "triple zero" → 000
  text = text.replace(/\b(double|triple)\s+([a-z]+)\b/g, (_, mult, word) => {
    const d = WORD_TO_DIGIT[word];
    if (!d) return _;
    return mult === "triple" ? d + d + d : d + d;
  });

  text = text.replace(/\b([a-z]+)\b/g, (word) => WORD_TO_DIGIT[word] ?? word);
  return text;
}

export function canonicalOrderNumber(raw) {
  const spoken = replaceSpokenDigits(raw);
  const compact = String(spoken || "")
    .trim()
    .toUpperCase()
    .replace(/^ORDER/, "")
    .replace(/[^A-Z0-9]/g, "");
  const match = compact.match(/^ORD(\d{6})(\d{1,4})$/) || compact.match(/^(\d{6})(\d{1,4})$/);
  if (!match) return null;
  const seq = parseInt(match[2], 10);
  if (!Number.isFinite(seq) || seq < 1) return null;
  return `ORD-${match[1]}-${String(seq).padStart(2, "0")}`;
}

/**
 * Build several plausible ORD-YYMMDD-NN values from messy spoken / STT text.
 * Handles missing dashes, missing ORD, spoken digits, and a dropped zero in the date.
 */
export function expandOrderNumberCandidates(raw) {
  const spoken = replaceSpokenDigits(raw);
  const upper = String(spoken || "").trim().toUpperCase();
  const candidates = new Set();

  const addCanonical = (value) => {
    const c = canonicalOrderNumber(value);
    if (c) candidates.add(c);
  };

  addCanonical(upper);
  addCanonical(upper.replace(/\s+/g, ""));

  const digitsOnly = upper.replace(/\D/g, "");
  // Prefer clean YYMMDD + NN (8 digits) or YYMMDD + N (7 digits)
  if (digitsOnly.length === 8) {
    addCanonical(`ORD${digitsOnly.slice(0, 6)}${digitsOnly.slice(6)}`);
  } else if (digitsOnly.length === 7) {
    addCanonical(`ORD${digitsOnly.slice(0, 6)}${digitsOnly.slice(6)}`);
    // Common STT drop of one zero in the date: 26108 + 02 → try 261008-02
    const date5 = digitsOnly.slice(0, 5);
    const seq = digitsOnly.slice(5);
    addCanonical(`ORD${date5.slice(0, 4)}0${date5.slice(4)}${seq}`);
  } else if (digitsOnly.length === 9 && digitsOnly.startsWith("20")) {
    addCanonical(`ORD${digitsOnly.slice(2, 8)}${digitsOnly.slice(8)}`);
  }

  // Explicit 5-digit date forms like ORD-26108-02 (must have a separator before the seq)
  const fiveDate = upper.match(/^ORD\D*(\d{5})\D+(\d{1,3})$/i);
  if (fiveDate) {
    const d5 = fiveDate[1];
    const seq = fiveDate[2];
    addCanonical(`ORD${d5.slice(0, 4)}0${d5.slice(4)}${seq}`);
    addCanonical(`ORD${d5.slice(0, 2)}0${d5.slice(2)}${seq}`);
  }

  return [...candidates];
}

/** Extract digit-only fingerprint for loose DB matching. */
export function orderNumberDigits(raw) {
  return replaceSpokenDigits(raw).replace(/\D/g, "");
}

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
