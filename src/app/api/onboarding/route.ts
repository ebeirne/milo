import { ensureDatabase } from "@/lib/db/database";
import { acknowledgeDisclosure } from "@/lib/db/guidance";
import { getHousehold } from "@/lib/db/repository";
import { sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";

// Records that the person has been told the voices are AI and what family can see.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    await acknowledgeDisclosure(await ensureDatabase(), household.patient.id);
    return Response.json({ acknowledged: true });
  } catch { return Response.json({ message: "That couldn’t be saved. Please try again." }, { status: 503 }); }
}
