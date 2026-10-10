"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AudioRecorder, type Recording } from "./audio-recorder";
import { BigButton } from "./big-button";
import { VoicePreview } from "./voice-preview";
import { consentStatement, SAMPLE_SCRIPT, validOwnerDetails, type VoiceSummary } from "@/lib/enrollment-contract";

type Invitation = { name: string; relationship: string; submissionId: string; expiresAt: string };
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
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }

  if (token && !invitation) return <section className="card enrollment-card"><h1>{failedInvitation ? "This invitation isn’t available." : "Opening your invitation…"}</h1><p>{message || "One moment."}</p>{failedInvitation && <p>Ask the person who invited you for a new recording link.</p>}</section>;
  return <section className="card enrollment-card" aria-labelledby="enrollment-title">
    <p className="eyebrow">{token ? "YOUR RECORDING INVITATION" : "FAMILY VOICES"}</p>
    <h1 id="enrollment-title">{step === 4 ? "Thank you for sharing your voice." : "A familiar voice, with permission."}</h1>
    {step < 4 && <p className="muted">Step {step} of 3 · Only the living voice owner can record and give consent.</p>}
    {step === 1 && <form onSubmit={(event) => { event.preventDefault(); if (!validOwnerDetails(name, relationship)) { setMessage("Enter a name and relationship of up to 100 characters."); return; } setMessage(""); if (!submissionId) setSubmissionId(crypto.randomUUID()); setStep(2); }}>
      <div className="field"><label htmlFor="voice-name">Your name</label><input id="voice-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} readOnly={Boolean(token)} autoComplete="name" /></div>
      <div className="field"><label htmlFor="relationship">Relationship</label><input id="relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="e.g. daughter, friend, or myself" required maxLength={100} readOnly={Boolean(token)} /></div>
      <p className="form-note">A caregiver can prepare an invitation, but cannot consent or record on someone else’s behalf. Voices of deceased people are not supported.</p>
      {token && <p>If these details are not yours, ask the sender for a corrected invitation.</p>}
      <BigButton type="submit">Continue to consent</BigButton>
    </form>}
    {step === 2 && <div>
      <p>Read the full statement aloud exactly as written, in your own voice. Familiar stores the consent recording and sends it to Gemini to check the words. Your voice sample goes to ElevenLabs to create the recreation.</p>
      <blockquote className="consent-statement">{consentStatement(name)}</blockquote>
      <label className="checkbox-row"><input type="checkbox" checked={owner} onChange={(event) => setOwner(event.target.checked)} />I am the living owner of the voice being recorded.</label>
      <label className="checkbox-row"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />I understand and agree to this use of my voice. AI recreations will be labeled, and I can request deletion.</label>
      <AudioRecorder label="Consent recording" minSeconds={8} maxSeconds={60} onRecording={setConsent} />
      <BigButton disabled={!owner || !accepted || !consent} onClick={() => { setMessage(""); setStep(3); }}>Continue to voice sample</BigButton>
      <button className="text-button" onClick={() => { setConsent(null); setAccepted(false); setOwner(false); setStep(1); }}>Change details</button>
    </div>}
    {step === 3 && <form onSubmit={(event) => void submit(event)}>
      <h2>Record 1–3 minutes in a quiet room.</h2><p>Speak naturally, with a little space between sentences. Avoid music, echo, and other speakers. Read the passage below or describe an everyday scene. The words in this sample do not become companion memories.</p>
      <details className="sample-script" open><summary>Guided reading passage</summary>{SAMPLE_SCRIPT.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</details>
      <AudioRecorder label="Voice sample" minSeconds={60} maxSeconds={180} onRecording={setSample} disabled={busy} />
      <p className="form-note">Familiar checks the length and audio level before creating a voice. The sample is removed locally after processing; your consent recording is kept with the voice profile.</p>
      <BigButton type="submit" disabled={!consent || !sample || !owner || !accepted || busy}>{busy ? "Checking recordings and creating voice…" : "Create my AI voice"}</BigButton>
      <button type="button" disabled={busy} className="text-button" onClick={() => { setSample(null); setStep(2); }}>Review consent</button>
      {busy && <p role="status">This may take a minute. Keep this page open; the voice library will show the result if the connection is interrupted.</p>}
    </form>}
    {step === 4 && voice && <div><p>Your recorded permission is saved. This is an AI recreation, not the real person speaking.</p>{voice.cloning_status === "ready" ? <VoicePreview id={voice.id} name={voice.display_name} token={token} /> : <p>The voice was created, but ElevenLabs requires owner verification before it can be previewed. The person setting up Familiar can review it in the voice library.</p>}{!token && <Link className="big-button" href="/caregiver/voices">Go to voice library</Link>}</div>}
    {message && <p className="form-message form-message-error" role="alert">{message}</p>}
  </section>;
}
