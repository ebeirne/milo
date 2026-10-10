import type { Metadata } from "next";
import { ConsoleShell } from "@/components/console";
import { VoiceLibrary } from "@/components/voice-library";

export const metadata: Metadata = { title: "Family voices" };
export default function Page() { return <ConsoleShell step="02"><VoiceLibrary /></ConsoleShell>; }
