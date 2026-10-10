import { caregiverAuthorized } from "@/lib/access";
import { getHousehold } from "@/lib/db/repository";
import { isUuid } from "@/lib/db/voices";
import { removeVoice } from "@/lib/voice/enrollment";
import { sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ message: "Invalid voice." }, { status: 400 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    await removeVoice(id, household.patient.id);
    return Response.json({ deleted: true });
  } catch (error) {
    const message = error instanceof Error && /permission|retry|review in ElevenLabs|could not be removed|could not be deleted/.test(error.message) ? error.message : "Deletion could not be completed. Please try again.";
    return Response.json({ message }, { status: 503 });
  }
}
