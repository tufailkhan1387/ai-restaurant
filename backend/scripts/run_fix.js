import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", "006_restaurant_cover_image.sql"), "utf8");
    await client.query(sql);
    console.log("Migration 006 applied.");
  } finally {
    await client.end();
  }
}
main().catch(console.error);
