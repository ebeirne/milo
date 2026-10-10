// Generates the landing page's portrait: a grandfather and his granddaughter in profile, back to back, lit
// from directly above like augen.pro's hero, so a shadow falls over both faces and who they are stays
// ambiguous. Both heads come from one image so the light and the family resemblance match; prepare-heads.mjs
// then splits it into the two halves the page animates. Neither is a real person.
//   node --env-file=<file with OPENAI_API_KEY> --import tsx scripts/make-heads.ts <outDir> [variants] [--relight <source.png>]
// --relight keeps an earlier portrait's people and pose and only changes the light and focus.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const relight = args.includes("--relight") ? args[args.indexOf("--relight") + 1] : null;
const out = args[0] ?? "data/heads";
const variants = Number(args[1] ?? 2);

const LIGHT = [
  "Low-key lighting from directly above: one soft overhead light rakes down the heads, so only the crowns, the brows and the edges of the cheekbones catch light,",
  "and a deep shadow falls down over both faces. The eyes, nose and mouth sink into shadow, the features are hard to make out, and who they are stays ambiguous.",
  "A soft, shallow-focus blur over the whole image, strongest at the edges and in the fog, as if seen through haze.",
  "Their necks and shoulders dissolve into soft, blurred white fog, so the lower third of the frame fades smoothly to pure white with no edge.",
  "Pure white seamless background with clear white space between the backs of their heads down the middle of the frame. Subtle film grain, slightly desaturated warm tones.",
].join(" ");

const PROMPT = [
  "Fine-art studio photograph for a premium, minimal technology campaign, in the style of a moody editorial portrait.",
  "Two heads in strict side profile, back to back. On the left, an elderly Black man in his late seventies with short grey-white hair and a short grey beard, facing left. On the right, his granddaughter, a Black woman in her mid-twenties with close-cropped natural hair, facing right.",
  "They are clearly family: the same deep brown skin tone and a similar profile. Calm, chins slightly raised.",
  LIGHT,
  "Photorealistic, 85mm lens. No clothing visible, no jewellery, no text, no logos, no border.",
].join(" ");

const RELIGHT = `Re-light this photograph as a moody fine-art portrait. Keep the two people, their profiles, their pose back to back, the composition and the white background exactly as they are; change only the light and the focus. ${LIGHT}`;

async function generate(): Promise<Buffer> {
  const headers = { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` };
  let response: Response;
  if (relight) {
    const form = new FormData();
    form.set("model", "gpt-image-2");
    form.set("prompt", RELIGHT);
    form.set("size", "1536x1024");
    form.set("quality", "high");
    form.set("image", new Blob([await readFile(relight)], { type: "image/png" }), path.basename(relight));
    response = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers, body: form });
  } else {
    response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-image-2", prompt: PROMPT, size: "1536x1024", quality: "high", output_format: "png" }),
    });
  }
  const body = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return Buffer.from(body.data[0].b64_json, "base64");
}

await mkdir(out, { recursive: true });
await Promise.all(Array.from({ length: variants }, async (_, index) => {
  const file = path.join(out, `${relight ? "relit" : "pair"}-${index + 1}.png`);
  try {
    await writeFile(file, await generate());
    console.log("wrote", file);
  } catch (error) {
    console.log(file, error instanceof Error ? error.message : error);
  }
}));
