import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function check() {
  await client.connect();
  const res = await client.query(`
    SELECT p.email, r.role 
    FROM profiles p 
    LEFT JOIN user_roles r ON p.id = r.user_id 
    WHERE p.email = 'admin@admin.com'
  `);
  console.log("Admin Roles:", res.rows);
  
  const members = await client.query(`
    SELECT m.*, r.name as restaurant_name 
    FROM restaurant_members m
    JOIN restaurants r ON r.id = m.restaurant_id
    JOIN profiles p ON p.id = m.user_id
    WHERE p.email = 'admin@admin.com'
  `);
  console.log("Admin Memberships:", members.rows);
  
  await client.end();
}

check();
