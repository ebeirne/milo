import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type SqlClient } from "../src/lib/db/migrations";
import { readHousehold, writeHousehold } from "../src/lib/db/repository";
import type { SetupInput } from "../src/lib/setup";

// This isolated PostgreSQL engine is only used in tests. The app uses pg.
const database = new PGlite();
const client: SqlClient = {
  async query<T>(sql: string, values?: unknown[]) {
    if (values !== undefined) return database.query<T>(sql, values);
    const results = await database.exec(sql);
    return { rows: (results.at(-1)?.rows ?? []) as T[] };
  },
};
const setup: SetupInput = {
  patientName: " Elizabeth ", preferredName: " Liz ", caregiverName: " Sarah ",
  caregiverEmail: "sarah@example.com", caregiverRole: "family",
};
before(async () => { await applyMigrations(client); });
after(async () => { await database.close(); });

test("all brief tables are created and migrations can safely run twice", async () => {
  await applyMigrations(client);
  const { rows } = await client.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name", ["familiar"],
  );
  assert.deepEqual(rows.map((row) => row.table_name), [
    "caregiver", "checkin", "conversation", "flag", "memory_fact", "patient",
    "reminder", "reply_evaluation", "schema_migrations", "topic_rule", "turn", "voice_profile",
  ]);
  assert.equal((await client.query("SELECT * FROM familiar.schema_migrations")).rows.length, 2);
});

test("setup persists and updates do not create another household", async () => {
  await client.query("BEGIN");
  try {
    await writeHousehold(client, setup);
    const first = await readHousehold(client);
    assert.equal(first.patient?.name, "Elizabeth");
    assert.equal(first.patient?.preferred_name, "Liz");
    assert.equal(first.caregiver?.name, "Sarah");
    assert.equal(first.voiceCount, 0);
    await writeHousehold(client, { ...setup, preferredName: "Beth", caregiverRole: "self" });
    const updated = await readHousehold(client);
    assert.equal(updated.patient?.id, first.patient?.id);
    assert.equal(updated.caregiver?.id, first.caregiver?.id);
    assert.equal(updated.patient?.preferred_name, "Beth");
    assert.equal(updated.caregiver?.role, "self");
    const { rows } = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM familiar.patient");
    assert.equal(rows[0].count, 1);
  } finally { await client.query("ROLLBACK"); }
  assert.equal((await readHousehold(client)).patient, null);
});

test("unconsented clones are rejected by the database", async () => {
  await client.query("BEGIN");
  try {
    await writeHousehold(client, setup);
    const household = await readHousehold(client);
    await assert.rejects(client.query(`
      INSERT INTO familiar.voice_profile
        (id, patient_id, display_name, relationship, elevenlabs_voice_id, active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
    `, [randomUUID(), household.patient!.id, "Sarah", "Daughter", "test-voice"]), /check constraint/i);
  } finally { await client.query("ROLLBACK"); }
});

test("consented profiles accept JSON and voice deletion preserves reminders", async () => {
  await client.query("BEGIN");
  try {
    await writeHousehold(client, setup);
    const household = await readHousehold(client);
    const voiceId = randomUUID();
    await client.query(`
      INSERT INTO familiar.voice_profile
        (id, patient_id, display_name, relationship, elevenlabs_voice_id,
         consent_recorded_at, consent_audio_ref, consenter_name, persona_json, active)
      VALUES ($1, $2, $3, $4, $5, now(), $6, $7, $8, TRUE)
    `, [voiceId, household.patient!.id, "Sarah", "Daughter", "test-voice", "consent/test.webm", "Sarah", { speakingStyle: "gentle" }]);
    const reminderId = randomUUID();
    await client.query(`
      INSERT INTO familiar.reminder (id, patient_id, voice_profile_id, text, schedule_json)
      VALUES ($1, $2, $3, $4, $5)
    `, [reminderId, household.patient!.id, voiceId, "Time for tea", { time: "15:00" }]);
    assert.equal((await readHousehold(client)).voiceCount, 1);
    await client.query("DELETE FROM familiar.voice_profile WHERE id = $1", [voiceId]);
    const { rows } = await client.query<{ voice_profile_id: string | null }>(
      "SELECT voice_profile_id FROM familiar.reminder WHERE id = $1", [reminderId],
    );
    assert.equal(rows[0].voice_profile_id, null);
  } finally { await client.query("ROLLBACK"); }
});

test("SQL-looking names are stored as data", async () => {
  await client.query("BEGIN");
  try {
    const name = "Liz'); DROP TABLE familiar.patient; --";
    await writeHousehold(client, { ...setup, patientName: name });
    assert.equal((await readHousehold(client)).patient?.name, name);
  } finally { await client.query("ROLLBACK"); }
});
