import "server-only";
import { randomUUID } from "node:crypto";
import { ensureDatabase, withTransaction } from "./database";
import type { SqlClient } from "./migrations";
import { validateSetup, type SetupInput } from "../setup";

export type Patient = {
  id: string;
  name: string;
  preferred_name: string;
};

export type Caregiver = {
  id: string;
  name: string;
  email: string;
  role: "family" | "friend" | "self";
};

export type Household = {
  patient: Patient | null;
  caregiver: Caregiver | null;
  voiceCount: number;
};

export async function readHousehold(client: SqlClient): Promise<Household> {
  const { rows: patients } = await client.query<Patient>(
    "SELECT id, name, preferred_name FROM familiar.patient ORDER BY created_at, id LIMIT 1",
  );
  const patient = patients[0] ?? null;
  if (!patient) return { patient: null, caregiver: null, voiceCount: 0 };
  const { rows: caregivers } = await client.query<Caregiver>(
    "SELECT id, name, email, role FROM familiar.caregiver WHERE patient_id = $1 LIMIT 1",
    [patient.id],
  );
  const { rows: counts } = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM familiar.voice_profile WHERE patient_id = $1 AND active = TRUE",
    [patient.id],
  );
  return { patient, caregiver: caregivers[0] ?? null, voiceCount: counts[0].count };
}

export async function getHousehold(): Promise<Household> {
  return readHousehold(await ensureDatabase());
}

// Must run in a transaction. The lock prevents duplicate initial setup submissions.
export async function writeHousehold(client: SqlClient, input: SetupInput): Promise<void> {
  if (Object.keys(validateSetup(input)).length) throw new Error("Invalid setup details");
  await client.query("SELECT pg_advisory_xact_lock(7264311)");
  const household = await readHousehold(client);
  const patientId = household.patient?.id ?? randomUUID();
  await client.query(`
    INSERT INTO familiar.patient (id, name, preferred_name) VALUES ($1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, preferred_name = EXCLUDED.preferred_name
  `, [patientId, input.patientName.trim(), input.preferredName.trim()]);
  await client.query(`
    INSERT INTO familiar.caregiver (id, patient_id, name, email, role) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (patient_id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role
  `, [household.caregiver?.id ?? randomUUID(), patientId, input.caregiverName.trim(), input.caregiverEmail.trim(), input.caregiverRole]);
}

export async function saveHousehold(input: SetupInput): Promise<void> {
  await withTransaction((client) => writeHousehold(client, input));
}

export type HouseholdResult =
  | { available: true; household: Household }
  | { available: false; household: null };

export async function getHouseholdResult(): Promise<HouseholdResult> {
  try {
    return { available: true, household: await getHousehold() };
  } catch {
    return { available: false, household: null };
  }
}
