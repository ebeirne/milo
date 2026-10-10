import "server-only";
import { randomUUID } from "node:crypto";
import { ensureDatabase, withTransaction } from "./database";
import type { HistoryTurn } from "../voice/gemini";

export async function openConversation(patientId: string, previousId: string | null): Promise<{ id: string; history: HistoryTurn[] }> {
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
  return { id, history };
}

export async function saveConversationTurn(conversationId: string, heard: string, reply: string): Promise<void> {
  await withTransaction(async (client) => {
    // Distinct timestamps keep deterministic order within one transaction.
    await client.query(`
      INSERT INTO familiar.turn (id, conversation_id, role, text, created_at)
      VALUES ($1, $2, 'user', $3, clock_timestamp()),
             ($4, $2, 'assistant', $5, clock_timestamp() + interval '1 millisecond')
    `, [randomUUID(), conversationId, heard.slice(0, 2000), randomUUID(), reply.slice(0, 1000)]);
  });
}
