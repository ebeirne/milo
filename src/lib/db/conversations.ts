import "server-only";
import { randomUUID } from "node:crypto";
import { ensureDatabase, withTransaction } from "./database";
import type { HistoryTurn } from "../voice/gemini";

export type ConversationState = { id: string; history: HistoryTurn[]; last: { id: string; streak: number; recent: string[] } | null; userTurns: string[] };

export async function openConversation(patientId: string, previousId: string | null): Promise<ConversationState> {
  const pool = await ensureDatabase();
  // The brief's default retention window; raw audio is never stored.
  await pool.query("DELETE FROM familiar.turn WHERE created_at < now() - interval '7 days'");
  let id = previousId;
  if (id) {
    const found = await pool.query("SELECT id FROM familiar.conversation WHERE id = $1 AND patient_id = $2 AND ended_at IS NULL", [id, patientId]);
    if (!found.rowCount) throw new Error("Conversation not found");
  } else {
    id = randomUUID();
    await pool.query("INSERT INTO familiar.conversation (id, patient_id) VALUES ($1, $2)", [id, patientId]);
  }
  const { rows } = await pool.query<HistoryTurn>(
    "SELECT role, text FROM familiar.turn WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT 8", [id],
  );
  const history: HistoryTurn[] = [];
  let characters = 0;
  for (const turn of rows) {
    const text = turn.text.slice(0, 2000);
    if (characters + text.length > 8000) break;
    characters += text.length;
    history.unshift({ role: turn.role, text });
  }
  // The speaking voice is stored per assistant turn, so rotation is derived from persisted state.
  const { rows: spoken } = await pool.query<{ voice_profile_id: string | null }>(
    "SELECT voice_profile_id FROM familiar.turn WHERE conversation_id = $1 AND role = 'assistant' ORDER BY created_at DESC, id DESC LIMIT 8", [id]);
  const recent = spoken.map((row) => row.voice_profile_id).filter((value): value is string => Boolean(value));
  const lastId = spoken[0]?.voice_profile_id ?? null;
  let streak = 0;
  for (const row of spoken) { if (row.voice_profile_id !== lastId) break; streak++; }
  return { id, history, last: lastId ? { id: lastId, streak, recent } : null, userTurns: history.filter((turn) => turn.role === "user").map((turn) => turn.text) };
}

export async function saveConversationTurn(conversationId: string, heard: string, reply: string, voiceId: string | null = null): Promise<void> {
  await withTransaction(async (client) => {
    // Distinct timestamps keep deterministic order within one transaction.
    await client.query(`
      INSERT INTO familiar.turn (id, conversation_id, role, text, created_at, voice_profile_id)
      VALUES ($1, $2, 'user', $3, clock_timestamp(), NULL),
             ($4, $2, 'assistant', $5, clock_timestamp() + interval '1 millisecond', $6)
    `, [randomUUID(), conversationId, heard.slice(0, 2000), randomUUID(), reply.slice(0, 1000), voiceId]);
  });
}
