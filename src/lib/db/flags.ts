import "server-only";
import { randomUUID } from "node:crypto";
import type { SqlClient } from "./migrations";
import type { Safety, SafetyKind, Tier } from "../safety";

export type Flag = { id: string; tier: Tier; kind: SafetyKind; reason: string; created_at: string; acknowledged: boolean };

// Returns false when the same concern was already recorded for this conversation in the last ten minutes.
export async function addFlag(client: SqlClient, patientId: string, conversationId: string | null, safety: Safety): Promise<boolean> {
  const { rows } = await client.query(`
    INSERT INTO familiar.flag (id, patient_id, conversation_id, tier, kind, reason)
    SELECT $1::uuid, $2::uuid, $3::uuid, $4::text, $5::text, $6::text
    WHERE NOT EXISTS (SELECT 1 FROM familiar.flag WHERE patient_id=$2::uuid AND conversation_id IS NOT DISTINCT FROM $3::uuid AND tier=$4::text AND reason=$6::text AND created_at > now() - interval '10 minutes')
    RETURNING id
  `, [randomUUID(), patientId, conversationId, safety.tier, safety.kind, safety.reason]);
  return rows.length > 0;
}

// True while the companion's "Do you need help?" is still the latest safety event in this conversation.
export async function awaitingHelpAnswer(client: SqlClient, conversationId: string): Promise<boolean> {
  const { rows } = await client.query<{ tier: Tier }>("SELECT tier FROM familiar.flag WHERE conversation_id=$1 AND tier <> 'concern' AND created_at > now() - interval '10 minutes' ORDER BY created_at DESC LIMIT 1", [conversationId]);
  return rows[0]?.tier === "possible_emergency";
}

export async function listFlags(client: SqlClient, patientId: string): Promise<Flag[]> {
  const { rows } = await client.query<Omit<Flag, "created_at"> & { created_at: Date | string }>(`
    SELECT id, tier, kind, reason, created_at, acknowledged_at IS NOT NULL AS acknowledged FROM familiar.flag
    WHERE patient_id=$1 AND created_at > now() - interval '7 days' ORDER BY acknowledged_at IS NOT NULL, created_at DESC LIMIT 50
  `, [patientId]);
  return rows.map((row) => ({ ...row, created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at) }));
}

export async function acknowledgeFlag(client: SqlClient, patientId: string, id: string, caregiverId: string | null): Promise<void> {
  await client.query("UPDATE familiar.flag SET acknowledged_at=COALESCE(acknowledged_at, now()), acknowledged_by=COALESCE(acknowledged_by, $3) WHERE id=$1 AND patient_id=$2", [id, patientId, caregiverId]);
}
