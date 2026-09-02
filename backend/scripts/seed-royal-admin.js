import "../src/loadEnv.js";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import knex from "knex";

const EMAIL = "royal@gmail.com";
const PASSWORD = "11223344";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL in backend/.env");
    process.exit(1);
  }

  const k = knex({ client: "pg", connection: url });

  try {
    const hash = await bcrypt.hash(PASSWORD, 10);
    let profile = await k("profiles").whereRaw("lower(email) = lower(?)", [EMAIL]).first();

    if (!profile) {
      const [row] = await k("profiles")
        .insert({
          id: randomUUID(),
          email: EMAIL,
          full_name: "Royal Restaurant Admin",
          password_hash: hash,
        })
        .returning("*");
      profile = row;
      console.log("Created profile:", profile.id);
    } else {
      await k("profiles").where({ id: profile.id }).update({
        password_hash: hash,
        full_name: "Royal Restaurant Admin",
      });
      console.log("Updated profile password:", profile.id);
    }

    await k("user_roles").where({ user_id: profile.id }).delete();
    await k("user_roles").insert({ user_id: profile.id, role: "admin" });
    console.log("Assigned role: admin to", EMAIL);

    const rest = await k("restaurants").where({ slug: "royal-restaurant" }).first();
    if (rest) {
      await k("restaurant_members").where({ user_id: profile.id, restaurant_id: rest.id }).delete();
      await k("restaurant_members").insert({ user_id: profile.id, restaurant_id: rest.id, member_role: "owner" });
      console.log("Linked", EMAIL, "to Royal Restaurant as owner.");
    }
    console.log("Done seeding Royal Restaurant account!");
  } finally {
    await k.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
