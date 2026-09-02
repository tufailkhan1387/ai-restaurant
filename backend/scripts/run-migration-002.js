import "dotenv/config";
import fs from "fs";
import path from "path";
import pg from "pg";

const { Client } = pg;

async function migrate() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required in backend/.env");
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    console.log("Connected to DB. Running migration...");

    const sqlPath = path.resolve("migrations/002_full_schema.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    await client.query(sql);
    console.log("Migration 002 successful!");
  } catch (e) {
    console.error("Migration failed:", e);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
