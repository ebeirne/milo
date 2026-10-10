import { ensureDatabase } from "@/lib/db/database";
import { addFlag } from "@/lib/db/flags";
import { getHousehold } from "@/lib/db/repository";
import { isUuid } from "@/lib/db/voices";
import { notifyCaregiver } from "@/lib/notify";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";

// The person pressed "Yes, I need help" on the Talk screen. The app shows the call buttons; it never dials.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  try {
    const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 500)));
    const conversationId = typeof body.conversationId === "string" && isUuid(body.conversationId) ? body.conversationId : null;
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    const database = await ensureDatabase();
    const owned = conversationId ? (await database.query("SELECT 1 FROM familiar.conversation WHERE id=$1 AND patient_id=$2", [conversationId, household.patient.id])).rowCount : 0;
    const safety = { tier: "emergency" as const, kind: "general" as const, reason: "Pressed “Yes, I need help”" };
    if (await addFlag(database, household.patient.id, owned ? conversationId : null, safety)) notifyCaregiver(safety);
    return Response.json({ recorded: true });
  } catch { return Response.json({ message: "That couldn’t be saved." }, { status: 503 }); }
}
