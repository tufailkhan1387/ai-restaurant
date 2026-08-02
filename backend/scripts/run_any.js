import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error("Usage: node run_any.js <migration_file_name_in_migrations_folder>");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const sql = fs.readFileSync(path.join(__dirname, "..", "migrations", name), "utf8");
    await client.query(sql);
    console.log(`Migration ${name} applied.`);
  } finally {
    await client.end();
  }
}
main().catch(console.error);
