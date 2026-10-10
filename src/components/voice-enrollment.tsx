"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { AudioRecorder, type Recording } from "./audio-recorder";
import { BigButton } from "./big-button";
import { VoicePreview } from "./voice-preview";
import { Intro } from "./console";
import { consentStatement, SAMPLE_SCRIPT, validOwnerDetails, type VoiceSummary } from "@/lib/enrollment-contract";

type Invitation = { name: string; relationship: string; submissionId: string; expiresAt: string };

function Step({ index, title, step, children }: { index: number; title: string; step: number; children: ReactNode }) {
  const state = step === index ? "current" : step > index ? "done" : "next";
  return (
    <li className="step" data-state={state} aria-current={state === "current" ? "step" : undefined}>
      <span className="step-index">{index}.0</span>
      <div><h2>{title}{state === "done" && <span className="sr-only"> (done)</span>}</h2>{state === "current" && <div className="step-body">{children}</div>}</div>
    </li>
  );
}

export function VoiceEnrollment({ token }: { token?: string }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [owner, setOwner] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [consent, setConsent] = useState<Recording | null>(null);
  const [sample, setSample] = useState<Recording | null>(null);
  const [submissionId, setSubmissionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [failedInvitation, setFailedInvitation] = useState(false);
  const [voice, setVoice] = useState<VoiceSummary | null>(null);
  useEffect(() => {
    if (!token) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/record-links/${encodeURIComponent(token)}`, { signal: abort.signal });
        const value = await response.json();
        if (!response.ok) throw new Error(value.message || "The recording invitation is unavailable.");
        if (!abort.signal.aborted) { setInvitation(value); setName(value.name); setRelationship(value.relationship); setSubmissionId(value.submissionId); }
      } catch (error) { if (!abort.signal.aborted) { setFailedInvitation(true); setMessage(error instanceof Error ? error.message : "This invitation is unavailable."); } }
    })();
    return () => abort.abort();
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !consent || !sample || !owner || !accepted) return;
    setBusy(true); setMessage("");
    try {
      const data = new FormData();
      data.set("name", name); data.set("relationship", relationship); data.set("submissionId", submissionId);
      data.set("ownerConfirmed", "true"); data.set("consentAccepted", "true");
      data.set("consent", consent.blob, "consent-recording"); data.set("sample", sample.blob, "voice-sample");
      const response = await fetch("/api/voices", { method: "POST", headers: token ? { "x-familiar-record-token": token } : undefined, body: data });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || "Voice creation could not be completed.");
      setVoice(value.voice); setConsent(null); setSample(null); setStep(4);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Please try again.";
      setMessage(text);
      // A consent problem only needs the short statement again; the voice sample is kept.
      if (/^(Consent recording:|Please record the consent)/.test(text)) { setConsent(null); setStep(2); }
    }
    finally { setBusy(false); }
  }

  const kicker = token ? "Recording invitation" : "Family space";
  if (token && !invitation) return <Intro kicker={kicker} title={failedInvitation ? "This invitation isn’t available." : "Opening your invitation…"} sub={<>{message || "One moment."}{failedInvitation && " Ask the person who invited you for a new link."}</>} />;
  if (step === 4 && voice) return <>
    <Intro kicker={kicker} title="Thank you for sharing your voice." sub="Your recorded permission is saved. This is an AI recreation, not the real person speaking." />
    <div className="step-body">
      {voice.cloning_status === "ready" ? <VoicePreview id={voice.id} name={voice.display_name} token={token} /> : <p>ElevenLabs needs the owner’s verification before the voice can be previewed. The person setting up Milo can check it in the voice library.</p>}
      {!token && <Link className="big-button" href="/caregiver/voices">Go to voice library</Link>}
    </div>
  </>;
  return <>
    <Intro kicker={kicker} title="Record a voice" titleId="enrollment-title" sub="Only the living voice owner can record and give consent." meta={<span>Step {step} of 3</span>} />
    <ol className="steps" aria-labelledby="enrollment-title">
      <Step index={1} step={step} title="Your details">
        <form onSubmit={(event) => { event.preventDefault(); if (!validOwnerDetails(name, relationship)) { setMessage("Enter a name and relationship of up to 100 characters."); return; } setMessage(""); if (!submissionId) setSubmissionId(crypto.randomUUID()); setStep(2); }}>
          <div className="form-grid">
            <div className="field"><label htmlFor="voice-name">Your name</label><input id="voice-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} readOnly={Boolean(token)} autoComplete="name" /></div>
            <div className="field"><label htmlFor="relationship">Relationship</label><input id="relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="Daughter, friend, or myself" required maxLength={100} readOnly={Boolean(token)} /></div>
          </div>
          <p className="form-note">A caregiver can send an invitation but cannot consent for someone else. Voices of people who have died are not supported.{token && " If these details are not yours, ask the sender for a new invitation."}</p>
          <BigButton type="submit">Continue to consent</BigButton>
        </form>
      </Step>
      <Step index={2} step={step} title="Consent">
        <p>Read the statement aloud, exactly as written. Milo keeps this recording and has Gemini check the words. Your voice sample goes to ElevenLabs to make the recreation.</p>
        <blockquote className="consent-statement">{consentStatement(name)}</blockquote>
        <label className="checkbox-row"><input type="checkbox" checked={owner} onChange={(event) => setOwner(event.target.checked)} />I am the living owner of the voice being recorded.</label>
        <label className="checkbox-row"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I understand and agree to this use of my voice. AI recreations will be labeled, and I can request deletion.</label>
        <AudioRecorder label="Consent recording" minSeconds={8} maxSeconds={60} onRecording={setConsent} />
        {sample && <p className="form-note">Your voice sample is saved. Only this statement needs recording again.</p>}
        <BigButton disabled={!owner || !accepted || !consent} onClick={() => { setMessage(""); setStep(3); }}>Continue to voice sample</BigButton>
        <button className="text-button" onClick={() => { setConsent(null); setAccepted(false); setOwner(false); setStep(1); }}>Change details</button>
      </Step>
      <Step index={3} step={step} title="Voice sample">
        <form onSubmit={(event) => void submit(event)}>
          <p className="form-note">Record one to three minutes in a quiet room. Speak naturally. Read the passage below or describe an everyday scene; these words never become memories.</p>
          <details className="more sample-script" open><summary>Reading passage</summary><div>{SAMPLE_SCRIPT.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></details>
          {sample && <p className="form-note">Your earlier sample is saved. Record again only to replace it.</p>}
          <AudioRecorder label="Voice sample" minSeconds={60} maxSeconds={180} onRecording={(recording) => { if (recording) setSample(recording); }} disabled={busy} />
          <BigButton type="submit" disabled={!consent || !sample || !owner || !accepted || busy}>{busy ? "Checking recordings and creating voice…" : "Create my AI voice"}</BigButton>
          <button type="button" disabled={busy} className="text-button" onClick={() => setStep(2)}>Review consent</button>
          {busy && <p role="status" className="form-note">This can take a minute. Keep this page open.</p>}
        </form>
      </Step>
    </ol>
    {message && <p className="form-message form-message-error" role="alert">{message}</p>}
  </>;
}
