import { caregiverAuthorized } from "@/lib/access";
import { ensureDatabase } from "@/lib/db/database";
import { acknowledgeFlag } from "@/lib/db/flags";
import { getHousehold } from "@/lib/db/repository";
import { isUuid } from "@/lib/db/voices";
import { sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ message: "Invalid flag." }, { status: 400 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    await acknowledgeFlag(await ensureDatabase(), household.patient.id, id, household.caregiver?.id ?? null);
    return Response.json({ acknowledged: true });
  } catch { return Response.json({ message: "That couldn’t be saved. Please try again." }, { status: 503 }); }
}
