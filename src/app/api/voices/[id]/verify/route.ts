import { caregiverAuthorized } from "@/lib/access";
import { ensureDatabase } from "@/lib/db/database";
import { getHousehold } from "@/lib/db/repository";
import { isUuid, publicVoice, voiceById } from "@/lib/db/voices";
import { voiceSettings } from "@/lib/voice/config";
import { providerFetch } from "@/lib/voice/provider-fetch";
import { sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Please unlock Milo first." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ message: "Invalid voice." }, { status: 400 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    const pool = await ensureDatabase();
    const voice = await voiceById(pool, id, household.patient.id);
    if (!voice?.elevenlabs_voice_id || voice.cloning_status !== "verification_required") return Response.json({ message: "This voice does not need a verification refresh." }, { status: 409 });
    const response = await providerFetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voice.elevenlabs_voice_id)}`, { headers: { "xi-api-key": voiceSettings().elevenlabsKey }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return Response.json({ message: "Verification status could not be read. This check needs Voices → Read permission on the ElevenLabs key." }, { status: 503 });
    const result = await response.json() as { voice_verification?: { requires_verification?: boolean; is_verified?: boolean } };
    const verified = result.voice_verification?.is_verified === true || result.voice_verification?.requires_verification === false;
    if (verified) await pool.query("UPDATE familiar.voice_profile SET cloning_status='ready' WHERE id=$1 AND cloning_status='verification_required'", [id]);
    return Response.json({ voice: publicVoice((await voiceById(pool, id, household.patient.id))!) });
  } catch { return Response.json({ message: "Verification status could not be checked. Please try again." }, { status: 503 }); }
}
