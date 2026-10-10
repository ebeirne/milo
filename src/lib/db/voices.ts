import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ensureDatabase } from "./database";
import type { SqlClient } from "./migrations";
import type { AudioQuality, VoiceSummary } from "../enrollment-contract";
import { EMPTY_PERSONA, parsePersona, type Persona, type RotationPolicy } from "../persona";

export type VoiceRecord = Omit<VoiceSummary, "persona"> & { persona_json: unknown; patient_id: string; elevenlabs_voice_id: string | null; consent_audio_ref: string | null; consenter_name: string | null; consent_statement: string };
export type RecordLink = { id: string; patient_id: string; enrollment_id: string; display_name: string; relationship: string; expires_at: Date; used_at: Date | null; claimed_at: Date | null };
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const isUuid = (value: string) => /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value);

export async function voiceById(client: SqlClient, id: string, patientId: string): Promise<VoiceRecord | null> {
  const { rows } = await client.query<VoiceRecord>("SELECT * FROM familiar.voice_profile WHERE id = $1 AND patient_id = $2", [id, patientId]);
  return rows[0] ?? null;
}

export const personaOf = (voice: Pick<VoiceRecord, "persona_json">): Persona => parsePersona(voice.persona_json) ?? EMPTY_PERSONA;

export function publicVoice(voice: VoiceRecord): VoiceSummary {
  const iso = (date: unknown) => date instanceof Date ? date.toISOString() : String(date ?? "");
  return { id: voice.id, display_name: voice.display_name, relationship: voice.relationship, cloning_status: voice.cloning_status, consent_recorded_at: iso(voice.consent_recorded_at), created_at: iso(voice.created_at), active: voice.active === true, persona: personaOf(voice) };
}

export async function listVoices(patientId: string): Promise<VoiceSummary[]> {
  const { rows } = await (await ensureDatabase()).query<VoiceRecord>("SELECT * FROM familiar.voice_profile WHERE patient_id = $1 ORDER BY created_at DESC", [patientId]);
  return rows.map(publicVoice);
}

export async function reserveVoice(client: SqlClient, input: { id: string; patientId: string; name: string; relationship: string; consentRef: string; statement: string; quality: AudioQuality }): Promise<{ voice: VoiceRecord; reserved: boolean }> {
  const inserted = await client.query(`
    INSERT INTO familiar.voice_profile (id, patient_id, display_name, relationship, consent_recorded_at, consent_audio_ref, consenter_name, consent_statement, sample_quality, cloning_status, active)
    VALUES ($1, $2, $3, $4, now(), $5, $3, $6, $7, 'pending', FALSE)
    ON CONFLICT (id) DO NOTHING RETURNING id
  `, [input.id, input.patientId, input.name, input.relationship, input.consentRef, input.statement, input.quality]);
  const { rows } = await client.query<VoiceRecord>("SELECT * FROM familiar.voice_profile WHERE id = $1 AND patient_id = $2 FOR UPDATE", [input.id, input.patientId]);
  const voice = rows[0];
  if (!voice) throw new Error("Voice request is not allowed.");
  if (inserted.rows.length) return { voice, reserved: true };
  if (["ready", "verification_required"].includes(voice.cloning_status)) return { voice, reserved: false };
  if (voice.cloning_status !== "failed") throw new Error("This request is already being processed or needs review in the voice library.");
  await client.query(`UPDATE familiar.voice_profile SET display_name=$3, relationship=$4, consent_recorded_at=now(), consent_audio_ref=$5, consenter_name=$3, consent_statement=$6, sample_quality=$7, cloning_status='pending' WHERE id=$1 AND patient_id=$2`, [input.id, input.patientId, input.name, input.relationship, input.consentRef, input.statement, input.quality]);
  return { voice: (await voiceById(client, input.id, input.patientId))!, reserved: true };
}

export async function issueRecordLink(patientId: string, name: string, relationship: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await (await ensureDatabase()).query(`INSERT INTO familiar.record_link (id, patient_id, enrollment_id, token_hash, display_name, relationship, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), patientId, randomUUID(), tokenHash(token), name, relationship, expires]);
  return { token, expiresAt: expires.toISOString() };
}

export async function findRecordLink(client: SqlClient, token: string, allowUsed = false): Promise<RecordLink | null> {
  if (!/^[\w-]{43}$/.test(token)) return null;
  const { rows } = await client.query<RecordLink>(`SELECT id, patient_id, enrollment_id, display_name, relationship, expires_at, used_at, claimed_at FROM familiar.record_link WHERE token_hash=$1 AND expires_at > now() ${allowUsed ? "" : "AND used_at IS NULL"}`, [tokenHash(token)]);
  return rows[0] ?? null;
}

export async function claimRecordLink(client: SqlClient, token: string): Promise<RecordLink | null> {
  if (!/^[\w-]{43}$/.test(token)) return null;
  const { rows } = await client.query<RecordLink>(`UPDATE familiar.record_link SET claimed_at=now() WHERE token_hash=$1 AND expires_at > now() AND used_at IS NULL AND (claimed_at IS NULL OR claimed_at < now() - interval '15 minutes') RETURNING *`, [tokenHash(token)]);
  return rows[0] ?? null;
}

export async function savePersona(patientId: string, id: string, persona: Persona): Promise<VoiceSummary | null> {
  const { rows } = await (await ensureDatabase()).query<VoiceRecord>("UPDATE familiar.voice_profile SET persona_json=$3::jsonb WHERE id=$1 AND patient_id=$2 RETURNING *", [id, patientId, JSON.stringify(persona)]);
  return rows[0] ? publicVoice(rows[0]) : null;
}

// Only a voice that is ready (consented and verified) may be turned on; turning off is always allowed.
export async function setVoiceActive(patientId: string, id: string, active: boolean): Promise<VoiceSummary | null> {
  const { rows } = await (await ensureDatabase()).query<VoiceRecord>(
    `UPDATE familiar.voice_profile SET active=$3 WHERE id=$1 AND patient_id=$2 AND ($3 = FALSE OR (cloning_status='ready' AND elevenlabs_voice_id IS NOT NULL AND consent_audio_ref IS NOT NULL)) RETURNING *`, [id, patientId, active]);
  return rows[0] ? publicVoice(rows[0]) : null;
}

export async function activeVoices(patientId: string): Promise<VoiceRecord[]> {
  const { rows } = await (await ensureDatabase()).query<VoiceRecord>(
    "SELECT * FROM familiar.voice_profile WHERE patient_id=$1 AND active=TRUE AND cloning_status='ready' AND elevenlabs_voice_id IS NOT NULL ORDER BY created_at, id", [patientId]);
  return rows;
}

export async function getRotationPolicy(patientId: string): Promise<RotationPolicy> {
  const { rows } = await (await ensureDatabase()).query<{ rotation_policy: RotationPolicy }>("SELECT rotation_policy FROM familiar.patient WHERE id=$1", [patientId]);
  return rows[0]?.rotation_policy ?? "single";
}

export async function setRotationPolicy(patientId: string, policy: RotationPolicy): Promise<void> {
  await (await ensureDatabase()).query("UPDATE familiar.patient SET rotation_policy=$2 WHERE id=$1", [patientId, policy]);
}
