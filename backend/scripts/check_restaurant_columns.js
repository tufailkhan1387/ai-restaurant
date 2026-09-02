import "dotenv/config";
import pg from "pg";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'restaurants'
    `);
    console.log("Columns in restaurants table:", res.rows.map(r => r.column_name));
  } finally {
    await client.end();
  }
}
main().catch(console.error);
