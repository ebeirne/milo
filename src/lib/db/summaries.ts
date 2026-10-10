import "server-only";
import type { SqlClient } from "./migrations";
import type { HistoryTurn } from "../voice/gemini";
import type { Mood } from "../voice/summary";

export type ConversationSummary = { id: string; started_at: string; summary: string; mood: Mood | null };

// Conversations from the last week with turns the current summary has not seen. Capped so one page load stays quick.
export async function conversationsToSummarize(client: SqlClient, patientId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(`
    SELECT c.id FROM familiar.conversation c
    WHERE c.patient_id=$1 AND c.started_at > now() - interval '7 days'
      AND EXISTS (SELECT 1 FROM familiar.turn t WHERE t.conversation_id=c.id AND (c.summarized_at IS NULL OR t.created_at > c.summarized_at))
    ORDER BY c.started_at DESC LIMIT 4
  `, [patientId]);
  return rows.map((row) => row.id);
}

export async function conversationTurns(client: SqlClient, conversationId: string): Promise<HistoryTurn[]> {
  const { rows } = await client.query<HistoryTurn>("SELECT role, text FROM (SELECT role, text, created_at, id FROM familiar.turn WHERE conversation_id=$1 ORDER BY created_at DESC, id DESC LIMIT 40) recent ORDER BY created_at, id", [conversationId]);
  return rows;
}

export async function saveSummary(client: SqlClient, conversationId: string, summary: string, mood: Mood): Promise<void> {
  await client.query("UPDATE familiar.conversation SET summary=$2, mood=$3, summarized_at=now() WHERE id=$1", [conversationId, summary, mood]);
}

// Summaries outlive the seven-day turn retention; raw turns are never returned to the caregiver view.
export async function recentSummaries(client: SqlClient, patientId: string): Promise<ConversationSummary[]> {
  const { rows } = await client.query<Omit<ConversationSummary, "started_at"> & { started_at: Date | string }>("SELECT id, started_at, summary, mood FROM familiar.conversation WHERE patient_id=$1 AND summary IS NOT NULL AND started_at > now() - interval '7 days' ORDER BY started_at DESC LIMIT 20", [patientId]);
  return rows.map((row) => ({ ...row, started_at: row.started_at instanceof Date ? row.started_at.toISOString() : String(row.started_at) }));
}
