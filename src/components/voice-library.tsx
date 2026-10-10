"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BigButton } from "./big-button";
import { VoicePreview } from "./voice-preview";
import type { VoiceSummary } from "@/lib/enrollment-contract";

const states: Record<VoiceSummary["cloning_status"], string> = { ready: "Ready to preview", pending: "Creating voice", verification_required: "Owner verification needed", failed: "Setup failed", unknown: "Review in ElevenLabs", deleting: "Deletion pending" };

export function VoiceLibrary() {
  const [voices, setVoices] = useState<VoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");
  const [link, setLink] = useState<{ url: string; expiresAt: string; localOnly: boolean } | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/voices", { signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Voice library unavailable.");
        if (!abort.signal.aborted) setVoices(data.voices);
      } catch (error) { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "Please try again."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, []);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("invite"); setMessage(""); setLink(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/record-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.get("name"), relationship: form.get("relationship") }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Invitation unavailable.");
      setLink(data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(""); }
  }
  async function remove(voice: VoiceSummary) {
    setBusy(voice.id); setMessage("");
    try {
      const response = await fetch(`/api/voices/${voice.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Deletion could not be completed.");
      setVoices((items) => items.filter((item) => item.id !== voice.id)); setConfirm("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(""); }
  }
  async function verify(voice: VoiceSummary) {
    setBusy(voice.id); setMessage("");
    try {
      const response = await fetch(`/api/voices/${voice.id}/verify`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Verification could not be checked.");
      setVoices((items) => items.map((item) => item.id === voice.id ? data.voice : item));
      if (data.voice.cloning_status !== "ready") setMessage("The voice owner’s verification is still pending in ElevenLabs.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(""); }
  }
  return <div className="voice-library">
    <div className="section-heading"><div><p className="eyebrow">FAMILY VOICES</p><h1>Voices that feel like home.</h1><p className="muted">Every recreation begins with the owner’s recorded permission.</p></div><Link className="big-button" href="/caregiver/voices/new">Record my voice</Link></div>
    {loading && <p role="status">Loading your voices…</p>}
    {!loading && !voices.length && <div className="card voice-empty"><h2>Your voice library is waiting.</h2><p>Record your own voice here, or invite a living family member or friend to record theirs.</p></div>}
    <div className="voice-card-grid">{voices.map((voice) => <article className="card voice-card" key={voice.id}>
      <h2>{voice.display_name}</h2><p className="muted">{voice.relationship}</p><p className="voice-state">{states[voice.cloning_status]}</p>
      <p>AI recreation, recorded with the voice owner’s permission.</p><p className="field-note">Consent saved {new Date(voice.consent_recorded_at).toLocaleDateString()}.</p>
      {voice.cloning_status === "ready" && <VoicePreview id={voice.id} name={voice.display_name} />}
      {voice.cloning_status === "verification_required" && <><p>Complete the voice owner’s verification in ElevenLabs before previewing. Familiar will not use an unverified voice.</p><BigButton secondary disabled={Boolean(busy)} onClick={() => void verify(voice)}>Check verification</BigButton></>}
      {voice.cloning_status === "unknown" && <p>The provider’s result could not be confirmed. Check the matching Familiar request in ElevenLabs before creating another voice.</p>}
      {confirm === voice.id ? <div className="delete-confirm"><p>Delete {voice.display_name}’s AI voice and consent recording? This removes the provider voice and the local profile.</p><BigButton disabled={Boolean(busy)} onClick={() => void remove(voice)}>{busy === voice.id ? "Deleting…" : "Yes, delete voice"}</BigButton><button className="text-button" onClick={() => setConfirm("")}>Keep voice</button></div> : <button className="text-button" disabled={Boolean(busy) || ["pending", "unknown"].includes(voice.cloning_status)} onClick={() => setConfirm(voice.id)}>Delete voice</button>}
    </article>)}</div>
    <section className="card invitation-card" aria-labelledby="invite-title"><h2 id="invite-title">Invite someone to record remotely.</h2><p>They will record their own consent and voice sample. Each invitation expires after 24 hours and can create one voice.</p><form onSubmit={(event) => void invite(event)}><div className="form-grid"><div className="field"><label htmlFor="invite-name">Voice owner’s name</label><input id="invite-name" name="name" required maxLength={100} /></div><div className="field"><label htmlFor="invite-relationship">Relationship</label><input id="invite-relationship" name="relationship" required maxLength={100} /></div></div><BigButton type="submit" disabled={Boolean(busy)}>{busy === "invite" ? "Making invitation…" : "Create recording link"}</BigButton></form>
      {link && <div className="record-link"><label htmlFor="record-url">Share this recording link</label><input id="record-url" readOnly value={link.url} /><BigButton secondary onClick={() => { void navigator.clipboard.writeText(link.url).then(() => setMessage("Recording link copied.")).catch(() => setMessage("Select the link above and copy it.")); }}>Copy link</BigButton><p>Expires {new Date(link.expiresAt).toLocaleString()}.</p>{link.localOnly && <p>This is a localhost link. For another device, configure an HTTPS public URL and caregiver access code first.</p>}</div>}
    </section>
    <p className="form-note">You can preview each voice here. Family voices will be connected to companion conversations next.</p>
    {message && <p className="form-message" role="status">{message}</p>}
  </div>;
}
