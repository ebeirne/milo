import type { Metadata } from "next";
import { ScreenShell } from "@/components/screen-shell";
import { VoiceEnrollment } from "@/components/voice-enrollment";
import { BigButton } from "@/components/big-button";
import { getHouseholdResult } from "@/lib/db/repository";

export const metadata: Metadata = { title: "Record a voice" };
export const dynamic = "force-dynamic";
export default async function NewVoicePage() {
  const result = await getHouseholdResult();
  return <ScreenShell caregiver><div className="enrollment-container">{result.household?.patient ? <VoiceEnrollment /> : <section className="card enrollment-card"><h1>Let’s set up the space first.</h1><p>Save the companion’s details before adding voices.</p><BigButton href="/caregiver">Go to family setup</BigButton></section>}</div></ScreenShell>;
}
