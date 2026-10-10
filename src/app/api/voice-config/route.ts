import { getHouseholdResult } from "@/lib/db/repository";
import { providersConfigured } from "@/lib/voice/config";
import { STOCK_VOICE_LABEL, type VoiceConfig } from "@/lib/voice/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await getHouseholdResult();
  const reason = !result.available ? "database" : !result.household.patient ? "setup" : !providersConfigured() ? "providers" : undefined;
  const config: VoiceConfig = {
    ready: !reason, reason,
    preferredName: result.household?.patient?.preferred_name,
    label: STOCK_VOICE_LABEL,
  };
  return Response.json(config, { headers: { "Cache-Control": "no-store" } });
}
