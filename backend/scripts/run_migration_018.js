import knex from 'knex';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL,
});

async function run() {
  console.log('Adding ElevenLabs and Twilio columns to restaurants table...');
  try {
    await db.raw(`
      ALTER TABLE restaurants 
      ADD COLUMN IF NOT EXISTS elevenlabs_api_key TEXT,
      ADD COLUMN IF NOT EXISTS elevenlabs_connected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
      ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT,
      ADD COLUMN IF NOT EXISTS twilio_connected_at TIMESTAMPTZ;
    `);
    console.log('Success: Columns added or already existed.');
  } catch (error) {
    console.error('Error running migration:', error.message);
  } finally {
    await db.destroy();
  }
}

run();
