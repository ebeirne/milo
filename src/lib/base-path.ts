// The static GitHub Pages copy of the website is served under /<repo>; the app itself is served from the root.
// Next adds this prefix to links and its own assets, but not to plain file paths such as images and audio.
export const asset = (path: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
