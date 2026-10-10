import { caregiverAuthorized } from "@/lib/access";
import { ensureDatabase } from "@/lib/db/database";
import { getHousehold } from "@/lib/db/repository";
import { deleteScheduleItem } from "@/lib/db/schedule";
import { isUuid } from "@/lib/db/voices";
import { isScheduleKind } from "@/lib/schedule";
import { sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const { id } = await params;
  const kind = new URL(request.url).searchParams.get("kind");
  if (!isUuid(id) || !isScheduleKind(kind)) return Response.json({ message: "Invalid reminder." }, { status: 400 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    await deleteScheduleItem(await ensureDatabase(), household.patient.id, kind, id);
    return Response.json({ deleted: true });
  } catch { return Response.json({ message: "That could not be removed. Please try again." }, { status: 503 }); }
}
