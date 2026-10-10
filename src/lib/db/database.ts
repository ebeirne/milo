import "server-only";
import { Pool, type PoolClient } from "pg";
import { applyMigrations } from "./migrations";

const databaseState = globalThis as unknown as {
  familiarPool?: Pool;
  familiarMigration?: Promise<void>;
};

export function getPool(): Pool {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required");
  }
  if (!databaseState.familiarPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      statement_timeout: 10000,
      application_name: "familiar",
    });
    // Do not log provider URLs, credentials, or patient information.
    pool.on("error", () => console.error("Milo database connection interrupted."));
    databaseState.familiarPool = pool;
  }
  return databaseState.familiarPool;
}

export async function ensureDatabase(): Promise<Pool> {
  const pool = getPool();
  if (!databaseState.familiarMigration) {
    databaseState.familiarMigration = (async () => {
      const client = await pool.connect();
      try {
        await applyMigrations(client);
      } finally {
        client.release();
      }
    })().catch((error: unknown) => {
      databaseState.familiarMigration = undefined;
      throw error;
    });
  }
  await databaseState.familiarMigration;
  return pool;
}

export async function withTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await databaseState.familiarPool?.end();
  databaseState.familiarPool = undefined;
  databaseState.familiarMigration = undefined;
}
