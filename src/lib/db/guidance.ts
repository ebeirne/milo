import "server-only";
import { randomUUID } from "node:crypto";
import type { SqlClient } from "./migrations";
import { MAX_FACTS, MAX_PENDING_FACTS, MAX_RULES_PER_KIND, guidanceText, type Guidance, type MemoryFact, type RuleKind, type TopicRule } from "../guidance";

const FACT_COLUMNS = "id, text, source, approved_at IS NOT NULL AS approved";

export async function listRules(client: SqlClient, patientId: string): Promise<TopicRule[]> {
  const { rows } = await client.query<TopicRule>("SELECT id, kind, text FROM familiar.topic_rule WHERE patient_id=$1 ORDER BY kind, text, id", [patientId]);
  return rows;
}

// Returns null when the list for this kind is full.
export async function addRule(client: SqlClient, patientId: string, kind: RuleKind, text: string): Promise<TopicRule | null> {
  const { rows } = await client.query<TopicRule>(`
    INSERT INTO familiar.topic_rule (id, patient_id, kind, text)
    SELECT $1::uuid, $2::uuid, $3::text, $4::text WHERE (SELECT count(*) FROM familiar.topic_rule WHERE patient_id=$2::uuid AND kind=$3::text) < $5::int
    RETURNING id, kind, text
  `, [randomUUID(), patientId, kind, text, MAX_RULES_PER_KIND]);
  return rows[0] ?? null;
}

export async function deleteRule(client: SqlClient, patientId: string, id: string): Promise<void> {
  await client.query("DELETE FROM familiar.topic_rule WHERE id=$1 AND patient_id=$2", [id, patientId]);
}

export async function listFacts(client: SqlClient, patientId: string): Promise<MemoryFact[]> {
  const { rows } = await client.query<MemoryFact>(`SELECT ${FACT_COLUMNS} FROM familiar.memory_fact WHERE patient_id=$1 ORDER BY approved_at NULLS FIRST, text, id`, [patientId]);
  return rows;
}

// A caregiver's own fact is approved as it is saved. Returns null when the approved list is full.
export async function addFact(client: SqlClient, patientId: string, text: string): Promise<MemoryFact | null> {
  const { rows } = await client.query<MemoryFact>(`
    INSERT INTO familiar.memory_fact (id, patient_id, text, source, approved_at)
    SELECT $1::uuid, $2::uuid, $3::text, 'caregiver', now() WHERE (SELECT count(*) FROM familiar.memory_fact WHERE patient_id=$2::uuid AND approved_at IS NOT NULL) < $4::int
    RETURNING ${FACT_COLUMNS}
  `, [randomUUID(), patientId, text, MAX_FACTS]);
  return rows[0] ?? null;
}

// Facts the AI suggests wait in the review queue; nothing here reaches a prompt until a caregiver approves it.
export async function proposeFacts(client: SqlClient, patientId: string, suggestions: string[]): Promise<void> {
  for (const suggestion of suggestions.slice(0, 2)) {
    const text = guidanceText(suggestion);
    if (!text) continue;
    await client.query(`
      INSERT INTO familiar.memory_fact (id, patient_id, text, source)
      SELECT $1::uuid, $2::uuid, $3::text, 'proposed'
      WHERE NOT EXISTS (SELECT 1 FROM familiar.memory_fact WHERE patient_id=$2::uuid AND lower(text)=lower($3::text))
        AND (SELECT count(*) FROM familiar.memory_fact WHERE patient_id=$2::uuid AND approved_at IS NULL) < $4::int
    `, [randomUUID(), patientId, text, MAX_PENDING_FACTS]);
  }
}

export async function approveFact(client: SqlClient, patientId: string, id: string): Promise<MemoryFact | null> {
  const { rows } = await client.query<MemoryFact>(`
    UPDATE familiar.memory_fact SET approved_at=COALESCE(approved_at, now())
    WHERE id=$1 AND patient_id=$2 AND (approved_at IS NOT NULL OR (SELECT count(*) FROM familiar.memory_fact WHERE patient_id=$2 AND approved_at IS NOT NULL) < $3::int)
    RETURNING ${FACT_COLUMNS}
  `, [id, patientId, MAX_FACTS]);
  return rows[0] ?? null;
}

export async function deleteFact(client: SqlClient, patientId: string, id: string): Promise<void> {
  await client.query("DELETE FROM familiar.memory_fact WHERE id=$1 AND patient_id=$2", [id, patientId]);
}

export async function promptGuidance(client: SqlClient, patientId: string): Promise<Guidance> {
  const rules = await listRules(client, patientId);
  const { rows: facts } = await client.query<{ text: string }>("SELECT text FROM familiar.memory_fact WHERE patient_id=$1 AND approved_at IS NOT NULL ORDER BY approved_at, id LIMIT $2", [patientId, MAX_FACTS]);
  const of = (kind: RuleKind) => rules.filter((rule) => rule.kind === kind).map((rule) => rule.text);
  return { avoid: of("avoid"), steer: of("steer"), neverSay: of("never_say"), facts: facts.map((fact) => fact.text) };
}

// The first acknowledgement is kept; the onboarding screen is shown once.
export async function acknowledgeDisclosure(client: SqlClient, patientId: string): Promise<void> {
  await client.query("UPDATE familiar.patient SET ai_disclosure_acknowledged_at=COALESCE(ai_disclosure_acknowledged_at, now()) WHERE id=$1", [patientId]);
}
