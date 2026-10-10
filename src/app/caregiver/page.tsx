import type { Metadata } from "next";
import { Check, Heart, LockKeyhole, MessageCircle, Mic, Sprout, Timer, UsersRound } from "lucide-react";
import { Banner } from "@/components/banner";
import { ScreenShell } from "@/components/screen-shell";
import { SetupForm } from "@/components/setup-form";
import { BigButton } from "@/components/big-button";
import { getHouseholdResult } from "@/lib/db/repository";

export const metadata: Metadata = { title: "Family & setup" };
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CaregiverPage() {
  const result = await getHouseholdResult();
  const household = result.household;
  return (
    <ScreenShell caregiver>
      <div className="caregiver-content">
        <div className="page-heading">
          <div><p className="eyebrow">FAMILY &amp; SETUP</p><h1>A little care goes a long way.</h1><p className="muted">Let’s make a comfortable space for someone you love.</p></div>
          <span className="setup-badge"><Sprout size={22} aria-hidden="true" />{household?.patient ? "Details saved" : "Getting started"}</span>
        </div>
        {!result.available && (
          <div className="connection-notice" role="alert">
            <strong>Setup needs a database connection.</strong>
            <p>Your details cannot be saved yet. Set <code>DATABASE_URL</code> in <code>.env.local</code> and start PostgreSQL, then reload this page.</p>
          </div>
        )}
        <div className="caregiver-grid">
          <section className="card setup-card" aria-labelledby="setup-title">
            <div className="card-heading"><span className="icon-tile"><UsersRound size={26} aria-hidden="true" /></span><div><h2 id="setup-title">Start with the people</h2><p className="muted">A few details to make it personal.</p></div></div>
            <SetupForm databaseAvailable={result.available} defaults={{
              patientName: household?.patient?.name ?? "",
              preferredName: household?.patient?.preferred_name ?? "",
              caregiverName: household?.caregiver?.name ?? "",
              caregiverEmail: household?.caregiver?.email ?? "",
              caregiverRole: household?.caregiver?.role ?? "family",
            }} />
          </section>
          <aside className="caregiver-sidebar">
            <section className="care-note">
              <span className="note-icon"><Heart size={30} strokeWidth={1.6} aria-hidden="true" /></span>
              <h2>Familiar voices.<br />Thoughtful boundaries.</h2>
              <p>A companion should feel comforting and be honest about who it is.</p>
              <ul className="principle-list">
                <li><Check size={23} aria-hidden="true" /> Every voice needs permission.</li>
                <li><Check size={23} aria-hidden="true" /> AI voices are always labeled.</li>
                <li><Check size={23} aria-hidden="true" /> No invented shared memories.</li>
                <li><Check size={23} aria-hidden="true" /> Simple controls, at their pace.</li>
              </ul>
            </section>
            <section className="privacy-note"><LockKeyhole size={25} aria-hidden="true" /><div><h3>A little privacy, too.</h3><p>Family sees an overview and concerns. Full transcripts won’t appear here.</p></div></section>
          </aside>
        </div>
        <section className="coming-section" aria-labelledby="next-title">
          <div className="section-heading"><h2 id="next-title">Room for connection</h2><div className="heading-actions"><BigButton href="/caregiver/today" secondary>Their day</BigButton><BigButton href="/caregiver/reminders" secondary>Reminders</BigButton><BigButton href="/caregiver/guidance" secondary>Topics &amp; memory</BigButton><BigButton href="/caregiver/voices" secondary>Family voice library</BigButton></div></div>
          <div className="feature-grid">
            <article className="card feature-card"><Mic size={29} aria-hidden="true" /><h3>Family voices</h3><p>Record your consent and sample, or invite someone to record on their own phone.</p><span className="empty-status">Consented recording and previews</span></article>
            <article className="card feature-card"><MessageCircle size={29} aria-hidden="true" /><h3>A window into their day</h3><p>Short conversation summaries, moods, and concerns in one gentle overview.</p><span className="empty-status">Summaries, moods, and flags under “Their day”</span></article>
            <article className="card feature-card"><Timer size={29} aria-hidden="true" /><h3>Gentle reminders</h3><p>A familiar voice for daily routines and a friendly hello along the way.</p><span className="empty-status">Set times under “Reminders”</span></article>
          </div>
        </section>
        <Banner />
      </div>
    </ScreenShell>
  );
}
