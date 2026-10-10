import "server-only";
import { randomUUID } from "node:crypto";
import type { SqlClient } from "./migrations";
import { addFlag } from "./flags";
import { CHECKIN_STYLES, MAX_CHECKINS, MAX_REMINDERS, isCheckinStyle, isDue, type DayEvent, type LocalNow, type ScheduleItem, type ScheduleKind } from "../schedule";

export type PendingEvent = { id: string; kind: ScheduleKind; text: string; voice_profile_id: string | null };

export async function listSchedule(client: SqlClient, patientId: string): Promise<ScheduleItem[]> {
  const { rows } = await client.query<ScheduleItem>(`
    SELECT r.id, 'reminder' AS kind, r.text, r.schedule_json->>'time' AS time, r.schedule_json->'days' AS days, r.voice_profile_id AS "voiceId", v.display_name AS "voiceName"
      FROM familiar.reminder r LEFT JOIN familiar.voice_profile v ON v.id = r.voice_profile_id WHERE r.patient_id=$1
    UNION ALL
    SELECT c.id, 'checkin' AS kind, c.prompt_style AS text, to_char(c.time_of_day, 'HH24:MI') AS time, c.days, c.voice_profile_id AS "voiceId", v.display_name AS "voiceName"
      FROM familiar.checkin c LEFT JOIN familiar.voice_profile v ON v.id = c.voice_profile_id WHERE c.patient_id=$1
    ORDER BY time, id
  `, [patientId]);
  return rows;
}

// Returns null when the list is full. A check-in's `text` is its style.
export async function addScheduleItem(client: SqlClient, patientId: string, item: { kind: ScheduleKind; text: string; time: string; days: number[]; voiceId: string | null }): Promise<string | null> {
  const id = randomUUID();
  const { rows } = item.kind === "reminder"
    ? await client.query(`
        INSERT INTO familiar.reminder (id, patient_id, voice_profile_id, text, schedule_json)
        SELECT $1::uuid, $2::uuid, $3::uuid, $4::text, $5::jsonb WHERE (SELECT count(*) FROM familiar.reminder WHERE patient_id=$2::uuid) < $6::int RETURNING id
      `, [id, patientId, item.voiceId, item.text, JSON.stringify({ time: item.time, days: item.days }), MAX_REMINDERS])
    : await client.query(`
        INSERT INTO familiar.checkin (id, patient_id, voice_profile_id, time_of_day, days, prompt_style)
        SELECT $1::uuid, $2::uuid, $3::uuid, $4::time, $5::jsonb, $6::text WHERE (SELECT count(*) FROM familiar.checkin WHERE patient_id=$2::uuid) < $7::int RETURNING id
      `, [id, patientId, item.voiceId, item.time, JSON.stringify(item.days), item.text, MAX_CHECKINS]);
  return rows.length ? id : null;
}

export async function deleteScheduleItem(client: SqlClient, patientId: string, kind: ScheduleKind, id: string): Promise<void> {
  await client.query(`DELETE FROM familiar.${kind === "reminder" ? "reminder" : "checkin"} WHERE id=$1 AND patient_id=$2`, [id, patientId]);
  await client.query("DELETE FROM familiar.due_event WHERE source_id=$1 AND patient_id=$2 AND status='pending'", [id, patientId]);
}

// Creates today's event for each item that has come due. The unique key makes repeated polls harmless.
export async function materializeDue(client: SqlClient, patientId: string, now: LocalNow): Promise<void> {
  for (const item of await listSchedule(client, patientId)) {
    if (!isDue(item, now)) continue;
    const text = item.kind === "reminder" ? item.text : CHECKIN_STYLES[isCheckinStyle(item.text) ? item.text : "gentle"];
    await client.query(`
      INSERT INTO familiar.due_event (id, patient_id, kind, source_id, due_date, text, voice_profile_id)
      VALUES ($1::uuid, $2::uuid, $3::text, $4::uuid, $5::date, $6::text, $7::uuid) ON CONFLICT (source_id, due_date) DO NOTHING
    `, [randomUUID(), patientId, item.kind, item.id, now.date, text, item.voiceId]);
    if (item.kind === "reminder") await client.query("UPDATE familiar.reminder SET last_fired_at=now() WHERE id=$1", [item.id]);
  }
}

export async function pendingEvents(client: SqlClient, patientId: string): Promise<PendingEvent[]> {
  const { rows } = await client.query<PendingEvent>("SELECT id, kind, text, voice_profile_id FROM familiar.due_event WHERE patient_id=$1 AND status='pending' AND remind_after <= now() ORDER BY created_at, id LIMIT 3", [patientId]);
  return rows;
}

// "Remind me later" brings the event back in ten minutes.
export async function resolveEvent(client: SqlClient, patientId: string, id: string, action: "done" | "later"): Promise<void> {
  if (action === "done") await client.query("UPDATE familiar.due_event SET status='done', resolved_at=now() WHERE id=$1 AND patient_id=$2 AND status='pending'", [id, patientId]);
  else await client.query("UPDATE familiar.due_event SET remind_after=now() + interval '10 minutes' WHERE id=$1 AND patient_id=$2 AND status='pending'", [id, patientId]);
}

// A reminder left unanswered for twenty minutes is marked missed and raises a concern for the family.
export async function expireEvents(client: SqlClient, patientId: string): Promise<void> {
  const { rows } = await client.query<{ kind: ScheduleKind; text: string }>("UPDATE familiar.due_event SET status='missed', resolved_at=now() WHERE patient_id=$1 AND status='pending' AND remind_after < now() - interval '20 minutes' RETURNING kind, text", [patientId]);
  for (const event of rows) {
    if (event.kind === "reminder") await addFlag(client, patientId, null, { tier: "concern", kind: "general", reason: `A reminder was not acknowledged: ${event.text}` });
  }
}

export async function dayEvents(client: SqlClient, patientId: string): Promise<DayEvent[]> {
  const { rows } = await client.query<Omit<DayEvent, "created_at"> & { created_at: Date | string }>("SELECT id, kind, text, status, created_at FROM familiar.due_event WHERE patient_id=$1 AND created_at > now() - interval '24 hours' ORDER BY created_at DESC LIMIT 30", [patientId]);
  return rows.map((row) => ({ ...row, created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) }));
}
