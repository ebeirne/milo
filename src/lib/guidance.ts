export type RuleKind = "avoid" | "steer" | "never_say";
export const RULE_KINDS: RuleKind[] = ["avoid", "steer", "never_say"];
export type TopicRule = { id: string; kind: RuleKind; text: string };
export type MemoryFact = { id: string; text: string; source: "caregiver" | "proposed"; approved: boolean };
// What the caregiver has approved for prompts. Unapproved facts are never part of it.
export type Guidance = { avoid: string[]; steer: string[]; neverSay: string[]; facts: string[] };

export const MAX_RULES_PER_KIND = 10;
export const MAX_FACTS = 30;
export const MAX_PENDING_FACTS = 20;

export const isRuleKind = (value: unknown): value is RuleKind => RULE_KINDS.includes(value as RuleKind);
// Rule and fact text is quoted into prompts as data, so control-label and markup characters are refused, as for persona text.
export const guidanceText = (value: unknown): string | null => typeof value === "string" && value.trim() && value.trim().length <= 200 && !/[\r\n\[\]<>{}]/.test(value) ? value.trim() : null;
