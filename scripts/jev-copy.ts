// Jev picks the landing page's words. Jev does not write; it judges. Each spot on the page has a few short
// candidate lines; Jev scores each for how plainly it speaks to a family member, and checks every claim
// against Milo's product facts. The clearest line that passes the facts wins.
//   node --env-file-if-exists=.env.local --import tsx scripts/jev-copy.ts   -> prints the table, writes scripts/jev-copy.json
import { writeFile } from "node:fs/promises";

const FACTS = [
  "Milo is a voice companion for people with mild dementia or mild memory loss who spend time alone. It runs in a browser on phones, tablets and computers.",
  "The person taps Talk, speaks, and taps Finish; Milo replies in short, warm sentences in an AI voice. Typing also works, and Stop cuts the voice at once.",
  "Milo speaks in a stock AI voice, or in AI recreations of family and friends' voices. Each voice owner records their own spoken consent and a voice sample; recreations are always labeled as AI and can be deleted.",
  "Milo always says it is an AI, never pretends to be the family member, and never invents shared memories.",
  "Family chooses topics to avoid and to steer toward, things never to say, and approves the facts Milo may mention.",
  "Family schedules reminders and check-ins for set times, spoken in a chosen voice. They play only while the Talk screen is open; the person taps Done or Remind me later, and one left unanswered for twenty minutes is shown to the family.",
  "Family sees short summaries, moods and concerns from the last seven days, never full conversations.",
  "Every message is checked for signs of a fall, pain, confusion, low mood or self-harm. Milo then asks whether they need help and can show a Call 911 button. Milo never dials by itself; the family sees it on their overview.",
  "Milo is not a medical device. It is built with Claude, Gemini and ElevenLabs. Setup has five steps: about them, voices, topics and memory, reminders, and their day.",
  "The name Milo comes from the Greek μιλώ, I speak.",
];

const JOB: Record<string, string> = {
  hero: "It is the one-line tagline under the name, beside two portraits of an old man and a young woman facing each other.",
  sample: "It is spoken aloud as the website's voice sample, in a family voice: the AI recreation of a granddaughter, Nia, greeting her grandfather. It should sound like someone he knows and loves, warm and simple, in short sentences ending with an easy question. It must not mention Milo: Milo is the product name, not who is speaking. Like every family voice in Milo, it must say it is an AI voice and must not pretend to be the real person.",
  sample_note: "It is the small caption under that voice sample on the website. The sample uses a stock voice standing in for a family member, because a real family voice needs its owner's recorded consent.",
  cta_sub: "It sits under the heading Set up Milo, just before the link that starts setup.",
  giant: "It is two huge words stacked in blue across the whole page, followed by the line: Milo listens and answers in short, warm sentences. It should say what Milo gives the person it keeps company, warmly and in plain words, without sounding like surveillance or overpromising. The hero already says 'A familiar voice', so it must not repeat the word familiar. Milo is the product and company name, never a person.",
  section_head: "It is the small heading above those two huge words, like augen.pro's 'Meet Our' above 'Invisible Approach'. Milo is the product and company name, not a person, so it must not suggest meeting someone.",
  listen_head: "It is the small heading over a voice sample: a recording of the product's stock AI voice, with the words lighting up as they are spoken. Milo is the product and company name, not a person, so it must not suggest hearing a person.",
  listen_button: "It is the label on the play button for that voice sample. Milo is the product name, not a person.",
};

const SLOTS: Record<string, string[]> = {
  hero: [
    "Speak with someone familiar.",
    "A familiar voice, whenever they need one.",
    "Company, in a voice they know.",
    "A voice that feels like family.",
  ],
  overview: [
    "Milo is a voice companion for people living with mild memory loss. It talks in the voices of the family who love them, always with their permission.",
    "Milo is a voice companion for people with mild memory loss. It can speak in family voices, always with permission.",
    "A voice companion for people with mild memory loss, speaking in their family's voices, with permission.",
    "Milo keeps people with mild memory loss company, in voices from their own family.",
  ],
  talk: ["One tap to talk, and a kind reply", "Tap once. Talk. Hear a kind reply.", "One tap to talk. Short, warm replies."],
  voices: ["Family voices, recorded with consent", "Family voices, with their permission", "Their family's voices, with consent"],
  day: ["Summaries for family, never every word", "Family sees how the day went, not every word", "How their day went, without every word"],
  sample_note: [
    "A sample family voice, played by a stock voice. Real family voices need their owner's consent.",
    "Sample only: a stock voice standing in for a granddaughter. Family voices are recorded with consent.",
    "A stock voice standing in for a family voice.",
    "A stand-in voice. Real family voices are recorded with consent.",
  ],
  sample: [
    "Morning, Grandpa. It's me, Nia. Did the roses come up this week? Tell me about the garden.",
    "Morning, Grandpa. This is Nia's AI voice, made with her permission. Did the roses come up this week?",
    "Good morning, Grandpa. You're hearing an AI version of Nia's voice. How are the roses doing?",
    "Hi Grandpa, it's Nia's voice, made by AI with her blessing. I'm not Nia herself. Shall we talk about the garden?",
    "Morning, Grandpa. This is Nia's voice, made by AI with her permission. How did you sleep?",
  ],
  meet: [
    "Milo listens, waits, and answers in short, warm sentences, in a voice they know.",
    "Milo listens and answers in short, warm sentences.",
    "It listens, waits, and answers simply.",
  ],
  rhythm: [
    "Family sets reminders and friendly check-ins for set times, spoken in the stock voice or a family voice. They play while the Talk screen is open.",
    "Reminders and friendly check-ins, spoken at set times while Talk is open.",
    "Set a reminder once. Milo says it at the right time, in the voice you choose, while Talk is open.",
  ],
  rhythm_note: [
    "Nothing plays when the app is closed. Browsers need one tap on the screen before sound can start.",
    "Nothing plays when the app is closed.",
    "Reminders play only while Talk is open.",
  ],
  safety: [
    "Every message is checked for signs of a fall, pain, confusion or low mood. If something sounds wrong, Milo asks: “Do you need help right now?”",
    "If something sounds wrong, Milo asks: “Do you need help right now?”",
    "Milo listens for a fall, pain or confusion, and asks if they need help.",
  ],
  safety_note: ["Milo never dials by itself. The call is always their own tap.", "Milo never dials. The call is always their tap.", "It never calls anyone by itself."],
  cta_sub: ["Five short steps, at your own pace.", "Five short steps.", "Five steps, at your own pace."],
  giant: ["Gentle Company", "Kind Words", "Good Company", "Warm Voices", "Their Voices", "Family Voices", "Calm Company", "Gentle Voices", "Voices They Know"],
  section_head: ["Meet Milo", "Our approach", "Why Milo", "The idea", "Built for them", "How it feels"],
  listen_head: ["Hear Milo", "Listen", "Hear a sample", "How it sounds", "Hear the voice"],
  listen_button: ["Hear Milo", "Play sample", "Listen", "Play"],
};

// Product names are judged twice: plain meaning, and fit with augen's code-plus-word naming (A¹ Sense, B¹ Eye).
const NAMES: Record<string, string> = {
  talk_voices_day: "T¹ Talk, V¹ Voices, D¹ Day",
  speak_kin_care: "S¹ Speak, K¹ Kin, C¹ Care",
  milo_prefix: "Milo Talk, Milo Voices, Milo Day",
  current: "M¹ Talk, M² Voices, M³ Family",
  talk_voices_family: "T¹ Talk, V¹ Voices, F¹ Family",
};

async function ask(questions: Record<string, unknown>) {
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.JEV_MODEL || "jev-latest", state: { product_facts: FACTS }, questions }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Jev ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body.answers as Record<string, { score?: number; noul?: number }>;
}

const PRODUCT_NOT_PERSON = new Set(["section_head", "listen_head", "listen_button"]);
// Facts Jev checks the spoken sample and its caption against, on top of the product facts.
FACTS.push("On the website, the voice sample uses an ElevenLabs stock voice standing in for a granddaughter named Nia; it is not a real recording of anyone.");
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;
const results: Record<string, unknown> = {};
for (const [slot, lines] of Object.entries(SLOTS)) {
  if (only && !only.includes(slot)) continue;
  const questions: Record<string, unknown> = {};
  lines.forEach((text, index) => {
    questions[`clear_${index}`] = {
      type: "score",
      instructions: `Website line for the "${slot}" spot: "${text}". ${JOB[slot] ?? "How plainly and quickly does it tell a busy family member what Milo does or why it matters?"} Fewer words and no jargon score higher.`,
      criteria: ["confusing, vague or wordy", "understandable with some effort", "instantly clear in very few plain words"],
    };
    // Headings make no claims, so they are checked for the thing that can go wrong with them instead:
    // treating Milo, a product and company name, as a person someone meets or hears.
    questions[`true_${index}`] = PRODUCT_NOT_PERSON.has(slot) ? {
      type: "noul",
      instructions: `Website heading: "${text}". Milo is the name of a product and company, not a person. Does this heading avoid presenting Milo as a person someone meets, hears or gets to know?`,
      criteria: { yes: "It does not present Milo as a person.", no: "It presents Milo as a person someone meets, hears or gets to know." },
    } : {
      type: "noul",
      instructions: `Website line: "${text}". Is everything it claims supported by the product facts?`,
      criteria: { yes: "Every claim is supported by the facts, or it makes no factual claim.", no: "It claims something the facts contradict or do not support." },
    };
  });
  const answers = await ask(questions);
  const rows = lines.map((text, index) => ({ text, clear: Math.round((answers[`clear_${index}`].score ?? 0) * 100) / 100, accurate: Math.round((answers[`true_${index}`].noul ?? 0) * 100) / 100 }));
  const passing = rows.filter((row) => row.accurate >= 0.5);
  const winner = (passing.length ? passing : rows).toSorted((a, b) => b.clear - a.clear || a.text.length - b.text.length)[0];
  results[slot] = { winner: winner.text, rows };
  console.log(`\n${slot}`);
  for (const row of rows) console.log(`  ${row === winner ? "→" : " "} clear ${row.clear.toFixed(2)}  facts ${row.accurate.toFixed(2)}  ${row.text}`);
}

if (only) {
  await writeFile(`scripts/jev-copy-${only.join("-")}.json`, JSON.stringify(results, null, 1));
  process.exit(0);
}
const nameQuestions: Record<string, unknown> = {};
for (const [key, names] of Object.entries(NAMES)) {
  nameQuestions[`plain_${key}`] = { type: "score", instructions: `Names for Milo's three parts (the talking companion, the family voice recordings, and the family's overview of the day): "${names}". How clearly do the words tell a family member what each part is?`, criteria: ["unclear", "somewhat clear", "obvious at a glance"] };
  nameQuestions[`style_${key}`] = { type: "score", instructions: `The website copies augen.pro, whose products are named with a capital letter, a superscript 1 and one short word, like "A¹ Sense", "B¹ Eye", "A¹ Neuro". How well do these names match that style while staying meaningful: "${names}"?`, criteria: ["does not match", "partly matches", "matches closely and the letter means something"] };
}
const nameAnswers = await ask(nameQuestions);
console.log("\nproduct names");
const names = Object.entries(NAMES).map(([key, text]) => ({ key, text, plain: Math.round((nameAnswers[`plain_${key}`].score ?? 0) * 100) / 100, style: Math.round((nameAnswers[`style_${key}`].score ?? 0) * 100) / 100 }));
for (const row of names.toSorted((a, b) => b.plain + b.style - (a.plain + a.style))) console.log(`  plain ${row.plain.toFixed(2)}  style ${row.style.toFixed(2)}  ${row.text}`);
results.names = names;
await writeFile("scripts/jev-copy.json", JSON.stringify(results, null, 1));
console.log("\nwrote scripts/jev-copy.json");
