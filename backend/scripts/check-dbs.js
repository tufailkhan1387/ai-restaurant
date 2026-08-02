import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function check() {
  const connectionString = "postgresql://postgres:123456@localhost:5432/postgres";
  const client = new Client({ connectionString });

  try {
    await client.connect();
    const res = await client.query("SELECT datname FROM pg_database");
    console.log("Existing databases:", res.rows.map(r => r.datname).join(", "));
  } catch (e) {
    console.error("Check failed:", e.message);
  } finally {
    await client.end();
  }
}

check();
