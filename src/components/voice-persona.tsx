"use client";
import { useState, type FormEvent } from "react";
import { BigButton } from "./big-button";
import type { VoiceSummary } from "@/lib/enrollment-contract";

const lines = (value: FormDataEntryValue | null) => String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

export function VoicePersona({ voice, onSaved }: { voice: VoiceSummary; onSaved: (voice: VoiceSummary) => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const persona = voice.persona;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = { persona: {
      how_they_talk: String(form.get("how") ?? ""), humor: String(form.get("humor") ?? ""),
      pet_names: String(form.get("pets") ?? "").split(",").map((name) => name.trim()).filter(Boolean),
      shared_facts: lines(form.get("facts")), never_claim: lines(form.get("never")),
    } };
    try {
      const response = await fetch(`/api/voices/${voice.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Persona could not be saved.");
      onSaved(data.voice); setMessage("Saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const id = `persona-${voice.id}`;
  return <details className="more"><summary>How {voice.display_name} sounds</summary>
    <form onSubmit={(event) => void save(event)}>
      <div className="field"><label htmlFor={`${id}-how`}>How they talk</label><textarea id={`${id}-how`} name="how" maxLength={300} defaultValue={persona.how_they_talk} placeholder="Gentle and unhurried, short sentences." /></div>
      <div className="form-grid">
        <div className="field"><label htmlFor={`${id}-pets`}>Pet names (comma separated)</label><input id={`${id}-pets`} name="pets" defaultValue={persona.pet_names.join(", ")} /></div>
        <div className="field"><label htmlFor={`${id}-humor`}>Sense of humor</label><input id={`${id}-humor`} name="humor" maxLength={200} defaultValue={persona.humor} /></div>
      </div>
      <div className="field"><label htmlFor={`${id}-facts`}>Shared facts the AI may mention (one per line, up to 8)</label><textarea id={`${id}-facts`} name="facts" defaultValue={persona.shared_facts.join("\n")} placeholder="We love working in the garden together." /><p className="field-note">Only these are used. Nothing else about your shared history is invented.</p></div>
      <div className="field"><label htmlFor={`${id}-never`}>Never claim (one per line)</label><textarea id={`${id}-never`} name="never" defaultValue={persona.never_claim.join("\n")} placeholder="Never say you are coming to visit." /></div>
      <div className="form-footer"><BigButton type="submit" secondary disabled={busy}>{busy ? "Saving…" : "Save persona"}</BigButton>{message && <p className="form-message" role="status">{message}</p>}</div>
    </form>
  </details>;
}
