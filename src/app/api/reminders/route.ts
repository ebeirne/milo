import { caregiverAuthorized } from "@/lib/access";
import { ensureDatabase } from "@/lib/db/database";
import { getHousehold } from "@/lib/db/repository";
import { addScheduleItem, listSchedule } from "@/lib/db/schedule";
import { activeVoices, isUuid, voiceById } from "@/lib/db/voices";
import { guidanceText } from "@/lib/guidance";
import { isCheckinStyle, isScheduleKind, parseDays, parseTime } from "@/lib/schedule";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!caregiverAuthorized(request)) return Response.json({ message: "Please unlock Milo first." }, { status: 401 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ items: [], voices: [] });
    const voices = (await activeVoices(household.patient.id)).map((voice) => ({ id: voice.id, name: voice.display_name }));
    return Response.json({ items: await listSchedule(await ensureDatabase(), household.patient.id), voices }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Reminders are unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !caregiverAuthorized(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  try {
    const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 2000)));
    const time = parseTime(body.time), days = parseDays(body.days);
    // A reminder is spoken exactly as the caregiver wrote it; a check-in uses one of the fixed styles.
    const text = body.kind === "reminder" ? guidanceText(body.text) : isCheckinStyle(body.style) ? body.style : null;
    const voiceId = body.voiceId ? String(body.voiceId) : null;
    if (!isScheduleKind(body.kind) || !time || !days || !text || (voiceId && !isUuid(voiceId))) return Response.json({ message: "Please choose a time and at least one day, and keep the reminder to one short line." }, { status: 400 });
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    const database = await ensureDatabase();
    if (voiceId && !await voiceById(database, voiceId, household.patient.id)) return Response.json({ message: "That voice is no longer available." }, { status: 400 });
    const id = await addScheduleItem(database, household.patient.id, { kind: body.kind, text, time, days, voiceId });
    if (!id) return Response.json({ message: "This list is full. Remove one before adding another." }, { status: 409 });
    return Response.json({ items: await listSchedule(database, household.patient.id) });
  } catch { return Response.json({ message: "That could not be saved. Please try again." }, { status: 503 }); }
}
