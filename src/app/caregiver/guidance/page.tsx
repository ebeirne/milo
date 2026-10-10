import type { Metadata } from "next";
import { ScreenShell } from "@/components/screen-shell";
import { GuidancePanel } from "@/components/guidance-panel";

export const metadata: Metadata = { title: "Topics & memory" };
export default function GuidancePage() { return <ScreenShell caregiver><div className="caregiver-content"><GuidancePanel /></div></ScreenShell>; }
