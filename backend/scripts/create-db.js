import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function setup() {
  // Use the verified password
  const connectionString = "postgresql://postgres:123456@127.0.0.1:5432/postgres";
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log("Connected to PostgreSQL server.");

    // Check if database exists
    const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'airestaurants'");
    if (res.rowCount === 0) {
      await client.query("CREATE DATABASE airestaurants");
      console.log("Database 'airestaurants' created successfully.");
    } else {
      console.log("Database 'airestaurants' already exists.");
    }
  } catch (e) {
    console.error("Setup failed:", e.message);
  } finally {
    await client.end();
  }
}

setup();
