import "dotenv/config";
import pg from "pg";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name IN ('restaurants', 'restaurant_settings', 'orders') 
      ORDER BY table_name, column_name
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    await client.end();
  }
}
main().catch(console.error);
