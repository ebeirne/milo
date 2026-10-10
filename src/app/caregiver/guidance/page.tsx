import type { Metadata } from "next";
import { ConsoleShell } from "@/components/console";
import { GuidancePanel } from "@/components/guidance-panel";

export const metadata: Metadata = { title: "Topics & memory" };
export default function Page() { return <ConsoleShell step="03"><GuidancePanel /></ConsoleShell>; }
