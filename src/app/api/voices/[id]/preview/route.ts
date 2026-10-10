import { caregiverAuthorized } from "@/lib/access";
import { ensureDatabase } from "@/lib/db/database";
import { getHousehold } from "@/lib/db/repository";
import { findRecordLink, isUuid } from "@/lib/db/voices";
import { consentedVoice } from "@/lib/voice/enrollment";
import { previewClone } from "@/lib/voice/cloning-provider";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ message: "Invalid voice." }, { status: 400 });
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 2000)));
    let patientId: string;
    if (typeof value.token === "string" && value.token) {
      const link = await findRecordLink(await ensureDatabase(), value.token, true);
      if (!link || !link.used_at || link.enrollment_id !== id) return Response.json({ message: "This preview link is unavailable." }, { status: 410 });
      patientId = link.patient_id;
    } else {
      if (!caregiverAuthorized(request)) return Response.json({ message: "Please unlock Familiar first." }, { status: 401 });
      const household = await getHousehold();
      if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
      patientId = household.patient.id;
    }
    const voice = await consentedVoice(id, patientId);
    if (!voice) return Response.json({ message: "A verified consent record and ready voice are required for preview." }, { status: 409 });
    const response = await previewClone(voice.elevenlabs_voice_id!, voice.display_name, request.signal);
    return new Response(response.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "The preview could not be played. Check the provider’s voice verification status and try again." }, { status: 503 }); }
}
