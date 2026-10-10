import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Milo · Speak with someone familiar",
    short_name: "Milo",
    description: "A gentle AI voice companion, with family voices recorded with their permission.",
    start_url: "/talk",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f2f2f4",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
