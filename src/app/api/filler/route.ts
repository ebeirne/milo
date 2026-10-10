import { getHousehold } from "@/lib/db/repository";
import { isUuid } from "@/lib/db/voices";
import { getFiller } from "@/lib/voice/elevenlabs";
import { consentedVoice } from "@/lib/voice/enrollment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const phrase = params.get("phrase");
  const voiceId = params.get("voice");
  if (phrase !== "thinking" && phrase !== "disclosure") return Response.json({ message: "Unknown phrase." }, { status: 400 });
  if (voiceId && !isUuid(voiceId)) return Response.json({ message: "Unknown voice." }, { status: 400 });
  try {
    let voice = null;
    if (voiceId) {
      const household = await getHousehold();
      const found = household.patient ? await consentedVoice(voiceId, household.patient.id) : null;
      if (!found?.elevenlabs_voice_id) return Response.json({ message: "That voice is no longer available." }, { status: 409 });
      voice = { providerId: found.elevenlabs_voice_id, name: found.display_name };
    }
    const audio = await getFiller(phrase, voice);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ message: "Voice warm-up is unavailable. You can still read replies." }, { status: 503 });
  }
}
