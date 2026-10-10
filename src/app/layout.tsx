import type { Metadata, Viewport } from "next";
import { Inter_Tight } from "next/font/google";
import { MotionRoot } from "@/components/motion-kit";
import "./globals.css";

// A light grotesk with the proportions of augen.pro's PP Neue Montreal, available under an open licence.
const sans = Inter_Tight({ subsets: ["latin", "greek"], variable: "--font-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Milo · Speak with someone familiar", template: "%s · Milo" },
  description: "A gentle AI voice companion that speaks in family voices, recorded with their permission.",
  appleWebApp: { capable: true, title: "Milo", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2f2f4",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={sans.variable}><body><MotionRoot>{children}</MotionRoot></body></html>;
}
