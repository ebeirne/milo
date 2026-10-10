import { ensureDatabase } from "@/lib/db/database";
import { getHousehold } from "@/lib/db/repository";
import { expireEvents, materializeDue, pendingEvents } from "@/lib/db/schedule";
import { parseLocalNow, spokenLines } from "@/lib/schedule";
import { consentedVoice } from "@/lib/voice/enrollment";
import { speakerLabel } from "@/lib/voice/prompt";
import type { DueEvent } from "@/lib/voice/protocol";
import { speechTicket } from "@/lib/voice/tickets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Polled by the Talk screen while it is open; reminders cannot fire when the app is closed.
export async function GET(request: Request) {
  const now = parseLocalNow(new URL(request.url).searchParams);
  if (!now) return Response.json({ message: "Invalid time." }, { status: 400 });
  try {
    const household = await getHousehold();
    const patient = household.patient;
    if (!patient || !patient.disclosure_acknowledged) return Response.json({ events: [] });
    const database = await ensureDatabase();
    await materializeDue(database, patient.id, now);
    await expireEvents(database, patient.id);
    const events: DueEvent[] = [];
    for (const event of await pendingEvents(database, patient.id)) {
      // Only a voice that is switched on and still has its consent on file may speak; otherwise the stock voice does.
      const voice = event.voice_profile_id ? await consentedVoice(event.voice_profile_id, patient.id).catch(() => null) : null;
      const speaker = voice?.active ? { id: voice.id, name: voice.display_name, relationship: voice.relationship, label: speakerLabel(voice.display_name) } : null;
      let previous = "";
      const sentences = spokenLines(event.kind, event.text, patient.preferred_name, speaker?.name ?? null).map((text) => {
        const sentence = { text, ticket: speechTicket(text, previous, speaker?.id ?? null) };
        previous += `${text} `;
        return sentence;
      });
      events.push({ id: event.id, kind: event.kind, text: event.text, speaker, sentences });
    }
    return Response.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Reminders are unavailable." }, { status: 503 }); }
}
