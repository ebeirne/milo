import type { Metadata } from "next";
import { ConsoleShell } from "@/components/console";
import { SchedulePanel } from "@/components/schedule-panel";

export const metadata: Metadata = { title: "Reminders & check-ins" };
export default function Page() { return <ConsoleShell step="04"><SchedulePanel /></ConsoleShell>; }
