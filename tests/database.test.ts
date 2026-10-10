import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type SqlClient } from "../src/lib/db/migrations";
import { readHousehold, writeHousehold } from "../src/lib/db/repository";
import type { SetupInput } from "../src/lib/setup";
import { claimRecordLink, findRecordLink, reserveVoice, tokenHash } from "../src/lib/db/voices";
import { consentStatement } from "../src/lib/enrollment-contract";

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
    "record_link", "reminder", "reply_evaluation", "schema_migrations", "topic_rule", "turn", "voice_profile",
  ]);
  assert.equal((await client.query("SELECT * FROM familiar.schema_migrations")).rows.length, 3);
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

test("recording links are hashed, expire, and can only be claimed once at a time", async () => {
  await client.query("BEGIN");
  try {
    await writeHousehold(client, setup);
    const household = await readHousehold(client);
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    await client.query(`INSERT INTO familiar.record_link (id, patient_id, enrollment_id, token_hash, display_name, relationship, expires_at) VALUES ($1,$2,$3,$4,'Sarah','Daughter',now()+interval '1 hour')`, [id, household.patient!.id, randomUUID(), tokenHash(token)]);
    assert(await findRecordLink(client, token));
    assert(await claimRecordLink(client, token));
    assert.equal(await claimRecordLink(client, token), null);
    await client.query("UPDATE familiar.record_link SET used_at=now(), claimed_at=NULL WHERE id=$1", [id]);
    assert.equal(await findRecordLink(client, token), null);
    assert(await findRecordLink(client, token, true));
    await client.query("UPDATE familiar.record_link SET used_at=NULL, expires_at=now()-interval '1 hour' WHERE id=$1", [id]);
    assert.equal(await findRecordLink(client, token, true), null);
    assert.equal(await claimRecordLink(client, token), null);
    const { rows } = await client.query<{ token_hash: string }>("SELECT token_hash FROM familiar.record_link WHERE id=$1", [id]);
    assert.notEqual(rows[0].token_hash, token);
  } finally { await client.query("ROLLBACK"); }
});

test("enrollment reservations prevent duplicate or uncertain provider retries", async () => {
  await client.query("BEGIN");
  try {
    await writeHousehold(client, setup);
    const household = await readHousehold(client);
    const request = { id: randomUUID(), patientId: household.patient!.id, name: "Sarah", relationship: "Daughter", consentRef: "stored-consent.audio", statement: consentStatement("Sarah"), quality: { duration: 65, rms: 0.06, clipping: 0, contrast: 10, speechFraction: 0.7 } };
    assert.equal((await reserveVoice(client, request)).reserved, true);
    await assert.rejects(reserveVoice(client, request), /already being processed/);
    await client.query("UPDATE familiar.voice_profile SET cloning_status='unknown' WHERE id=$1", [request.id]);
    await assert.rejects(reserveVoice(client, request), /needs review/);
    await client.query("UPDATE familiar.voice_profile SET cloning_status='failed' WHERE id=$1", [request.id]);
    assert.equal((await reserveVoice(client, request)).reserved, true);
    await client.query("UPDATE familiar.voice_profile SET cloning_status='ready', elevenlabs_voice_id='test-clone' WHERE id=$1", [request.id]);
    assert.equal((await reserveVoice(client, request)).reserved, false);
  } finally { await client.query("ROLLBACK"); }
});
