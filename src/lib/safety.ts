export type Tier = "concern" | "possible_emergency" | "emergency";
export type SafetyKind = "general" | "self_harm";
export type Safety = { tier: Tier; kind: SafetyKind; reason: string };

const ORDER: Tier[] = ["concern", "possible_emergency", "emergency"];
export const isTier = (value: unknown): value is Tier => ORDER.includes(value as Tier);
export const higherTier = (a: Tier | null, b: Tier | null): Tier | null => !a ? b : !b ? a : ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;

// The deterministic screen (PROJECT section 8). All safety phrases live here so they are easy to review.
// It deliberately leans toward flagging: a false alarm costs a caregiver a glance, a miss costs far more.
// Reasons are categories, never the person's words, so flags do not copy speech into the caregiver view.
const PHRASES: { tier: Tier; kind?: SafetyKind; reason: string; pattern: RegExp }[] = [
  { tier: "emergency", kind: "self_harm", reason: "Talked about not wanting to live or hurting themselves", pattern: /\b(want(ed)? to die|kill myself|end my life|end it all|better off dead|better off without me|don'?t want to (live|be here|go on|wake up)|hurt(ing)? myself|suicid\w*)\b/gi },
  { tier: "emergency", reason: "Trouble breathing", pattern: /\b(can'?t|cannot|can not|hard to|trouble|struggling to) breath(e|ing)\b/gi },
  { tier: "emergency", reason: "Chest pain", pattern: /\b(chest (pain|pains|hurts|is hurting|is tight|feels tight|tightness)|pain in my chest)\b/gi },
  { tier: "emergency", reason: "Described a medical emergency", pattern: /\b(heart attack|having a stroke|bleeding (a lot|badly|heavily)|won'?t stop bleeding|took too many (pills|tablets)|overdose[d]?|call (911|9-1-1|an ambulance|the ambulance)|need an ambulance)\b/gi },
  { tier: "possible_emergency", reason: "Mentioned a fall", pattern: /\b(i (just )?fell|i'?ve fallen|i have fallen|i had a fall|fell (down|over)|on the floor)\b/gi },
  { tier: "possible_emergency", reason: "May be lost or feel unsafe", pattern: /\b(i'?m lost|i am lost|don'?t know where i am|not safe|unsafe|in danger|someone is (in my house|at the door|breaking in|trying to get in)|smell (gas|smoke)|there'?s a fire)\b/gi },
  { tier: "possible_emergency", reason: "Mentioned pain", pattern: /\b(hurts?|hurting|in pain|a lot of pain|bad pain|terrible pain|pain in my)\b/gi },
  { tier: "possible_emergency", reason: "Asked for help", pattern: /\b(help me|i need help|somebody help|someone help)\b/gi },
  { tier: "possible_emergency", reason: "Felt faint or unable to get up", pattern: /\b(dizzy|faint|fainted|passed out|can'?t (stand|get) up|can'?t move)\b/gi },
  { tier: "concern", reason: "May have missed medication", pattern: /\b((didn'?t|did not|haven'?t|have not|forgot to|forgotten to|won'?t|not going to|stopped) (take|taken|taking) my (pills?|tablets?|medicine|medication|meds)|skipped my (pills?|tablets?|medicine|medication|meds))\b/gi },
  { tier: "concern", reason: "Sounded lonely", pattern: /\b(lonely|all alone|so alone|nobody (visits|comes|calls|cares)|no one (visits|comes|calls|cares))\b/gi },
  { tier: "concern", reason: "Sounded low or frightened", pattern: /\b(hopeless|crying|miserable|depressed|scared|frightened|afraid|so sad|very sad|feel sad|feeling sad)\b/gi },
  { tier: "concern", reason: "Sounded confused", pattern: /\b(confused|can'?t remember|don'?t (know|remember) (what day|who you are|who i am|where i live))\b/gi },
];

// "My hip doesn't hurt anymore" and "I didn't fall" must not raise a flag.
const NEGATED_BEFORE = /(\bno\b|\bnot\b|\bnever\b|\bwithout\b|n'?t\b|\bno longer\b)[^.?!,;]{0,12}$/i;
const RESOLVED_AFTER = /^[^.?!,;]{0,20}\b(anymore|any more|any longer|has gone|went away|is gone)\b/i;

export function screenText(text: string): Safety | null {
  let found: Safety | null = null;
  for (const phrase of PHRASES) {
    for (const match of text.matchAll(phrase.pattern)) {
      const start = match.index;
      // Self-harm and missed-medication phrases are already negative ("don't want to be here anymore"), so they are never discounted.
      const discountable = phrase.kind !== "self_harm" && phrase.reason !== "May have missed medication";
      if (discountable && (NEGATED_BEFORE.test(text.slice(Math.max(0, start - 40), start)) || RESOLVED_AFTER.test(text.slice(start + match[0].length)))) continue;
      if (!found || higherTier(found.tier, phrase.tier) !== found.tier) found = { tier: phrase.tier, kind: phrase.kind ?? "general", reason: phrase.reason };
      break;
    }
  }
  return found;
}

// After "Do you need help?", a plain yes is a confirmation; anything else is left to the screen above.
export const confirmsHelp = (text: string): boolean => /^\s*(yes|yeah|yep|yes please|please|i do|i think so)\b/i.test(text) && !/\b(no|not|fine|okay|ok|all right|alright)\b/i.test(text);

// Combines the deterministic screen with the model's own [[flag:…]] label; either one can escalate.
export function assess(text: string, modelTier: Tier | null, awaitingConfirmation = false): Safety | null {
  const screened = screenText(text);
  if (awaitingConfirmation && confirmsHelp(text)) return { tier: "emergency", kind: screened?.kind ?? "general", reason: "Said yes when asked if they need help" };
  if (modelTier && higherTier(screened?.tier ?? null, modelTier) !== (screened?.tier ?? null)) return { tier: modelTier, kind: screened?.kind ?? "general", reason: screened?.reason ?? "The companion noticed something worrying" };
  return screened;
}
