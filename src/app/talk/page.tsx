import type { Metadata } from "next";
import { ScreenShell } from "@/components/screen-shell";
import { TalkPanel } from "@/components/talk-panel";

export const metadata: Metadata = { title: "Talk" };

export default function TalkPage() {
  return <ScreenShell variant="patient"><TalkPanel /></ScreenShell>;
}
