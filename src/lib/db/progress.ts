import "server-only";
import { ensureDatabase } from "./database";
import { listFacts, listRules } from "./guidance";
import { listSchedule } from "./schedule";
import { listFlags } from "./flags";
import { listVoices } from "./voices";

export type Progress = { voices: number; activeVoices: number; rules: number; facts: number; pendingFacts: number; reminders: number; checkins: number; openFlags: number };

// Counts for the family space's step list. Each step reads the same tables its own page does.
export async function householdProgress(patientId: string): Promise<Progress | null> {
  try {
    const pool = await ensureDatabase();
    const [voices, rules, facts, schedule, flags] = await Promise.all([listVoices(patientId), listRules(pool, patientId), listFacts(pool, patientId), listSchedule(pool, patientId), listFlags(pool, patientId)]);
    return {
      voices: voices.length, activeVoices: voices.filter((voice) => voice.active).length,
      rules: rules.length, facts: facts.filter((fact) => fact.approved).length, pendingFacts: facts.filter((fact) => !fact.approved).length,
      reminders: schedule.filter((item) => item.kind === "reminder").length, checkins: schedule.filter((item) => item.kind === "checkin").length,
      openFlags: flags.filter((flag) => !flag.acknowledged).length,
    };
  } catch {
    return null;
  }
}
