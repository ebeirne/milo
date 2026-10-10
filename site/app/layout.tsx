import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { MotionRoot } from "@/components/motion-kit";
import { asset } from "@/lib/base-path";
import "../../src/app/globals.css";

const sans = Inter_Tight({ subsets: ["latin", "greek"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: "Milo · A familiar voice, whenever they need one",
  description: "A voice companion for people with mild memory loss. It can speak in family voices, always with permission.",
  icons: { icon: asset("/icon.svg") },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={sans.variable}><body><MotionRoot>{children}</MotionRoot></body></html>;
}
