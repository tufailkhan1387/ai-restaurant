import "dotenv/config";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
console.log("\n=== Database Tables ===");
r.rows.forEach((x, i) => console.log(`${i+1}. ${x.table_name}`));
console.log(`\nTotal: ${r.rows.length} tables`);
await c.end();
