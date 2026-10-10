// Turns the chosen generated portrait into the hero's two images, public/hero/left.webp and right.webp.
// The source shows the grandfather (left) and granddaughter (right) back to back; it is split at the white
// gap between them so the page can move them apart. The white background, the haze and the fog become
// transparency, so the portraits have no rectangle on any page colour. Alpha is stored losslessly and the
// page serves these files unoptimized: lossy alpha leaves a faint grey box around each portrait.
//   node scripts/prepare-heads.mjs <pair.png> <splitX> <halfWidth>
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

// Marks the largest connected area whose alpha is above `floor` (4-neighbour flood fill).
function largestPatch(alpha, width, height, floor) {
  const label = new Int32Array(width * height);
  let best = 0, bestSize = 0, next = 0;
  const stack = [];
  for (let start = 0; start < alpha.length; start++) {
    if (label[start] || alpha[start] < floor) continue;
    next++; let size = 0; stack.push(start); label[start] = next;
    while (stack.length) {
      const pixel = stack.pop(); size++;
      const x = pixel % width, y = (pixel - x) / width;
      for (const neighbour of [x > 0 ? pixel - 1 : -1, x < width - 1 ? pixel + 1 : -1, y > 0 ? pixel - width : -1, y < height - 1 ? pixel + width : -1]) {
        if (neighbour >= 0 && !label[neighbour] && alpha[neighbour] >= floor) { label[neighbour] = next; stack.push(neighbour); }
      }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  return Uint8Array.from(label, (value) => (value === best ? 1 : 0));
}

const [pair, splitArg, halfArg] = process.argv.slice(2);
const split = Number(splitArg);
const half = Number(halfArg);
const { height } = await sharp(pair).metadata();
await mkdir("public/hero", { recursive: true });

for (const [name, left] of [["left", split - half], ["right", split]]) {
  const crop = () => sharp(pair).extract({ left, top: 0, width: half, height }).removeAlpha();
  const { data, info } = await crop().raw().toBuffer({ resolveWithObject: true });
  // Brightness is judged on a blurred copy, so film grain in the haze can't leave stray dark specks.
  const soft = await crop().blur(6).raw().toBuffer();
  const ease = (value) => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
  const outerIsLeft = name === "left";
  const rgba = Buffer.alloc(half * height * 4);
  const alphas = new Float32Array(half * height);
  for (let pixel = 0; pixel < half * height; pixel++) {
    const index = pixel * info.channels;
    const x = pixel % half;
    const y = Math.floor(pixel / half);
    const light = 0.2126 * soft[index] + 0.7152 * soft[index + 1] + 0.0722 * soft[index + 2];
    // How much of this pixel is background: bright haze and grain, plus a feather at every edge so the
    // halves never show a seam when the page moves them apart.
    const lift = Math.min(1, Math.max(0, (light - 205) / 40)) ** 1.3;
    const outer = (outerIsLeft ? x : half - 1 - x) / half;
    const inner = (outerIsLeft ? half - 1 - x : x) / half;
    const edge = 1 - ease(y / (height * 0.2)) * ease(outer / 0.22) * ease(inner / 0.03) * ease((height - 1 - y) / (height * 0.1));
    const coverage = 1 - Math.max(lift, edge);
    // Very faint haze fades out smoothly instead of leaving a speckled or hard edge, and the necks dissolve
    // over the lower third whatever shape the fog had.
    const dissolve = 1 - ease((y / height - 0.56) / 0.34);
    const alpha = coverage * ease((coverage - 0.02) / 0.3) * dissolve;
    // Un-mix the white so the pixel looks the same over white as it did in the photo.
    for (let channel = 0; channel < 3; channel++) {
      const value = data[index + channel];
      rgba[pixel * 4 + channel] = alpha > 0.02 ? Math.max(0, Math.min(255, Math.round((value - 255 * (1 - alpha)) / alpha))) : 255;
    }
    alphas[pixel] = alpha;
  }
  // Keep only the portrait itself: stray patches of haze that are not joined to the head are cleared.
  const keep = largestPatch(alphas, half, height, 0.01);
  for (let pixel = 0; pixel < half * height; pixel++) rgba[pixel * 4 + 3] = keep[pixel] ? Math.round(alphas[pixel] * 255) : 0;
  await sharp(rgba, { raw: { width: half, height, channels: 4 } }).webp({ quality: 88, alphaQuality: 100 }).toFile(`public/hero/${name}.webp`);
  console.log("wrote", `public/hero/${name}.webp`, `${half}x${height}`);
}
