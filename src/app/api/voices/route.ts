import { caregiverAuthorized } from "@/lib/access";
import { getHousehold } from "@/lib/db/repository";
import { ensureDatabase } from "@/lib/db/database";
import { claimRecordLink, findRecordLink, isUuid, listVoices, type RecordLink } from "@/lib/db/voices";
import { MAX_CONSENT_BYTES, MAX_SAMPLE_BYTES, validOwnerDetails } from "@/lib/enrollment-contract";
import { enrollVoice } from "@/lib/voice/enrollment";
import { audioMime } from "@/lib/voice/protocol";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!caregiverAuthorized(request)) return Response.json({ message: "Please unlock Milo first." }, { status: 401 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ voices: [], setupRequired: true });
    return Response.json({ voices: await listVoices(household.patient.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "The voice library could not be loaded." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const recordToken = request.headers.get("x-familiar-record-token");
  if (!recordToken && !caregiverAuthorized(request)) return Response.json({ message: "A recording invitation or caregiver session is required." }, { status: 401 });
  let link: RecordLink | null = null;
  let id = "";
  try {
    if (recordToken && !await findRecordLink(await ensureDatabase(), recordToken)) return Response.json({ message: "This recording invitation is no longer available." }, { status: 410 });
    const bytes = await boundedBody(request, MAX_SAMPLE_BYTES + MAX_CONSENT_BYTES + 32000);
    const data = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const name = String(data.get("name") ?? "").trim();
    const relationship = String(data.get("relationship") ?? "").trim();
    const consent = data.get("consent");
    const sample = data.get("sample");
    id = String(data.get("submissionId") ?? "");
    if (!validOwnerDetails(name, relationship) || !isUuid(id) || data.get("ownerConfirmed") !== "true" || data.get("consentAccepted") !== "true") return Response.json({ message: "The living voice owner must confirm ownership and explicitly agree to the recorded consent." }, { status: 400 });
    if (!(consent instanceof File) || consent.size < 1024 || consent.size > MAX_CONSENT_BYTES || !(sample instanceof File) || sample.size < 1024 || sample.size > MAX_SAMPLE_BYTES) return Response.json({ message: "Please provide both the consent recording and a voice sample within the size limits." }, { status: 400 });
    const consentMime = audioMime(consent.type), sampleMime = audioMime(sample.type);
    if (!consentMime || !sampleMime) return Response.json({ message: "Please use a supported audio recording format." }, { status: 400 });
    let patientId: string;
    const pool = await ensureDatabase();
    if (recordToken) {
      link = await claimRecordLink(pool, recordToken);
      if (!link) return Response.json({ message: "This link has expired, was already used, or is processing a recording." }, { status: 410 });
      if (link.enrollment_id !== id || link.display_name !== name || link.relationship !== relationship) throw new Error("The recording details do not match this invitation.");
      patientId = link.patient_id;
    } else {
      if (!caregiverAuthorized(request)) return Response.json({ message: "A recording invitation or caregiver session is required." }, { status: 401 });
      const household = await getHousehold();
      if (!household.patient) return Response.json({ message: "Complete family setup first." }, { status: 409 });
      patientId = household.patient.id;
    }
    const voice = await enrollVoice({ id, patientId, name, relationship, consent: new Uint8Array(await consent.arrayBuffer()), consentMime, sample: new Uint8Array(await sample.arrayBuffer()), sampleMime }, request.signal);
    if (link) await pool.query("UPDATE familiar.record_link SET used_at=now(), claimed_at=NULL WHERE id=$1", [link.id]);
    return Response.json({ voice }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (link) {
      try {
        // Ready or uncertain provider outcomes are not made retryable by a stale link.
        await (await ensureDatabase()).query(`UPDATE familiar.record_link SET claimed_at=NULL WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM familiar.voice_profile WHERE id=$2 AND cloning_status IN ('ready','verification_required','unknown','pending'))`, [link.id, id]);
      } catch { /* Leave the lease intact on database failure. */ }
    }
    const allowed = /^(Consent recording:|Voice sample:|Please record the consent|Voice creation was not accepted\.|The provider’s result is uncertain\.|This request is already|The recording details do not match|Recording could not be decoded\.|This recording format is not supported\.|Audio inspection is unavailable\.|Audio transcription is unavailable)/;
    const message = error instanceof Error && allowed.test(error.message) ? error.message : "Voice setup is unavailable. Please check the connection and try again.";
    return Response.json({ message }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
