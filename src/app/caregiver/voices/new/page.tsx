import type { Metadata } from "next";
import { ConsoleShell, Intro } from "@/components/console";
import { VoiceEnrollment } from "@/components/voice-enrollment";
import { BigButton } from "@/components/big-button";
import { getHouseholdResult } from "@/lib/db/repository";

export const metadata: Metadata = { title: "Record a voice" };
export const dynamic = "force-dynamic";
export default async function NewVoicePage() {
  const result = await getHouseholdResult();
  return <ConsoleShell step="02">{result.household?.patient ? <VoiceEnrollment /> : <Intro kicker="Family space" title="Set up the space first" sub="Save their details before adding voices."><BigButton href="/caregiver">Go to About them</BigButton></Intro>}</ConsoleShell>;
}
