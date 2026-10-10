import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = new URL("../public/", import.meta.url);
const svg = await readFile(new URL("icon.svg", root));
await mkdir(new URL("icons/", root), { recursive: true });
for (const [name, size] of [["icon-192", 192], ["icon-512", 512], ["apple-touch-icon", 180]]) {
  await sharp(svg).resize(size, size).png().toFile(fileURLToPath(new URL(`icons/${name}.png`, root)));
}
const maskableSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#0071e3"/><g transform="translate(128 128) scale(8)" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"><circle cx="16" cy="16" r="2" fill="#fff" stroke="none"/><path d="M11.6 11.2a7 7 0 0 0 0 9.6M20.4 11.2a7 7 0 0 1 0 9.6M7.4 7.2a12.6 12.6 0 0 0 0 17.6M24.6 7.2a12.6 12.6 0 0 1 0 17.6"/></g></svg>`);
await sharp(maskableSvg).png().toFile(fileURLToPath(new URL("icons/icon-maskable-512.png", root)));
console.log("Milo PWA icons generated.");
