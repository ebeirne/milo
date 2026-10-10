import type { Metadata } from "next";
import Link from "next/link";
import { ConsoleShell, Intro, NextLink, Part, Tags } from "@/components/console";
import { SetupForm } from "@/components/setup-form";
import { PillArrow } from "@/components/milo-mark";
import { Banner } from "@/components/banner";
import { getHouseholdResult } from "@/lib/db/repository";
import { householdProgress, type Progress } from "@/lib/db/progress";
import { STEPS } from "@/lib/steps";

export const metadata: Metadata = { title: "Family space" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const count = (value: number, word: string) => `${value} ${word}${value === 1 ? "" : "s"}`;

// What is set up in each later step, as short tags.
function status(index: string, progress: Progress | null): string[] {
  if (!progress) return ["Not started"];
  if (index === "02") return progress.voices ? [count(progress.voices, "voice"), `${progress.activeVoices} in use`] : ["Stock voice"];
  if (index === "03") return [count(progress.rules, "rule"), count(progress.facts, "fact"), ...(progress.pendingFacts ? [`${progress.pendingFacts} to review`] : [])];
  if (index === "04") return [count(progress.reminders, "reminder"), count(progress.checkins, "check-in")];
  return [progress.openFlags ? `${count(progress.openFlags, "concern")} waiting` : "Nothing waiting"];
}

export default async function CaregiverPage() {
  const result = await getHouseholdResult();
  const household = result.household;
  const patient = household?.patient;
  const progress = patient ? await householdProgress(patient.id) : null;
  return (
    <ConsoleShell step="01">
      <Intro kicker="Family space" title="About them" sub={patient ? `Milo is set up for ${patient.preferred_name}.` : "Start here. It takes a minute."} meta={<><span>Step 01 of 05</span><Tags items={[patient ? { text: "Saved", tone: "on" } : "Not started"]} /></>}>
        {!result.available && <div className="connection-notice" role="alert"><strong>Setup needs a database connection.</strong><p>Details cannot be saved yet. Set <code>DATABASE_URL</code> in <code>.env.local</code>, start PostgreSQL, then reload.</p></div>}
      </Intro>
      <SetupForm databaseAvailable={result.available} defaults={{
        patientName: patient?.name ?? "",
        preferredName: patient?.preferred_name ?? "",
        caregiverName: household?.caregiver?.name ?? "",
        caregiverEmail: household?.caregiver?.email ?? "",
        caregiverRole: household?.caregiver?.role ?? "family",
      }} />
      {patient && <Part title="The other steps" note="Each one is optional, and you can come back any time.">
        <ul className="entries">{STEPS.slice(1).map((step) => (
          <li className="entry" key={step.index}>
            <div className="entry-text"><Tags items={[step.index, ...status(step.index, progress)]} /><p><Link href={step.href} className="arrow-link"><PillArrow />{step.label}</Link></p></div>
          </li>
        ))}</ul>
      </Part>}
      <Banner />
      <NextLink after="01" />
    </ConsoleShell>
  );
}
