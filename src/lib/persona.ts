export type Persona = {
  how_they_talk: string;
  pet_names: string[];
  humor: string;
  shared_facts: string[];
  never_claim: string[];
};

export const EMPTY_PERSONA: Persona = { how_they_talk: "", pet_names: [], humor: "", shared_facts: [], never_claim: [] };
export type RotationPolicy = "single" | "round_robin_per_topic" | "random_weighted";
export const ROTATION_POLICIES: RotationPolicy[] = ["single", "round_robin_per_topic", "random_weighted"];

// Persona text is quoted into prompts as data, so control-label and markup characters are refused.
const unsafe = /[\r\n\[\]<>{}]/;
const text = (value: unknown, max: number): string | null => typeof value === "string" && value.trim().length <= max && !unsafe.test(value) ? value.trim() : null;
const list = (value: unknown, count: number, max: number): string[] | null => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > count) return null;
  const items: string[] = [];
  for (const item of value) {
    const clean = text(item, max);
    if (clean === null) return null;
    if (clean) items.push(clean);
  }
  return items;
};

export function parsePersona(value: unknown): Persona | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const how = text(input.how_they_talk ?? "", 300), humor = text(input.humor ?? "", 200);
  const pets = list(input.pet_names, 5, 30), facts = list(input.shared_facts, 8, 200), never = list(input.never_claim, 8, 150);
  if (how === null || humor === null || !pets || !facts || !never) return null;
  return { how_they_talk: how, pet_names: pets, humor, shared_facts: facts, never_claim: never };
}

export const isRotationPolicy = (value: unknown): value is RotationPolicy => ROTATION_POLICIES.includes(value as RotationPolicy);
