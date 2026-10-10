import type { Metadata } from "next";
import { ScreenShell } from "@/components/screen-shell";
import { VoiceLibrary } from "@/components/voice-library";

export const metadata: Metadata = { title: "Family voices" };
export default function VoicesPage() { return <ScreenShell caregiver><div className="caregiver-content"><VoiceLibrary /></div></ScreenShell>; }
