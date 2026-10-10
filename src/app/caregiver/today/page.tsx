import type { Metadata } from "next";
import { ScreenShell } from "@/components/screen-shell";
import { DayOverview } from "@/components/day-overview";

export const metadata: Metadata = { title: "Their day" };
export default function TodayPage() { return <ScreenShell caregiver><div className="caregiver-content"><DayOverview /></div></ScreenShell>; }
