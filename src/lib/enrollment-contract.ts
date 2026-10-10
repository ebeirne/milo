export const SAMPLE_MIN_SECONDS = 60;
export const SAMPLE_MAX_SECONDS = 180;
export const CONSENT_MIN_SECONDS = 8;
export const CONSENT_MAX_SECONDS = 60;
export const MAX_SAMPLE_BYTES = 20 * 1024 * 1024;
export const MAX_CONSENT_BYTES = 3 * 1024 * 1024;

export function consentStatement(name: string): string {
  return `I am ${name.trim()}. I am recording my own voice. I give Familiar permission to make an AI recreation of my voice using ElevenLabs. I understand it will be clearly labeled as AI, and I can ask for it to be deleted.`;
}

const normalized = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\bi['’]m\b/g, "i am").replace(/\blabelled\b/g, "labeled").replace(/[^\p{L}\p{N}]/gu, "");
export function matchesConsent(transcript: string, name: string): boolean {
  // Match the entire statement, rather than keywords that could also appear in
  // "I do not give permission" or a later withdrawal of consent.
  return Boolean(name.trim()) && normalized(transcript) === normalized(consentStatement(name));
}

export function validOwnerDetails(name: string, relationship: string): boolean {
  return name.trim().length >= 1 && name.trim().length <= 100 && relationship.trim().length >= 1 && relationship.trim().length <= 100 && !/[\r\n\[\]<>]/.test(name + relationship);
}

export type AudioQuality = { duration: number; rms: number; clipping: number; contrast: number; speechFraction: number };
export type VoiceSummary = {
  id: string; display_name: string; relationship: string;
  cloning_status: "pending" | "ready" | "verification_required" | "failed" | "unknown" | "deleting";
  consent_recorded_at: string; created_at: string;
  active: boolean; persona: import("./persona").Persona;
};

export const SAMPLE_SCRIPT = [
  "The morning light falls softly across the room. Outside, the trees move in the breeze. There is no hurry today. A cup of tea is warming on the table, and the day is just beginning.",
  "A little conversation can make an ordinary moment feel brighter. We can talk about the weather, a favorite song, or something pleasant we noticed outside. Sometimes a quiet pause is comfortable, too. There is no need to find the perfect words.",
  "Imagine a walk through a garden. There are bright flowers beside the path, and a small bird resting on a branch. The air feels fresh. We can take our time and enjoy what is around us, one small thing at a time.",
  "As the afternoon turns toward evening, the light changes again. A book waits on the shelf. Music plays gently in the background. Simple moments can be worth noticing. We can speak slowly, breathe naturally, and let each sentence have a little space.",
  "If you need more recording time, read these paragraphs again in your normal voice. You can also describe an everyday scene. Use a warm, natural pace, as if you were having an easy conversation with someone you know.",
].join("\n\n");
