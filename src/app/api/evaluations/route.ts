import { getHousehold } from "@/lib/db/repository";
import { readEvaluation } from "@/lib/db/evaluations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = params.get("conversationId");
  const evaluationId = params.get("evaluationId");
  const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
  if (!id || !evaluationId || !uuid.test(id) || !uuid.test(evaluationId)) return Response.json({ message: "Invalid conversation." }, { status: 400 });
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Setup required." }, { status: 409 });
    const evaluation = await readEvaluation(evaluationId, id, household.patient.id);
    return Response.json({ evaluation }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ message: "Evaluation unavailable." }, { status: 503 }); }
}
