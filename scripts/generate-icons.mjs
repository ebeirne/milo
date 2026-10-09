import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("icon.svg", root));
await mkdir(new URL("icons/", root), { recursive: true });
for (const [name, size] of [["icon-192", 192], ["icon-512", 512], ["apple-touch-icon", 180]]) {
  await sharp(svg).resize(size, size).png().toFile(fileURLToPath(new URL(`icons/${name}.png`, root)));
}
const maskableSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#315843"/><path d="M256 336 169 253c-47-51 21-121 70-72l17 17 17-17c49-49 117 21 70 72Z" fill="none" stroke="#f8f6ef" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
await sharp(maskableSvg).png().toFile(fileURLToPath(new URL("icons/icon-maskable-512.png", root)));
console.log("Familiar PWA icons generated.");
