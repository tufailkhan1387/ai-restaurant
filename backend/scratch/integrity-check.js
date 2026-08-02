import 'dotenv/config';
import pg from 'pg';

async function check() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('Connected to DB');
    
    const tables = ['profiles', 'restaurants', 'restaurant_settings', 'menu_categories', 'menu_items', 'orders', 'drivers', 'vehicles'];
    
    for (const table of tables) {
      try {
        const res = await client.query(`SELECT count(*) FROM public.${table}`);
        console.log(`Table ${table.padEnd(20)}: ${res.rows[0].count} rows found`);
      } catch (err) {
        console.error(`Table ${table.padEnd(20)}: MISSING OR ERROR - ${err.message}`);
      }
    }
  } catch (err) {
    console.error('DB Connection error:', err.message);
  } finally {
    await client.end();
  }
}

check();
