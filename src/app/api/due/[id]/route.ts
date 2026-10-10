import { ensureDatabase } from "@/lib/db/database";
import { getHousehold } from "@/lib/db/repository";
import { resolveEvent } from "@/lib/db/schedule";
import { isUuid } from "@/lib/db/voices";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";

// The person answered a reminder: "Done", or "Remind me later".
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const { id } = await params;
  try {
    const action = JSON.parse(new TextDecoder().decode(await boundedBody(request, 200))).action;
    if (!isUuid(id) || (action !== "done" && action !== "later")) return Response.json({ message: "Invalid reminder." }, { status: 400 });
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    await resolveEvent(await ensureDatabase(), household.patient.id, id, action);
    return Response.json({ saved: true });
  } catch { return Response.json({ message: "That couldn’t be saved. Please try again." }, { status: 503 }); }
}
