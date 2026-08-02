import pg from 'pg';
const { Client } = pg;

const dbs = ['airestaurants', 'ai-restaurants'];
const password = '123456';

async function run() {
  for (const dbName of dbs) {
    console.log(`Checking database: ${dbName}`);
    const client = new Client({
      connectionString: `postgresql://postgres:${password}@127.0.0.1:5432/${dbName}`
    });

    try {
      await client.connect();
      console.log(`Connected to ${dbName}`);
      
      const res = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'restaurants' AND column_name = 'elevenlabs_api_key'
      `);

      if (res.rowCount === 0) {
        console.log(`Column missing in ${dbName}, adding now...`);
        await client.query(`
          ALTER TABLE restaurants 
          ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT,
          ADD COLUMN IF NOT EXISTS elevenlabs_connected_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
          ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT,
          ADD COLUMN IF NOT EXISTS twilio_connected_at TIMESTAMPTZ;
        `);
        console.log(`Successfully updated ${dbName}`);
      } else {
        console.log(`Columns already exist in ${dbName}`);
      }
    } catch (err) {
      console.error(`Could not update ${dbName}:`, err.message);
    } finally {
      await client.end();
    }
  }
}

run();
