import type { Metadata } from "next";
import { ScreenShell } from "@/components/screen-shell";
import { VoiceEnrollment } from "@/components/voice-enrollment";

export const metadata: Metadata = { title: "Record your voice", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function RemoteRecordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ScreenShell variant="guest"><div className="guest-page"><span className="wordmark">milo</span><VoiceEnrollment token={token} /></div></ScreenShell>;
}
