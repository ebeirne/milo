import { getHouseholdResult } from "@/lib/db/repository";
import { providersConfigured, voiceSettings, activeConversationProvider } from "@/lib/voice/config";
import { activeVoices } from "@/lib/db/voices";
import { speakerLabel } from "@/lib/voice/prompt";
import { consentedVoice } from "@/lib/voice/enrollment";
import { STOCK_VOICE_LABEL, type SpeakerInfo, type VoiceConfig } from "@/lib/voice/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getHouseholdResult();
  const reason = !result.available ? "database" : !result.household.patient ? "setup" : !providersConfigured() ? "providers" : undefined;
  let speakers: SpeakerInfo[] = [];
  const patient = result.household?.patient;
  if (patient) {
    try {
      const voices = await Promise.all((await activeVoices(patient.id)).map((voice) => consentedVoice(voice.id, patient.id).catch(() => null)));
      speakers = voices.filter((voice) => voice !== null).map((voice) => ({ id: voice.id, name: voice.display_name, relationship: voice.relationship, label: speakerLabel(voice.display_name) }));
    } catch { speakers = []; }
  }
  const config: VoiceConfig = {
    ready: !reason, reason,
    preferredName: result.household?.patient?.preferred_name,
    label: speakers.length === 1 ? speakers[0].label : speakers.length ? "AI voices of your family · recorded with their permission" : STOCK_VOICE_LABEL,
    speakers,
    microphoneReady: Boolean(voiceSettings().geminiKey),
    conversationProvider: activeConversationProvider(),
    evaluatorConfigured: Boolean(voiceSettings().typesafeKey),
  };
  return Response.json(config, { headers: { "Cache-Control": "no-store" } });
}
