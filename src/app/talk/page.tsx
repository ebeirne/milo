import type { Metadata } from "next";
import { ScreenShell } from "@/components/screen-shell";
import { TalkPanel } from "@/components/talk-panel";
import { Banner } from "@/components/banner";

export const metadata: Metadata = { title: "Talk" };

export default function TalkPage() {
  return <ScreenShell><div className="patient-content"><TalkPanel /><Banner /></div></ScreenShell>;
}
