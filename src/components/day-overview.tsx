"use client";
import { useEffect, useState } from "react";
import { BigButton } from "./big-button";
import type { Flag } from "@/lib/db/flags";
import type { ConversationSummary } from "@/lib/db/summaries";
import type { DayEvent } from "@/lib/schedule";

type Overview = { preferredName: string | null; pendingSummaries: number; summaries: ConversationSummary[]; flags: Flag[]; events: DayEvent[] };
const tiers: Record<Flag["tier"], string> = { emergency: "Emergency", possible_emergency: "Possible emergency", concern: "Concern" };
const statuses: Record<DayEvent["status"], string> = { done: "Done", missed: "Not answered", pending: "Waiting" };
const when = (value: string) => new Date(value).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" });

export function DayOverview() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/summary", { signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "The overview is unavailable right now.");
        if (!abort.signal.aborted) setOverview(data);
      } catch (error) { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "Please try again."); }
    })();
    return () => abort.abort();
  }, []);
  async function acknowledge(flag: Flag) {
    setBusy(flag.id); setMessage("");
    try {
      const response = await fetch(`/api/flags/${flag.id}/ack`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json()).message || "That couldn’t be saved.");
      setOverview((current) => current && { ...current, flags: current.flags.map((item) => item.id === flag.id ? { ...item, acknowledged: true } : item) });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(""); }
  }
  const open = overview?.flags.filter((flag) => !flag.acknowledged) ?? [];
  const seen = overview?.flags.filter((flag) => flag.acknowledged) ?? [];
  const moods = overview?.summaries.filter((item) => item.mood).slice(0, 7).reverse() ?? [];
  return <div className="voice-library">
    <div className="section-heading"><div><p className="eyebrow">A WINDOW INTO THEIR DAY</p><h1>{overview?.preferredName ? `How ${overview.preferredName} has been.` : "How they have been."}</h1><p className="muted">Short summaries and concerns from the last seven days. Full conversations are never shown here.</p></div></div>
    {!overview && !message && <p role="status">Gathering the overview… this can take a few seconds.</p>}
    {message && <p className="form-message form-message-error" role="alert">{message}</p>}
    {overview && <div className="day-grid">
      <section className="card guidance-card wide" aria-labelledby="flags-title"><h2 id="flags-title">Needs your attention</h2>
        {!open.length && <p className="field-note">Nothing is waiting for you.</p>}
        <ul className="guidance-list">{open.map((flag) => <li key={flag.id}><span className={`flag-${flag.tier}`}><strong>{tiers[flag.tier]}</strong> · {when(flag.created_at)}<br />{flag.reason}{flag.kind === "self_harm" && <><br />The 988 Suicide &amp; Crisis Lifeline was shown to them.</>}</span><BigButton secondary disabled={Boolean(busy)} onClick={() => void acknowledge(flag)} aria-label={`Acknowledge: ${flag.reason}`}>{busy === flag.id ? "Saving…" : "Acknowledge"}</BigButton></li>)}</ul>
        {seen.length > 0 && <details className="persona-form"><summary>Acknowledged ({seen.length})</summary><ul className="guidance-list">{seen.map((flag) => <li key={flag.id}><span>{tiers[flag.tier]} · {when(flag.created_at)} · {flag.reason}</span></li>)}</ul></details>}
        <p className="field-note">Familiar never calls anyone. In an emergency it shows them a Call 911 button and records it here.</p>
      </section>
      <section className="card guidance-card" aria-labelledby="summaries-title"><h2 id="summaries-title">Conversations</h2>
        {!overview.summaries.length && <p className="field-note">No conversations yet this week.</p>}
        <ul className="guidance-list">{overview.summaries.map((item) => <li key={item.id}><span><strong>{when(item.started_at)}</strong>{item.mood && <span className="mood-chip">{item.mood}</span>}<br />{item.summary}</span></li>)}</ul>
        {overview.pendingSummaries > 0 && <p className="field-note">{overview.pendingSummaries} recent conversation{overview.pendingSummaries === 1 ? "" : "s"} could not be summarized yet. Reload to try again.</p>}
        {moods.length > 1 && <p className="field-note">Mood, oldest to newest: {moods.map((item) => item.mood).join(" → ")}</p>}
      </section>
      <section className="card guidance-card" aria-labelledby="events-title"><h2 id="events-title">Reminders, last 24 hours</h2>
        {!overview.events.length && <p className="field-note">No reminders or check-ins came due.</p>}
        <ul className="guidance-list">{overview.events.map((event) => <li key={event.id}><span><strong>{statuses[event.status]}</strong> · {when(event.created_at)}<br />{event.kind === "checkin" ? "Check-in" : event.text}</span></li>)}</ul>
      </section>
    </div>}
  </div>;
}
