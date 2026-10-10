"use client";
import { useEffect, useRef, useState } from "react";
import { BigButton } from "./big-button";

export function VoicePreview({ id, name, token }: { id: string; name: string; token?: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const reference = useRef("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); if (reference.current) URL.revokeObjectURL(reference.current); }, []);
  async function preview() {
    if (busy) return;
    setBusy(true); setMessage("");
    const abort = new AbortController(); pending.current = abort;
    try {
      const response = await fetch(`/api/voices/${id}/preview`, { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      if (!response.ok) { const error = await response.json(); throw new Error(error.message || "Preview unavailable."); }
      const blob = await response.blob();
      if (reference.current) URL.revokeObjectURL(reference.current);
      reference.current = URL.createObjectURL(blob); setUrl(reference.current);
    } catch (error) { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  return <div className="voice-preview"><BigButton secondary disabled={busy} onClick={() => void preview()}>{busy ? "Making preview…" : "Make voice preview"}</BigButton>{url && <><p>AI recreation of {name}’s voice, made with their permission.</p><audio src={url} controls aria-label={`AI voice preview of ${name}`} /></>}{message && <p role="alert">{message}</p>}</div>;
}
