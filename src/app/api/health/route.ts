import { ensureDatabase } from "@/lib/db/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providers = {
    gemini: { configured: Boolean(process.env.GEMINI_API_KEY?.trim()) },
    elevenlabs: { configured: Boolean(process.env.ELEVENLABS_API_KEY?.trim()) },
    anthropic: { configured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()) },
    typesafe: { configured: Boolean(process.env.TYPESAFE_API_KEY?.trim()) },
  };
  const configured = Boolean(process.env.DATABASE_URL?.trim());
  try {
    const pool = await ensureDatabase();
    await pool.query("SELECT 1");
    return Response.json({
      status: providers.gemini.configured && providers.elevenlabs.configured && providers.anthropic.configured ? "ok" : "setup_required",
      phase: 4,
      database: { configured, ready: true, engine: "postgresql" },
      providers,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({
      status: "unavailable",
      phase: 4,
      database: { configured, ready: false, engine: "postgresql" },
      providers,
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
