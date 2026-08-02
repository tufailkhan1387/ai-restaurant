/**
 * Applies SQL migrations in order against DATABASE_URL.
 *
 * Usage (from server / CI, with backend/.env or env vars set):
 *   npm run db:migrate --prefix backend
 */
import "dotenv/config";
import { runMigrations } from "../src/db/runMigrations.js";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || typeof url !== "string" || !url.trim()) {
    console.error("Set DATABASE_URL in .env or the environment (PostgreSQL connection string).");
    process.exit(1);
  }

  console.log("Connected. Applying migrations…\n");
  const count = await runMigrations(url);
  console.log(`\nMigrations finished successfully (${count} file(s)).`);
}

main().catch((err) => {
  console.error("\nMigration failed:", err.message || err);
  process.exit(1);
});
