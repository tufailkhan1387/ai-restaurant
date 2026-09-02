/**
 * Seeds default cuisines into public.cuisines.
 *
 * Usage:
 *   npm run db:seed:cuisines --prefix backend
 */
import "dotenv/config";
import knex from "knex";

const DEFAULT_CUISINES = [
  "Italian",
  "Chinese",
  "Indian",
  "Pakistani",
  "Thai",
  "Japanese",
  "Korean",
  "Mexican",
  "American",
  "Mediterranean",
  "Turkish",
  "Arabic",
  "French",
  "Spanish",
  "Fast Food",
  "BBQ",
  "Seafood",
  "Vegetarian",
  "Vegan",
  "Desserts",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL in backend/.env (or the environment).");
    process.exit(1);
  }

  const k = knex({ client: "pg", connection: url });

  try {
    let inserted = 0;
    for (const raw of DEFAULT_CUISINES) {
      const name = raw.trim();
      if (!name) continue;
      const before = await k("cuisines").whereRaw("lower(name) = lower(?)", [name]).first();
      if (before) continue;
      await k("cuisines").insert({ name });
      inserted += 1;
    }

    const [{ cnt }] = await k("cuisines").count("* as cnt");
    console.log(`Cuisines seed complete. Inserted: ${inserted}, Total: ${Number(cnt || 0)}.`);
  } finally {
    await k.destroy();
  }
}

main().catch((e) => {
  console.error("Cuisines seed failed:", e.message || e);
  process.exit(1);
});
