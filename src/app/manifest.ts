import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Familiar · A little company",
    short_name: "Familiar",
    description: "A calm AI companion, with familiar voices and thoughtful care.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f6ef",
    theme_color: "#315843",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
