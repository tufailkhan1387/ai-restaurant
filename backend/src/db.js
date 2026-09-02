import knex from "knex";

let _knex;

export function getKnex() {
  if (_knex) return _knex;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  console.log("Connecting to database:", url.split("/").pop());
  _knex = knex({
    client: "pg",
    connection: url,
    pool: { min: 0, max: 10 },
  });
  return _knex;
}
