import { caregiverAuthorized } from "@/lib/access";
import { getHousehold } from "@/lib/db/repository";
import { issueRecordLink } from "@/lib/db/voices";
import { validOwnerDetails } from "@/lib/enrollment-contract";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Please unlock Milo first." }, { status: 403 });
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 3000)));
    if (typeof value.name !== "string" || typeof value.relationship !== "string" || !validOwnerDetails(value.name, value.relationship)) return Response.json({ message: "Enter the voice owner’s name and relationship." }, { status: 400 });
    const base = new URL(process.env.PUBLIC_APP_URL || new URL(request.url).origin);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || (!local && (base.protocol !== "https:" || (process.env.CAREGIVER_ACCESS_CODE?.trim().length ?? 0) < 16))) return Response.json({ message: "For remote links, set an HTTPS PUBLIC_APP_URL and a CAREGIVER_ACCESS_CODE of at least 16 characters." }, { status: 409 });
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Complete family setup first." }, { status: 409 });
    const link = await issueRecordLink(household.patient.id, value.name.trim(), value.relationship.trim());
    return Response.json({ url: new URL(`/r/${link.token}`, base).href, expiresAt: link.expiresAt, localOnly: local }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "The recording link could not be created." }, { status: 503 }); }
}
