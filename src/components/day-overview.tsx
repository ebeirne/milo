"use client";
import { useEffect, useState } from "react";
import { BigButton } from "./big-button";
import { Intro, NextLink, Part, Tags } from "./console";
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
  return <>
    <Intro kicker="Family space" title="Their day" sub={`How ${overview?.preferredName ?? "they"} ${overview?.preferredName ? "has" : "have"} been this week. Never full conversations.`} meta={<><span>Step 05 of 05</span><Tags items={[open.length ? { text: `${open.length} waiting`, tone: "alert" } : "Nothing waiting"]} /></>} />
    {!overview && !message && <p className="entries-empty" role="status">Gathering the overview… this can take a few seconds.</p>}
    {message && <p className="form-message form-message-error" role="alert">{message}</p>}
    {overview && <>
      <Part id="attention" title="Needs your attention" note="Milo never calls anyone. In an emergency it shows a Call 911 button and records it here.">
        {open.length ? <ul className="entries">{open.map((flag) => <li className="entry" key={flag.id}>
          <div className="entry-text"><Tags items={[{ text: tiers[flag.tier], tone: flag.tier === "concern" ? "warn" : "alert" }, when(flag.created_at)]} /><p>{flag.reason}</p>{flag.kind === "self_harm" && <p className="small">The 988 Suicide &amp; Crisis Lifeline was shown to them.</p>}</div>
          <div className="entry-actions"><BigButton secondary disabled={Boolean(busy)} onClick={() => void acknowledge(flag)} aria-label={`Acknowledge: ${flag.reason}`}>{busy === flag.id ? "Saving…" : "Acknowledge"}</BigButton></div>
        </li>)}</ul> : <p className="entries-empty">Nothing is waiting for you.</p>}
        {seen.length > 0 && <details className="more"><summary>Acknowledged ({seen.length})</summary><ul className="entries">{seen.map((flag) => <li className="entry" key={flag.id}><div className="entry-text"><Tags items={[tiers[flag.tier], when(flag.created_at)]} /><p>{flag.reason}</p></div></li>)}</ul></details>}
      </Part>
      <Part id="conversations" title="Conversations" note={overview.pendingSummaries > 0 ? `${overview.pendingSummaries} recent conversation${overview.pendingSummaries === 1 ? "" : "s"} could not be summarized yet. Reload to try again.` : "A sentence or two each, with the mood."}>
        {overview.summaries.length ? <ul className="entries">{overview.summaries.map((item) => <li className="entry" key={item.id}><div className="entry-text"><Tags items={[when(item.started_at), ...(item.mood ? [{ text: item.mood, tone: "on" as const }] : [])]} /><p>{item.summary}</p></div></li>)}</ul> : <p className="entries-empty">No conversations yet this week.</p>}
      </Part>
      <Part id="answered" title="Reminders, last 24 hours">
        {overview.events.length ? <ul className="entries">{overview.events.map((event) => <li className="entry" key={event.id}><div className="entry-text"><Tags items={[event.status === "missed" ? { text: statuses[event.status], tone: "warn" } : statuses[event.status], when(event.created_at)]} /><p>{event.kind === "checkin" ? "Check-in" : event.text}</p></div></li>)}</ul> : <p className="entries-empty">No reminders or check-ins came due.</p>}
      </Part>
    </>}
    <NextLink after="05" />
  </>;
}
