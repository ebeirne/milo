import { ArrowRight, HeartHandshake, Leaf, MessageCircle, UserRound } from "lucide-react";
import { Banner } from "@/components/banner";
import { BigButton } from "@/components/big-button";
import { CompanionIllustration } from "@/components/companion-illustration";
import { ScreenShell } from "@/components/screen-shell";
import { getHouseholdResult } from "@/lib/db/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function Home() {
  const result = await getHouseholdResult();
  const patient = result.household?.patient;
  return (
    <ScreenShell>
      <div className="patient-content">
        <div className="eyebrow"><span className="status-dot" /> A little company, at your pace</div>
        <section className="welcome" aria-labelledby="welcome-title">
          <CompanionIllustration />
          <h1 id="welcome-title">{patient ? `Hello, ${patient.preferred_name}.` : <>A familiar feeling.<br />A little closer.</>}</h1>
          <p className="welcome-description">A warm conversation. A voice you know.<br />A moment that feels like home.</p>
          <div className="welcome-action">
            <BigButton href="/caregiver">{patient ? "Continue setup" : "Set up Familiar"}<ArrowRight size={26} aria-hidden="true" /></BigButton>
            <p className="action-note">Voice conversations will be added in the next build phase.</p>
          </div>
        </section>
        {patient && <div className="patient-profile"><span className="profile-avatar"><UserRound size={28} aria-hidden="true" /></span><div><strong>Your space is ready, {patient.preferred_name}.</strong><p>Your family’s voices can be added when recording is available.</p></div></div>}
        <Banner />
        <div className="patient-values">
          <span><HeartHandshake size={25} aria-hidden="true" /> Made with care</span>
          <span><MessageCircle size={25} aria-hidden="true" /> Always honest</span>
          <span><Leaf size={25} aria-hidden="true" /> No rush. No pressure.</span>
        </div>
        <details className="help-panel">
          <summary>What is Familiar?</summary>
          <p>Familiar is being built as a simple companion for quiet moments. With their permission, family and friends will be able to record their voices for AI conversations.</p>
          <p>The AI is not your family member. You can always stop a conversation. Family will see short summaries and concerns, rather than full conversations.</p>
          <p>For now, you can save your setup details. Conversations, voice recording, reminders, and safety notifications are not connected yet.</p>
        </details>
      </div>
    </ScreenShell>
  );
}
