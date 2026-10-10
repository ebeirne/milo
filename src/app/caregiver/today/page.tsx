import type { Metadata } from "next";
import { ConsoleShell } from "@/components/console";
import { DayOverview } from "@/components/day-overview";

export const metadata: Metadata = { title: "Their day" };
export default function Page() { return <ConsoleShell step="05"><DayOverview /></ConsoleShell>; }
