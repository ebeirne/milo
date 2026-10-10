import { ensureDatabase } from "@/lib/db/database";
import { findRecordLink } from "@/lib/db/voices";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const link = await findRecordLink(await ensureDatabase(), token);
    if (!link) return Response.json({ message: "This recording link has expired or was already used." }, { status: 410 });
    return Response.json({ name: link.display_name, relationship: link.relationship, submissionId: link.enrollment_id, expiresAt: link.expires_at.toISOString() }, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return Response.json({ message: "This recording link is unavailable right now." }, { status: 503 }); }
}
