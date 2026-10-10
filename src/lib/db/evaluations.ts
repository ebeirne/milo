import "server-only";
import { ensureDatabase } from "./database";
import type { Evaluation } from "../voice/jev";

export async function saveEvaluation(id: string, conversationId: string, provider: "sonnet" | "gemini", evaluation: Evaluation): Promise<void> {
  const pool = await ensureDatabase();
  await pool.query("DELETE FROM familiar.reply_evaluation WHERE created_at < now() - interval '7 days'");
  await pool.query(`
    INSERT INTO familiar.reply_evaluation (id, conversation_id, conversation_provider, status, model, judgments, elapsed_ms)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [id, conversationId, provider, evaluation.status, evaluation.model, evaluation.judgments, evaluation.elapsedMs]);
}

export async function readEvaluation(id: string, conversationId: string, patientId: string): Promise<Evaluation | null> {
  const pool = await ensureDatabase();
  const { rows } = await pool.query<{ status: Evaluation["status"]; model: string; judgments: Evaluation["judgments"]; elapsed_ms: number }>(`
    SELECT e.status, e.model, e.judgments, e.elapsed_ms
    FROM familiar.reply_evaluation e JOIN familiar.conversation c ON c.id = e.conversation_id
    WHERE e.id = $1 AND c.id = $2 AND c.patient_id = $3 AND e.created_at >= now() - interval '7 days'
    LIMIT 1
  `, [id, conversationId, patientId]);
  const row = rows[0];
  return row ? { status: row.status, model: row.model, judgments: row.judgments, elapsedMs: row.elapsed_ms } : null;
}
