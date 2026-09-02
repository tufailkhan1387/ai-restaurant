import "dotenv/config";
import pg from "pg";

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const v = await client.query("SELECT plate_number, image_url FROM vehicles WHERE image_url IS NOT NULL");
    const d = await client.query("SELECT full_name, image_url FROM drivers WHERE image_url IS NOT NULL");
    console.log("Vehicles with images:", v.rows);
    console.log("Drivers with images:", d.rows);
  } finally {
    await client.end();
  }
}
main().catch(console.error);
