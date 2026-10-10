import { caregiverAuthorized } from "@/lib/access";
import { ensureDatabase } from "@/lib/db/database";
import { listFlags } from "@/lib/db/flags";
import { getHousehold } from "@/lib/db/repository";
import { dayEvents, expireEvents } from "@/lib/db/schedule";
import { conversationsToSummarize, conversationTurns, recentSummaries, saveSummary } from "@/lib/db/summaries";
import { summarizeConversation } from "@/lib/voice/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The caregiver's overview: summaries, moods, flags, and reminder completion. Never raw transcripts.
export async function GET(request: Request) {
  if (!caregiverAuthorized(request)) return Response.json({ message: "Please unlock Familiar first." }, { status: 401 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ preferredName: null, summaries: [], flags: [], events: [], pendingSummaries: 0 });
    const patientId = household.patient.id;
    const database = await ensureDatabase();
    await expireEvents(database, patientId);
    // Summaries are written when the family looks, so there is no "end conversation" step for the person.
    const written = await Promise.all((await conversationsToSummarize(database, patientId)).map(async (id) => {
      try {
        const turns = await conversationTurns(database, id);
        if (turns.length) { const result = await summarizeConversation(turns, request.signal); await saveSummary(database, id, result.summary, result.mood); }
        return true;
      } catch { return false; }
    }));
    const pendingSummaries = written.filter((ok) => !ok).length;
    return Response.json({
      preferredName: household.patient.preferred_name, pendingSummaries,
      summaries: await recentSummaries(database, patientId), flags: await listFlags(database, patientId), events: await dayEvents(database, patientId),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "The overview is unavailable right now." }, { status: 503 }); }
}
