import { caregiverAuthorized } from "@/lib/access";
import { getHousehold } from "@/lib/db/repository";
import { isUuid, savePersona, setVoiceActive } from "@/lib/db/voices";
import { parsePersona } from "@/lib/persona";
import { boundedBody } from "@/lib/voice/request";
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

// Caregiver-only: edit the persona or choose whether a ready voice joins conversations.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ message: "Invalid voice." }, { status: 400 });
  try {
    const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000)));
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    let voice = null;
    if (body.persona !== undefined) {
      const persona = parsePersona(body.persona);
      if (!persona) return Response.json({ message: "Please shorten the persona details and avoid brackets or line breaks." }, { status: 400 });
      voice = await savePersona(household.patient.id, id, persona);
    }
    if (typeof body.active === "boolean") {
      voice = await setVoiceActive(household.patient.id, id, body.active);
      if (!voice) return Response.json({ message: "Only a ready voice with a saved consent recording can be used in conversations." }, { status: 409 });
    }
    if (!voice) return Response.json({ message: "Nothing to update." }, { status: 400 });
    return Response.json({ voice });
  } catch { return Response.json({ message: "The voice could not be updated. Please try again." }, { status: 503 }); }
}
