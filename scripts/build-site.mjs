// Builds the static Milo website for GitHub Pages into site/out.
//   npm run build:site              (SITE_BASE_PATH defaults to /milo, the repository's Pages path)
import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await rm("site/public", { recursive: true, force: true });
await mkdir("site/public", { recursive: true });
for (const item of ["hero", "sample", "icons", "icon.svg"]) await cp(`public/${item}`, `site/public/${item}`, { recursive: true });

const windows = process.platform === "win32";
const result = spawnSync(windows ? "npx.cmd" : "npx", ["next", "build", "site"], { stdio: "inherit", shell: windows, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" } });
process.exit(result.status ?? 1);
