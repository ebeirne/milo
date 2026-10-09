import { ensureDatabase } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providers = {
    gemini: { configured: Boolean(process.env.GEMINI_API_KEY?.trim()) },
    elevenlabs: { configured: Boolean(process.env.ELEVENLABS_API_KEY?.trim()) },
  };
  const configured = Boolean(process.env.DATABASE_URL?.trim());
  try {
    const pool = await ensureDatabase();
    await pool.query("SELECT 1");
    return Response.json({
      status: providers.gemini.configured && providers.elevenlabs.configured ? "ok" : "setup_required",
      phase: 0,
      database: { configured, ready: true, engine: "postgresql" },
      providers,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({
      status: "unavailable",
      phase: 0,
      database: { configured, ready: false, engine: "postgresql" },
      providers,
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
