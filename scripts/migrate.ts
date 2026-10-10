import { closeDatabase, ensureDatabase } from "../src/lib/db/database";

try {
  await ensureDatabase();
  console.log("Milo PostgreSQL migrations applied successfully.");
} catch {
  console.error("Migration failed. Check DATABASE_URL and PostgreSQL availability.");
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
