import type { Metadata } from "next";
import { ScreenShell } from "@/components/screen-shell";
import { VoiceEnrollment } from "@/components/voice-enrollment";

export const metadata: Metadata = { title: "Record your voice", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function RemoteRecordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ScreenShell><div className="enrollment-container"><VoiceEnrollment token={token} /></div></ScreenShell>;
}
