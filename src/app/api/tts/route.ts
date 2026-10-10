import { getHousehold } from "@/lib/db/repository";
import { readSpeechTicket } from "@/lib/voice/tickets";
import { streamSpeech } from "@/lib/voice/elevenlabs";
import { consentedVoice } from "@/lib/voice/enrollment";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  let speech: { text: string; previousText: string; voiceId: string | null } | null;
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 8000)));
    speech = typeof value.ticket === "string" ? readSpeechTicket(value.ticket) : null;
  } catch { speech = null; }
  if (!speech) return Response.json({ message: "Speech request expired. Please try talking again." }, { status: 400 });
  try {
    let cloneVoiceId: string | undefined;
    if (speech.voiceId) {
      // Consent and readiness are rechecked at speech time, so a deleted voice cannot keep speaking.
      const household = await getHousehold();
      const voice = household.patient ? await consentedVoice(speech.voiceId, household.patient.id) : null;
      if (!voice?.elevenlabs_voice_id) return Response.json({ message: "That voice is no longer available." }, { status: 409 });
      cloneVoiceId = voice.elevenlabs_voice_id;
    }
    const response = await streamSpeech(speech.text, speech.previousText, request.signal, undefined, cloneVoiceId);
    return new Response(response.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ message: "I couldn’t play my voice. You can read my reply." }, { status: 503 });
  }
}
