"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BigButton } from "./big-button";
import { VoicePreview } from "./voice-preview";
import { VoicePersona } from "./voice-persona";
import { Intro, NextLink, Part, Tags, serial } from "./console";
import { ROTATION_POLICIES, type RotationPolicy } from "@/lib/persona";
import type { VoiceSummary } from "@/lib/enrollment-contract";

const states: Record<VoiceSummary["cloning_status"], string> = { ready: "Ready", pending: "Creating", verification_required: "Needs owner verification", failed: "Setup failed", unknown: "Check ElevenLabs", deleting: "Deleting" };

export function VoiceLibrary() {
  const [voices, setVoices] = useState<VoiceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState("");
  const [policy, setPolicy] = useState<RotationPolicy>("single");
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
  useEffect(() => {
    void fetch("/api/rotation").then((response) => response.ok ? response.json() : null).then((data) => { if (data?.policy) setPolicy(data.policy); }).catch(() => {});
  }, []);
  async function setActive(voice: VoiceSummary, active: boolean) {
    setBusy(voice.id); setMessage("");
    try {
      const response = await fetch(`/api/voices/${voice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The voice could not be updated.");
      setVoices((items) => items.map((item) => item.id === voice.id ? data.voice : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(""); }
  }
  async function changePolicy(next: RotationPolicy) {
    const previous = policy; setPolicy(next); setMessage("");
    try {
      const response = await fetch("/api/rotation", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policy: next }) });
      if (!response.ok) throw new Error((await response.json()).message || "The setting could not be saved.");
    } catch (error) { setPolicy(previous); setMessage(error instanceof Error ? error.message : "Please try again."); }
  }
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
  const inUse = voices.filter((voice) => voice.active).length;
  return <>
    <Intro kicker="Family space" title="Voices" sub="Every voice starts with its owner’s recorded permission." meta={<><span>Step 02 of 05</span><Tags items={[`${voices.length} voices`, `${inUse} in use`]} /></>}>
      <Link className="big-button" href="/caregiver/voices/new">Record my voice</Link>
    </Intro>
    {message && <p className="form-message" role="status">{message}</p>}
    <Part id="library" title="Library" note="Voices in use speak on Talk, always labeled as AI. Without one, Milo uses its stock voice.">
      {loading ? <p className="entries-empty" role="status">Loading…</p> : !voices.length ? <p className="entries-empty">No family voices yet.</p> : <ul className="entries">{voices.map((voice, index) => <li className="entry" key={voice.id}>
        <div className="entry-text">
          <Tags items={[serial("V", index), voice.cloning_status === "ready" ? { text: states.ready, tone: "on" } : states[voice.cloning_status], ...(voice.cloning_status === "ready" ? [voice.active ? { text: "Used in conversations", tone: "on" as const } : "Not in use"] : [])]} />
          <h3>{voice.display_name}</h3>
          <p className="small">{voice.relationship} · consent saved {new Date(voice.consent_recorded_at).toLocaleDateString()}</p>
          {voice.cloning_status === "ready" && <VoicePreview id={voice.id} name={voice.display_name} />}
          {voice.cloning_status === "ready" && <div><BigButton secondary disabled={Boolean(busy)} onClick={() => void setActive(voice, !voice.active)}>{voice.active ? "Stop using this voice" : "Use in conversations"}</BigButton></div>}
          <VoicePersona voice={voice} onSaved={(saved) => setVoices((items) => items.map((item) => item.id === saved.id ? saved : item))} />
          {voice.cloning_status === "verification_required" && <><p className="small">Finish the owner’s verification in ElevenLabs first. Milo will not use an unverified voice.</p><div><BigButton secondary disabled={Boolean(busy)} onClick={() => void verify(voice)}>Check verification</BigButton></div></>}
          {voice.cloning_status === "unknown" && <p className="small">The result could not be confirmed. Check the matching Milo request in ElevenLabs before creating another voice.</p>}
          {confirm === voice.id && <div className="delete-confirm"><p>Delete {voice.display_name}’s AI voice and consent recording?</p><BigButton disabled={Boolean(busy)} onClick={() => void remove(voice)}>{busy === voice.id ? "Deleting…" : "Yes, delete voice"}</BigButton><button className="text-button" onClick={() => setConfirm("")}>Keep voice</button></div>}
        </div>
        <div className="entry-actions">{confirm !== voice.id && <button className="text-button" disabled={Boolean(busy) || ["pending", "unknown"].includes(voice.cloning_status)} onClick={() => setConfirm(voice.id)}>Delete voice</button>}</div>
      </li>)}</ul>}
    </Part>
    <Part id="invite" title="Invite someone" note="They record their own consent and sample. Each link lasts 24 hours and makes one voice.">
      <form onSubmit={(event) => void invite(event)}>
        <div className="form-grid"><div className="field"><label htmlFor="invite-name">Voice owner’s name</label><input id="invite-name" name="name" required maxLength={100} /></div><div className="field"><label htmlFor="invite-relationship">Relationship</label><input id="invite-relationship" name="relationship" required maxLength={100} /></div></div>
        <div className="form-footer"><BigButton type="submit" secondary disabled={Boolean(busy)}>{busy === "invite" ? "Making link…" : "Create recording link"}</BigButton></div>
      </form>
      {link && <div className="record-link"><label htmlFor="record-url" className="field-note">Share this link</label><input id="record-url" readOnly value={link.url} /><BigButton secondary onClick={() => { void navigator.clipboard.writeText(link.url).then(() => setMessage("Recording link copied.")).catch(() => setMessage("Select the link above and copy it.")); }}>Copy link</BigButton><p className="field-note">Expires {new Date(link.expiresAt).toLocaleString()}.{link.localOnly && " This is a localhost link. For another device, set an HTTPS public URL and access code first."}</p></div>}
    </Part>
    {inUse > 1 && <Part id="rotation" title="Taking turns" note="Voices never switch mid-sentence, and stay put when a conversation sounds upset.">
      <div className="field"><label htmlFor="rotation">When several voices are in use</label><select id="rotation" value={policy} onChange={(event) => void changePolicy(event.target.value as RotationPolicy)}>{ROTATION_POLICIES.map((value) => <option key={value} value={value}>{{ single: "One voice only", round_robin_per_topic: "Take turns every 2–4 replies", random_weighted: "Mix voices, favoring less-heard ones" }[value]}</option>)}</select></div>
    </Part>}
    <NextLink after="02" />
  </>;
}
