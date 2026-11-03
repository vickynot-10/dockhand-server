import { Client } from "pg";

export async function ensureDatabase() {
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  url.pathname = "/postgres";
  const client = new Client({ connectionString: url.toString() });
  await client.connect();

  const { rowCount } = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [dbName],
  );

  if (!rowCount) {
    await client.query(`CREATE DATABASE "${dbName}"`);
  }

  await client.end();
}
