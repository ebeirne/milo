import { caregiverAuthorized } from "@/lib/access";
import { getHousehold } from "@/lib/db/repository";
import { getRotationPolicy, setRotationPolicy } from "@/lib/db/voices";
import { isRotationPolicy } from "@/lib/persona";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!caregiverAuthorized(request)) return Response.json({ message: "Please unlock Milo first." }, { status: 401 });
  try {
    const household = await getHousehold();
    return Response.json({ policy: household.patient ? await getRotationPolicy(household.patient.id) : "single" }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Rotation settings are unavailable." }, { status: 503 }); }
}

export async function PUT(request: Request) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 500)));
    if (!isRotationPolicy(value.policy)) return Response.json({ message: "Unknown rotation choice." }, { status: 400 });
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    await setRotationPolicy(household.patient.id, value.policy);
    return Response.json({ policy: value.policy });
  } catch { return Response.json({ message: "The setting could not be saved." }, { status: 503 }); }
}
