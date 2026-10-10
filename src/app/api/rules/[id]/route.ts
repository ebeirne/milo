import { caregiverAuthorized } from "@/lib/access";
import { ensureDatabase } from "@/lib/db/database";
import { deleteRule } from "@/lib/db/guidance";
import { getHousehold } from "@/lib/db/repository";
import { isUuid } from "@/lib/db/voices";
import { sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ message: "Invalid rule." }, { status: 400 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    await deleteRule(await ensureDatabase(), household.patient.id, id);
    return Response.json({ deleted: true });
  } catch { return Response.json({ message: "The rule could not be removed. Please try again." }, { status: 503 }); }
}
