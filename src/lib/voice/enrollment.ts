import "server-only";
import { mkdir, writeFile, access, unlink } from "node:fs/promises";
import path from "node:path";
import { ensureDatabase, withTransaction } from "../db/database";
import { reserveVoice, publicVoice, voiceById, type VoiceRecord } from "../db/voices";
import { consentStatement, matchesConsent, SAMPLE_MIN_SECONDS, SAMPLE_MAX_SECONDS, CONSENT_MIN_SECONDS, CONSENT_MAX_SECONDS, type AudioQuality, type VoiceSummary } from "../enrollment-contract";
import { inspectAudio, qualityProblem } from "./audio-quality";
import { transcribeAudio } from "./gemini";
import { createClone, deleteClone, CloneProviderError } from "./cloning-provider";

export type EnrollmentInput = { id: string; patientId: string; name: string; relationship: string; consent: Uint8Array; consentMime: string; sample: Uint8Array; sampleMime: string };
export type EnrollmentDependencies = {
  inspect: typeof inspectAudio; transcribe: typeof transcribeAudio; clone: typeof createClone;
  reserve: (input: EnrollmentInput, reference: string, statement: string, quality: AudioQuality) => Promise<{ voice: VoiceRecord; reserved: boolean }>;
  storeConsent: (reference: string, bytes: Uint8Array) => Promise<void>;
  confirmStored: (reference: string) => Promise<void>;
  finish: (id: string, voiceId: string, verification: boolean) => Promise<VoiceSummary>;
  fail: (id: string, unknown: boolean) => Promise<void>;
};

function consentFilename(reference: string): string {
  if (!/^[\da-f-]{36}\.audio$/i.test(reference)) throw new Error("Invalid consent reference");
  return path.join(path.resolve("data/consent"), reference);
}

export const enrollmentDependencies: EnrollmentDependencies = {
  inspect: inspectAudio, transcribe: transcribeAudio, clone: createClone,
  reserve: (input, reference, statement, quality) => withTransaction((client) => reserveVoice(client, { id: input.id, patientId: input.patientId, name: input.name, relationship: input.relationship, consentRef: reference, statement, quality })),
  async storeConsent(reference, bytes) { await mkdir(path.resolve("data/consent"), { recursive: true }); await writeFile(consentFilename(reference), bytes, { mode: 0o600 }); },
  confirmStored: (reference) => access(consentFilename(reference)),
  async finish(id, voiceId, verification) {
    const { rows } = await (await ensureDatabase()).query<VoiceRecord>("UPDATE familiar.voice_profile SET elevenlabs_voice_id=$2, cloning_status=$3, active=FALSE WHERE id=$1 RETURNING *", [id, voiceId, verification ? "verification_required" : "ready"]);
    return publicVoice(rows[0]);
  },
  async fail(id, unknown) { await (await ensureDatabase()).query("UPDATE familiar.voice_profile SET cloning_status=$2 WHERE id=$1", [id, unknown ? "unknown" : "failed"]); },
};

export async function enrollVoice(input: EnrollmentInput, signal: AbortSignal, dependencies: EnrollmentDependencies = enrollmentDependencies): Promise<VoiceSummary> {
  const consent = await dependencies.inspect(input.consent, input.consentMime, signal);
  const consentProblem = qualityProblem(consent.quality, CONSENT_MIN_SECONDS, CONSENT_MAX_SECONDS);
  if (consentProblem) throw new Error(`Consent recording: ${consentProblem}`);
  const transcript = await dependencies.transcribe({ data: Buffer.from(input.consent).toString("base64"), mimeType: input.consentMime }, signal);
  if (!matchesConsent(transcript, input.name)) throw new Error("Please record the consent statement clearly in your own voice, including your name and permission to create the AI recreation.");
  const sample = await dependencies.inspect(input.sample, input.sampleMime, signal);
  const sampleProblem = qualityProblem(sample.quality, SAMPLE_MIN_SECONDS, SAMPLE_MAX_SECONDS);
  if (sampleProblem) throw new Error(`Voice sample: ${sampleProblem}`);
  signal.throwIfAborted();
  const reference = `${input.id}.audio`;
  const reserved = await dependencies.reserve(input, reference, consentStatement(input.name), sample.quality);
  if (!reserved.reserved) return publicVoice(reserved.voice);
  let mutationStarted = false;
  try {
    await dependencies.storeConsent(reference, input.consent);
    await dependencies.confirmStored(reference);
    signal.throwIfAborted();
    mutationStarted = true;
    // Finish provider enrollment even if the browser disconnects, so its receipt
    // is not lost. A timeout is marked uncertain and cannot be auto-retried.
    const cloned = await dependencies.clone(`${input.name.slice(0, 65)} · Familiar ${input.id.slice(0, 8)}`, sample.sample);
    return await dependencies.finish(input.id, cloned.voiceId, cloned.requiresVerification);
  } catch (error) {
    const uncertain = mutationStarted && !(error instanceof CloneProviderError && error.knownFailure);
    await dependencies.fail(input.id, uncertain);
    throw error;
  }
}

export async function removeVoice(id: string, patientId: string): Promise<void> {
  const voice = await withTransaction(async (client) => {
    const result = await client.query<VoiceRecord>("SELECT * FROM familiar.voice_profile WHERE id=$1 AND patient_id=$2 FOR UPDATE", [id, patientId]);
    const row = result.rows[0];
    if (!row) return null;
    if (["pending", "unknown"].includes(row.cloning_status)) throw new Error("This voice needs review in ElevenLabs before it can be removed here.");
    await client.query("UPDATE familiar.voice_profile SET active=FALSE, cloning_status='deleting' WHERE id=$1", [id]);
    return row;
  });
  if (!voice) return;
  if (voice.elevenlabs_voice_id) await deleteClone(voice.elevenlabs_voice_id);
  if (voice.consent_audio_ref) {
    try { await unlink(consentFilename(voice.consent_audio_ref)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("The consent file could not be removed. Please retry deletion."); }
  }
  await withTransaction(async (client) => {
    await client.query("DELETE FROM familiar.record_link WHERE enrollment_id=$1", [id]);
    await client.query("DELETE FROM familiar.voice_profile WHERE id=$1 AND patient_id=$2", [id, patientId]);
  });
}

export async function consentedVoice(id: string, patientId: string): Promise<VoiceRecord | null> {
  const voice = await voiceById(await ensureDatabase(), id, patientId);
  if (!voice || voice.cloning_status !== "ready" || !voice.elevenlabs_voice_id || !voice.consent_audio_ref || !voice.consent_recorded_at || !voice.consenter_name) return null;
  await access(consentFilename(voice.consent_audio_ref));
  return voice;
}
