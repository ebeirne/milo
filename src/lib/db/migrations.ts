import type { QueryResultRow } from "pg";

export interface SqlClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

const migrations = [
  {
    version: 1,
    name: "initial_companion_schema",
    sql: `
      CREATE TABLE familiar.patient (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
        preferred_name TEXT NOT NULL CHECK (length(trim(preferred_name)) BETWEEN 1 AND 100),
        birth_year INTEGER CHECK (birth_year BETWEEN 1900 AND 2100),
        notes TEXT NOT NULL DEFAULT '',
        ai_disclosure_acknowledged_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE familiar.caregiver (
        id UUID PRIMARY KEY,
        patient_id UUID NOT NULL REFERENCES familiar.patient(id) ON DELETE CASCADE,
        name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
        email TEXT NOT NULL DEFAULT '',
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'family',
        UNIQUE (patient_id)
      );
      CREATE TABLE familiar.voice_profile (
        id UUID PRIMARY KEY,
        patient_id UUID NOT NULL REFERENCES familiar.patient(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        elevenlabs_voice_id TEXT,
        consent_recorded_at TIMESTAMPTZ,
        consent_audio_ref TEXT,
        consenter_name TEXT,
        persona_json JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(persona_json) = 'object'),
        active BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (elevenlabs_voice_id IS NULL OR (
          consent_recorded_at IS NOT NULL
          AND length(trim(consent_audio_ref)) > 0 AND consent_audio_ref IS NOT NULL
          AND length(trim(consenter_name)) > 0 AND consenter_name IS NOT NULL
        )),
        CHECK (NOT active OR elevenlabs_voice_id IS NOT NULL)
      );
      CREATE TABLE familiar.topic_rule (
        id UUID PRIMARY KEY,
        patient_id UUID NOT NULL REFERENCES familiar.patient(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK (kind IN ('avoid', 'steer', 'never_say')),
        text TEXT NOT NULL CHECK (length(trim(text)) > 0)
      );
      CREATE TABLE familiar.memory_fact (
        id UUID PRIMARY KEY,
        patient_id UUID NOT NULL REFERENCES familiar.patient(id) ON DELETE CASCADE,
        text TEXT NOT NULL CHECK (length(trim(text)) > 0),
        source TEXT NOT NULL CHECK (source IN ('caregiver', 'proposed')),
        approved_at TIMESTAMPTZ
      );
      CREATE TABLE familiar.reminder (
        id UUID PRIMARY KEY,
        patient_id UUID NOT NULL REFERENCES familiar.patient(id) ON DELETE CASCADE,
        voice_profile_id UUID REFERENCES familiar.voice_profile(id) ON DELETE SET NULL,
        text TEXT NOT NULL,
        schedule_json JSONB NOT NULL CHECK (jsonb_typeof(schedule_json) = 'object'),
        last_fired_at TIMESTAMPTZ
      );
      CREATE TABLE familiar.checkin (
        id UUID PRIMARY KEY,
        patient_id UUID NOT NULL REFERENCES familiar.patient(id) ON DELETE CASCADE,
        voice_profile_id UUID REFERENCES familiar.voice_profile(id) ON DELETE SET NULL,
        time_of_day TIME NOT NULL,
        days JSONB NOT NULL CHECK (jsonb_typeof(days) = 'array'),
        prompt_style TEXT NOT NULL
      );
      CREATE TABLE familiar.conversation (
        id UUID PRIMARY KEY,
        patient_id UUID NOT NULL REFERENCES familiar.patient(id) ON DELETE CASCADE,
        started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        ended_at TIMESTAMPTZ,
        summary TEXT,
        mood TEXT CHECK (mood IN ('calm', 'happy', 'sad', 'anxious', 'confused'))
      );
      CREATE TABLE familiar.turn (
        id UUID PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES familiar.conversation(id) ON DELETE CASCADE,
        voice_profile_id UUID REFERENCES familiar.voice_profile(id) ON DELETE SET NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE familiar.flag (
        id UUID PRIMARY KEY,
        patient_id UUID NOT NULL REFERENCES familiar.patient(id) ON DELETE CASCADE,
        conversation_id UUID REFERENCES familiar.conversation(id) ON DELETE SET NULL,
        tier TEXT NOT NULL CHECK (tier IN ('concern', 'possible_emergency', 'emergency')),
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        acknowledged_by UUID REFERENCES familiar.caregiver(id) ON DELETE SET NULL,
        acknowledged_at TIMESTAMPTZ
      );
      CREATE INDEX voice_profile_patient_idx ON familiar.voice_profile(patient_id);
      CREATE INDEX topic_rule_patient_idx ON familiar.topic_rule(patient_id);
      CREATE INDEX memory_fact_patient_idx ON familiar.memory_fact(patient_id);
      CREATE INDEX reminder_patient_idx ON familiar.reminder(patient_id);
      CREATE INDEX checkin_patient_idx ON familiar.checkin(patient_id);
      CREATE INDEX conversation_patient_idx ON familiar.conversation(patient_id, started_at);
      CREATE INDEX turn_conversation_idx ON familiar.turn(conversation_id, created_at);
      CREATE INDEX flag_patient_idx ON familiar.flag(patient_id, created_at);
    `,
  },
  {
    version: 2,
    name: "reply_evaluation",
    sql: `
      CREATE TABLE familiar.reply_evaluation (
        id UUID PRIMARY KEY,
        conversation_id UUID NOT NULL REFERENCES familiar.conversation(id) ON DELETE CASCADE,
        conversation_provider TEXT NOT NULL CHECK (conversation_provider IN ('sonnet', 'gemini')),
        status TEXT NOT NULL CHECK (status IN ('completed', 'disabled', 'unavailable')),
        model TEXT NOT NULL,
        judgments JSONB NOT NULL CHECK (jsonb_typeof(judgments) = 'object'),
        elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX reply_evaluation_conversation_idx ON familiar.reply_evaluation(conversation_id, created_at DESC);
    `,
  },
  {
    version: 3,
    name: "voice_enrollment",
    sql: `
      ALTER TABLE familiar.voice_profile ADD COLUMN cloning_status TEXT NOT NULL DEFAULT 'ready'
        CHECK (cloning_status IN ('pending', 'ready', 'verification_required', 'failed', 'unknown', 'deleting'));
      ALTER TABLE familiar.voice_profile ADD COLUMN consent_statement TEXT NOT NULL DEFAULT '';
      ALTER TABLE familiar.voice_profile ADD COLUMN sample_quality JSONB NOT NULL DEFAULT '{}'::jsonb;
      CREATE TABLE familiar.record_link (
        id UUID PRIMARY KEY,
        patient_id UUID NOT NULL REFERENCES familiar.patient(id) ON DELETE CASCADE,
        enrollment_id UUID NOT NULL UNIQUE,
        token_hash TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        relationship TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        claimed_at TIMESTAMPTZ,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX record_link_expiry_idx ON familiar.record_link(expires_at);
    `,
  },
  {
    version: 4,
    name: "voice_rotation",
    sql: `
      ALTER TABLE familiar.patient ADD COLUMN rotation_policy TEXT NOT NULL DEFAULT 'single'
        CHECK (rotation_policy IN ('single', 'round_robin_per_topic', 'random_weighted'));
    `,
  },
];

export async function applyMigrations(client: SqlClient): Promise<void> {
  await client.query("BEGIN");
  try {
    // Serialize first-time schema creation and concurrent startup processes.
    await client.query("SELECT pg_advisory_xact_lock(7264310)");
    await client.query("CREATE SCHEMA IF NOT EXISTS familiar");
    await client.query(`
      CREATE TABLE IF NOT EXISTS familiar.schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query<{ version: number }>(
      "SELECT version FROM familiar.schema_migrations ORDER BY version",
    );
    const applied = new Set(rows.map((row) => row.version));
    for (const migration of migrations) {
      if (applied.has(migration.version)) continue;
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO familiar.schema_migrations (version, name) VALUES ($1, $2)",
        [migration.version, migration.name],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
