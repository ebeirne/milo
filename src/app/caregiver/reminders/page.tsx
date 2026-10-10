import type { Metadata } from "next";
import { ScreenShell } from "@/components/screen-shell";
import { SchedulePanel } from "@/components/schedule-panel";

export const metadata: Metadata = { title: "Reminders & check-ins" };
export default function RemindersPage() { return <ScreenShell caregiver><div className="caregiver-content"><SchedulePanel /></div></ScreenShell>; }
