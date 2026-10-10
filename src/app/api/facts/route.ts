import { caregiverAuthorized } from "@/lib/access";
import { ensureDatabase } from "@/lib/db/database";
import { addFact, listFacts } from "@/lib/db/guidance";
import { getHousehold } from "@/lib/db/repository";
import { guidanceText } from "@/lib/guidance";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!caregiverAuthorized(request)) return Response.json({ message: "Please unlock Milo first." }, { status: 401 });
  try {
    const household = await getHousehold();
    return Response.json({ facts: household.patient ? await listFacts(await ensureDatabase(), household.patient.id) : [] }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Memory facts are unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  try {
    const text = guidanceText(JSON.parse(new TextDecoder().decode(await boundedBody(request, 2000))).text);
    if (!text) return Response.json({ message: "Please keep it to one short line, without brackets." }, { status: 400 });
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    const fact = await addFact(await ensureDatabase(), household.patient.id, text);
    if (!fact) return Response.json({ message: "This list is full. Remove one before adding another." }, { status: 409 });
    return Response.json({ fact });
  } catch { return Response.json({ message: "The fact could not be saved. Please try again." }, { status: 503 }); }
}
