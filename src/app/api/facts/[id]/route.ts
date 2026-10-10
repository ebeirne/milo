import { caregiverAuthorized } from "@/lib/access";
import { ensureDatabase } from "@/lib/db/database";
import { approveFact, deleteFact } from "@/lib/db/guidance";
import { getHousehold } from "@/lib/db/repository";
import { isUuid } from "@/lib/db/voices";
import { sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

// Caregiver-only: approve a fact the AI suggested, so it may be used in conversations.
export async function PATCH(request: Request, { params }: Context) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ message: "Invalid fact." }, { status: 400 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    const fact = await approveFact(await ensureDatabase(), household.patient.id, id);
    if (!fact) return Response.json({ message: "The approved list is full, or this suggestion is gone." }, { status: 409 });
    return Response.json({ fact });
  } catch { return Response.json({ message: "The fact could not be approved. Please try again." }, { status: 503 }); }
}

export async function DELETE(request: Request, { params }: Context) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ message: "Invalid fact." }, { status: 400 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    await deleteFact(await ensureDatabase(), household.patient.id, id);
    return Response.json({ deleted: true });
  } catch { return Response.json({ message: "The fact could not be removed. Please try again." }, { status: 503 }); }
}
