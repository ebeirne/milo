import { createHash } from "node:crypto";
import type { RotationPolicy } from "../persona";

export type Candidate = { id: string };
export type LastSpeaker = { id: string; streak: number; recent: string[] } | null;
export type Choice = { voice: Candidate; switched: boolean; previousId: string | null };

// Deliberately conservative: when the person recently sounded upset, keep the familiar voice.
const DISTRESS = /\b(scared|afraid|frightened|lost|lonely|alone|worried|anxious|upset|crying|cry|sad|hurt|pain|help|confused|missing|miss|go home|where am i|don'?t know)\b/i;
export const seemsDistressed = (userTurns: string[]): boolean => userTurns.slice(-2).some((turn) => DISTRESS.test(turn));

// A stable 2-4 turn target per conversation and voice, so rotation feels varied but is repeatable.
export function turnsBeforeSwitch(conversationId: string, voiceId: string): number {
  return 2 + createHash("sha256").update(`${conversationId}:${voiceId}`).digest()[0] % 3;
}

export function chooseVoice(input: {
  policy: RotationPolicy; voices: Candidate[]; conversationId: string; last: LastSpeaker; distressed: boolean; random?: () => number;
}): Choice | null {
  const { voices, last, policy } = input;
  if (!voices.length) return null;
  const previous = last ? voices.find((voice) => voice.id === last.id) ?? null : null;
  const stay = (voice: Candidate): Choice => ({ voice, switched: false, previousId: last?.id ?? null });
  const move = (voice: Candidate): Choice => ({ voice, switched: voice.id !== last?.id, previousId: last?.id ?? null });
  if (voices.length === 1 || policy === "single") return previous ? stay(previous) : move(voices[0]);
  if (!previous) return move(voices[0]);
  if (input.distressed || last!.streak < turnsBeforeSwitch(input.conversationId, previous.id)) return stay(previous);
  if (policy === "round_robin_per_topic") return move(voices[(voices.indexOf(previous) + 1) % voices.length]);
  // Less recently used voices are favored, but every other voice remains possible.
  const others = voices.filter((voice) => voice.id !== previous.id);
  const weights = others.map((voice) => 1 + 8 - Math.min(8, last!.recent.filter((id) => id === voice.id).length));
  let roll = (input.random ?? Math.random)() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < others.length; index++) {
    roll -= weights[index];
    if (roll < 0) return move(others[index]);
  }
  return move(others[others.length - 1]);
}
