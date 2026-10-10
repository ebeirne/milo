import type { NextConfig } from "next";

// The static copy of the Milo website for GitHub Pages. It renders the same landing component as the app
// (src/components/landing.tsx) to plain files under the repository's Pages path. The app itself, with Talk
// and the family console, needs a server and a database, so it is not part of this build.
// Built by `npm run build:site`, which runs from the repository root.
const basePath = process.env.SITE_BASE_PATH ?? "/milo";

const config: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  // The pages import the app's components and styles from ../src.
  turbopack: { root: process.cwd() },
  // `npm run typecheck` already checks these files with the app's settings.
  typescript: { ignoreBuildErrors: true },
};

export default config;
