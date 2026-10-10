// Jev audits the landing page: what to keep, trim, cut or merge, and which animations would help.
// Jev does not invent; it judges each section and each proposed animation against the brief.
// Choice answers wobble when options are close, so each is asked three times and averaged.
//   node --env-file-if-exists=.env.local --import tsx scripts/jev-site.ts   -> prints the table, writes scripts/jev-site.json
import { writeFile } from "node:fs/promises";

const BRIEF = [
  "The site is for Milo, a voice companion for people with mild memory loss that can speak in their family's voices, recorded with permission. Its readers are adult children and grandchildren deciding whether to set it up.",
  "The owner wants it to look and feel like augen.pro: very few words, lots of white space, big simple type, light and dark sections in turn, a single blue accent, and motion that is calm and purposeful, never decorative.",
  "The page has no menu; it is read only by scrolling, and the only way on is the setup link at the end.",
  "Milo is the product name, not a person.",
];

const SECTIONS: Record<string, string> = {
  hero: "White, full screen. AI portraits of a grandfather and his granddaughter back to back, faces in soft overhead shadow, fading into fog. Bottom left: the wordmark milo, the headline 'A familiar voice, whenever they need one.', then 'Explore' and three chips (T¹ Talk, V¹ Voices, D¹ Day) that scroll to the rows below. Motion: the portraits drift apart and fade as you scroll.",
  overview: "Grey. Side label 'Overview / μιλώ · I speak'. One statement: 'Milo is a voice companion for people with mild memory loss. It can speak in family voices, always with permission.' A link 'Hear a sample' scrolls to the sample. Motion: the block blurs in.",
  rows: "Dark. Three numbered rows: '01 T¹ Talk: One tap to talk. Short, warm replies.', '02 V¹ Voices: Their family's voices, with consent', '03 D¹ Day: Family sees how the day went, not every word'. Motion: each row brightens as it reaches the middle of the screen.",
  giant: "Off-white. A small icon and 'Built for them', then the words 'Warm Voices' in huge blue type on two lines that drift past each other as you scroll, then the line 'Milo listens and answers in short, warm sentences. One tap to talk.'",
  sample: "White. 'Hear a sample'. The sentence 'Good morning, Grandpa. You're hearing an AI version of Nia's voice. How are the roses doing?' in big type; each word lights up as a recording plays. A Play sample button with a timer, and the caption 'A stock voice standing in for a family voice.'",
  facts: "Near black. Three short facts: 'Made for: People with mild dementia who spend time alone', 'Built on: Claude, Gemini and ElevenLabs', 'Works on: Phones, tablets and computers'. Then '04 How Milo talks' with three bracketed codes: [Lbl¹] Always labeled as AI, [Cns²] Consent before any voice, [Mem³] No invented memories.",
  rhythm: "Black. 'How it works', the title 'The daily rhythm' sharpening word by word as you scroll, 'Reminders and check-ins: Set a reminder once. Milo says it at the right time, in the voice you choose, while Talk is open.' and a side note 'Nothing plays when the app is closed.'",
  safety: "Black, directly after the previous section. 'Safety', the title 'Help, one tap away' sharpening word by word, 'Kind words first: Milo listens for a fall, pain or confusion, and asks if they need help.' and a side note 'It never calls anyone by itself.'",
  cta: "Full-width blue band: '1.0 Set up Milo', 'Five short steps.' and a link 'Start setup'. Once set up it reads 'Ready when Pierre is' with links to Open Talk and Family space.",
  footer: "Black footer: the wordmark, '1.0 Start' with Set up Milo and Open Talk, the mark, and a line 'Not a medical device · AI voices are always labeled · Never dials for you · μιλώ'.",
};

const MOTIONS: Record<string, string> = {
  hero_load: "On first load, the two portraits sharpen from a soft blur and rise slightly into place over about a second and a half, then the headline fades up.",
  overview_fill: "The overview statement's words fill from grey to black one after another as it scrolls up, as on augen.pro, instead of the whole block blurring in.",
  rows_mask: "Each row's sentence slides up from behind a thin mask line as it enters, instead of only brightening.",
  sample_wave: "While the sample plays, a thin live waveform drawn from the real audio moves under the words.",
  sample_autoplay: "The sample starts playing by itself when it scrolls into view.",
  band_grow: "The blue band grows from a thin blue line into the full section as it scrolls in.",
  colour_ease: "The page background eases smoothly between the light and dark sections as you scroll, instead of hard edges.",
  intro_screen: "A short intro screen with the milo wordmark before the page appears.",
  custom_cursor: "A custom cursor that follows the mouse.",
};

async function ask(questions: Record<string, unknown>) {
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.JEV_MODEL || "jev-latest", state: { brief: BRIEF, page: SECTIONS }, questions }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Jev ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.answers as Record<string, { choice?: string; probabilities?: Record<string, number>; noul?: number; score?: number }>;
}

const questions: Record<string, unknown> = {};
for (const [key, text] of Object.entries(SECTIONS)) {
  questions[`section_${key}`] = {
    type: "choice",
    instructions: `Landing page section "${key}": ${text} Given the brief, what should happen to this section?`,
    criteria: { keep: "Keep it as it is.", trim: "Keep it, but cut words or elements from it.", merge: "Fold it into a neighbouring section.", cut: "Remove it; the page is better without it." },
  };
}
for (const [key, text] of Object.entries(MOTIONS)) {
  questions[`motion_${key}`] = {
    type: "noul",
    instructions: `Proposed animation: ${text} Would it make the page better for these readers, in augen.pro's calm style, without distracting or slowing anyone down?`,
    criteria: { yes: "Yes, it helps and suits the style.", no: "No, it is decorative, distracting, inaccessible or slows people down." },
  };
}
questions.clutter = { type: "score", instructions: "How clean and focused is this landing page as described, compared with augen.pro?", criteria: ["cluttered, too many sections and words", "mostly focused", "as clean and focused as augen.pro"] };

// Follow-up: for the sections Jev wants trimmed, which single element should go.
const TRIMS: Record<string, string> = {
  giant_heading: "In the giant section, remove the small icon and the heading 'Built for them'.",
  giant_line: "In the giant section, remove the line 'Milo listens and answers in short, warm sentences.'",
  giant_tap: "In the giant section, remove 'One tap to talk.', which repeats the Talk row.",
  facts_built: "In the facts section, remove 'Built on: Claude, Gemini and ElevenLabs'.",
  facts_codes: "In the facts section, remove the bracketed codes [Lbl¹] [Cns²] [Mem³] but keep the three promises as plain short lines.",
  facts_promises: "In the facts section, remove the whole '04 How Milo talks' promises block.",
  facts_works: "In the facts section, remove 'Works on: Phones, tablets and computers'.",
  cta_index: "In the blue band, remove the '1.0' index number.",
  cta_steps: "In the blue band, remove 'Five short steps.'",
  cta_second: "In the blue band, once set up, remove the second link (Family space) and keep only Open Talk.",
};
if (process.argv.includes("--trims")) {
  const trimQuestions: Record<string, unknown> = {};
  for (const [key, text] of Object.entries(TRIMS)) trimQuestions[key] = { type: "noul", instructions: `${text} Would the page be better for these readers, closer to augen.pro's simplicity, without losing anything they need?`, criteria: { yes: "Yes, remove it.", no: "No, keep it; readers need it or it carries the style." } };
  const trimRuns = await Promise.all([ask(trimQuestions), ask(trimQuestions), ask(trimQuestions)]);
  const trims: Record<string, number> = {};
  console.log("trims (P(remove), averaged over 3 runs)");
  for (const key of Object.keys(TRIMS)) {
    trims[key] = trimRuns.reduce((sum, run) => sum + (run[key].noul ?? 0), 0) / trimRuns.length;
    console.log(`  ${trims[key] >= 0.5 ? "remove" : "keep  "}  ${trims[key].toFixed(2)}  ${TRIMS[key]}`);
  }
  await writeFile("scripts/jev-site-trims.json", JSON.stringify(trims, null, 1));
  process.exit(0);
}

const runs = await Promise.all([ask(questions), ask(questions), ask(questions)]);
const result: Record<string, unknown> = {};
console.log("sections (probabilities averaged over 3 runs)");
for (const key of Object.keys(SECTIONS)) {
  const average: Record<string, number> = {};
  for (const run of runs) for (const [option, value] of Object.entries(run[`section_${key}`].probabilities ?? {})) average[option] = (average[option] ?? 0) + value / runs.length;
  const verdict = Object.entries(average).toSorted((a, b) => b[1] - a[1])[0][0];
  result[`section_${key}`] = { verdict, average };
  console.log(`  ${key.padEnd(9)} → ${verdict.padEnd(5)}  ${Object.entries(average).map(([option, value]) => `${option} ${value.toFixed(2)}`).join("  ")}`);
}
console.log("\nanimations (P(helps), averaged)");
for (const key of Object.keys(MOTIONS)) {
  const yes = runs.reduce((sum, run) => sum + (run[`motion_${key}`].noul ?? 0), 0) / runs.length;
  result[`motion_${key}`] = yes;
  console.log(`  ${yes >= 0.5 ? "add " : "skip"}  ${yes.toFixed(2)}  ${key}`);
}
const clutter = runs.reduce((sum, run) => sum + (run.clutter.score ?? 0), 0) / runs.length;
result.clutter = clutter;
console.log(`\ncleanliness ${clutter.toFixed(2)} on 0 (cluttered) to 2 (as clean as augen.pro)`);
await writeFile("scripts/jev-site.json", JSON.stringify(result, null, 1));
