import "../src/loadEnv.js";
import { seedAdminUser } from "../src/db/seedAdmin.js";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || typeof url !== "string" || !url.trim()) {
    console.error("Set DATABASE_URL in backend/.env or the environment.");
    process.exit(1);
  }

  console.log("Seeding admin user (admin@admin.com)...");
  const result = await seedAdminUser(url);
  if (result) {
    console.log("Admin seeded successfully:", result);
  }
}

main().catch((err) => {
  console.error("Admin seed failed:", err.message || err);
  process.exit(1);
});
