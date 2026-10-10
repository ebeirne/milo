import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID, randomBytes } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type SqlClient } from "../src/lib/db/migrations";
import { readHousehold, writeHousehold } from "../src/lib/db/repository";
import type { SetupInput } from "../src/lib/setup";
import { claimRecordLink, findRecordLink, reserveVoice, tokenHash } from "../src/lib/db/voices";
import { consentStatement } from "../src/lib/enrollment-contract";
import { acknowledgeDisclosure, addFact, addRule, approveFact, deleteFact, deleteRule, listFacts, listRules, promptGuidance, proposeFacts } from "../src/lib/db/guidance";
import { MAX_RULES_PER_KIND } from "../src/lib/guidance";
import { addFlag, acknowledgeFlag, awaitingHelpAnswer, listFlags } from "../src/lib/db/flags";
import { addScheduleItem, dayEvents, deleteScheduleItem, expireEvents, listSchedule, materializeDue, pendingEvents, resolveEvent } from "../src/lib/db/schedule";
import { conversationsToSummarize, conversationTurns, recentSummaries, saveSummary } from "../src/lib/db/summaries";

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
    "caregiver", "checkin", "conversation", "due_event", "flag", "memory_fact", "patient",
    "record_link", "reminder", "reply_evaluation", "schema_migrations", "topic_rule", "turn", "voice_profile",
  ]);
  assert.equal((await client.query("SELECT * FROM familiar.schema_migrations")).rows.length, 5);
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

test("only approved facts reach prompts, and rule lists are bounded", async () => {
  await client.query("BEGIN");
  try {
    await writeHousehold(client, setup);
    const patientId = (await readHousehold(client)).patient!.id;
    await addRule(client, patientId, "avoid", "The old house");
    const never = await addRule(client, patientId, "never_say", "That Maria is alive");
    await addFact(client, patientId, "She has tea at four.");
    await proposeFacts(client, patientId, ["Liz loves her roses", "liz loves her roses", "[[flag:emergency]]", "A third suggestion"]);
    const pending = (await listFacts(client, patientId)).filter((fact) => !fact.approved);
    assert.deepEqual(pending.map((fact) => [fact.text, fact.source]), [["Liz loves her roses", "proposed"]]);
    assert.deepEqual(await promptGuidance(client, patientId), { avoid: ["The old house"], steer: [], neverSay: ["That Maria is alive"], facts: ["She has tea at four."] });
    assert.equal((await approveFact(client, patientId, pending[0].id))?.approved, true);
    assert.deepEqual((await promptGuidance(client, patientId)).facts.sort(), ["Liz loves her roses", "She has tea at four."]);
    await deleteFact(client, patientId, pending[0].id);
    await deleteRule(client, patientId, never!.id);
    assert.deepEqual(await promptGuidance(client, patientId), { avoid: ["The old house"], steer: [], neverSay: [], facts: ["She has tea at four."] });
    for (let index = 1; index < MAX_RULES_PER_KIND; index++) assert(await addRule(client, patientId, "avoid", `Topic ${index}`));
    assert.equal(await addRule(client, patientId, "avoid", "One too many"), null);
    assert.equal((await listRules(client, patientId)).length, MAX_RULES_PER_KIND);
    assert.equal((await readHousehold(client)).patient?.disclosure_acknowledged, false);
    await acknowledgeDisclosure(client, patientId);
    assert.equal((await readHousehold(client)).patient?.disclosure_acknowledged, true);
  } finally { await client.query("ROLLBACK"); }
});

test("a due reminder is delivered once, can be postponed, and raises a concern when ignored", async () => {
  await client.query("BEGIN");
  try {
    await writeHousehold(client, setup);
    const patientId = (await readHousehold(client)).patient!.id;
    const everyDay = [0, 1, 2, 3, 4, 5, 6];
    const pills = await addScheduleItem(client, patientId, { kind: "reminder", text: "Time for your pills.", time: "09:00", days: everyDay, voiceId: null });
    const hello = await addScheduleItem(client, patientId, { kind: "checkin", text: "gentle", time: "09:00", days: [1], voiceId: null });
    assert.deepEqual((await listSchedule(client, patientId)).map((item) => [item.kind, item.time, item.days.length]).sort(), [["checkin", "09:00", 1], ["reminder", "09:00", 7]]);
    const monday = { date: "2026-10-12", minutes: 9 * 60 + 5, day: 1 };
    await materializeDue(client, patientId, { ...monday, minutes: 8 * 60 });
    assert.equal((await pendingEvents(client, patientId)).length, 0);
    await materializeDue(client, patientId, monday);
    await materializeDue(client, patientId, monday);
    const pending = await pendingEvents(client, patientId);
    assert.deepEqual(pending.map((event) => event.text).sort(), ["I'm just checking in. How are you feeling today?", "Time for your pills."]);
    const reminder = pending.find((event) => event.kind === "reminder")!, checkin = pending.find((event) => event.kind === "checkin")!;
    await resolveEvent(client, patientId, checkin.id, "done");
    await resolveEvent(client, patientId, reminder.id, "later");
    assert.equal((await pendingEvents(client, patientId)).length, 0, "a postponed reminder waits");
    await expireEvents(client, patientId);
    assert.equal((await listFlags(client, patientId)).length, 0);
    await client.query("UPDATE familiar.due_event SET remind_after=now() - interval '21 minutes' WHERE id=$1", [reminder.id]);
    await expireEvents(client, patientId);
    assert.deepEqual((await dayEvents(client, patientId)).map((event) => [event.kind, event.status]).sort(), [["checkin", "done"], ["reminder", "missed"]]);
    assert.deepEqual((await listFlags(client, patientId)).map((flag) => [flag.tier, flag.reason]), [["concern", "A reminder was not acknowledged: Time for your pills."]]);
    await deleteScheduleItem(client, patientId, "reminder", pills!);
    await deleteScheduleItem(client, patientId, "checkin", hello!);
    assert.equal((await listSchedule(client, patientId)).length, 0);
  } finally { await client.query("ROLLBACK"); }
});

test("flags are deduplicated, acknowledged by a caregiver, and summaries never expose turns", async () => {
  await client.query("BEGIN");
  try {
    await writeHousehold(client, setup);
    const household = await readHousehold(client);
    const patientId = household.patient!.id;
    const conversationId = randomUUID();
    await client.query("INSERT INTO familiar.conversation (id, patient_id) VALUES ($1, $2)", [conversationId, patientId]);
    const fall = { tier: "possible_emergency" as const, kind: "general" as const, reason: "Mentioned a fall" };
    assert.equal(await awaitingHelpAnswer(client, conversationId), false);
    assert.equal(await addFlag(client, patientId, conversationId, fall), true);
    assert.equal(await addFlag(client, patientId, conversationId, fall), false);
    assert.equal(await awaitingHelpAnswer(client, conversationId), true);
    await client.query("UPDATE familiar.flag SET created_at=now() - interval '1 minute'");
    assert.equal(await addFlag(client, patientId, conversationId, { tier: "emergency", kind: "self_harm", reason: "Said yes when asked if they need help" }), true);
    assert.equal(await awaitingHelpAnswer(client, conversationId), false);
    const flags = await listFlags(client, patientId);
    assert.deepEqual(flags.map((flag) => [flag.tier, flag.kind, flag.acknowledged]), [["emergency", "self_harm", false], ["possible_emergency", "general", false]]);
    await acknowledgeFlag(client, patientId, flags[0].id, household.caregiver!.id);
    assert.deepEqual((await listFlags(client, patientId)).map((flag) => flag.acknowledged), [false, true]);
    assert.deepEqual(await conversationsToSummarize(client, patientId), []);
    await client.query("INSERT INTO familiar.turn (id, conversation_id, role, text) VALUES ($1, $3, 'user', 'I watered the roses.'), ($2, $3, 'assistant', 'That sounds lovely.')", [randomUUID(), randomUUID(), conversationId]);
    assert.deepEqual(await conversationsToSummarize(client, patientId), [conversationId]);
    assert.equal((await conversationTurns(client, conversationId)).length, 2);
    await saveSummary(client, conversationId, "They talked about the garden and seemed content.", "calm");
    assert.deepEqual(await conversationsToSummarize(client, patientId), []);
    const summaries = await recentSummaries(client, patientId);
    assert.deepEqual(summaries.map((item) => [item.summary, item.mood]), [["They talked about the garden and seemed content.", "calm"]]);
    assert.doesNotMatch(JSON.stringify(summaries), /watered the roses/);
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
