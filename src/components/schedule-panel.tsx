"use client";
import { useEffect, useState, type FormEvent } from "react";
import { BigButton } from "./big-button";
import { CHECKIN_STYLES, DAY_NAMES, type ScheduleItem, type ScheduleKind } from "@/lib/schedule";

type Voice = { id: string; name: string };
const describeDays = (days: number[]) => days.length === 7 ? "Every day" : days.map((day) => DAY_NAMES[day]).join(", ");

export function SchedulePanel() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/reminders", { signal: abort.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Reminders are unavailable right now.");
        if (!abort.signal.aborted) { setItems(data.items); setVoices(data.voices); }
      } catch (error) { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "Please try again."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, []);
  async function add(event: FormEvent<HTMLFormElement>, kind: ScheduleKind) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const response = await fetch("/api/reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        kind, text: data.get("text"), style: data.get("style"), time: data.get("time"), days: data.getAll("days").map(Number), voiceId: data.get("voice") || null,
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "That could not be saved.");
      setItems(result.items); form.reset();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }
  async function remove(item: ScheduleItem) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/reminders/${item.id}?kind=${item.kind}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json()).message || "That could not be removed.");
      setItems((current) => current.filter((other) => other.id !== item.id));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const fields = (kind: ScheduleKind) => <>
    <div className="form-grid">
      <div className="field"><label htmlFor={`${kind}-time`}>Time</label><input id={`${kind}-time`} name="time" type="time" required /></div>
      <div className="field"><label htmlFor={`${kind}-voice`}>Spoken by</label><select id={`${kind}-voice`} name="voice" defaultValue=""><option value="">Familiar’s stock voice</option>{voices.map((voice) => <option key={voice.id} value={voice.id}>AI voice of {voice.name}</option>)}</select></div>
    </div>
    <fieldset className="schedule-days"><legend>Days</legend>{DAY_NAMES.map((name, day) => <label className="checkbox-row" key={name}><input type="checkbox" name="days" value={day} defaultChecked />{name}</label>)}</fieldset>
  </>;
  const list = (kind: ScheduleKind) => <ul className="guidance-list">{items.filter((item) => item.kind === kind).map((item) => <li key={item.id}>
    <span><strong>{item.time}</strong> · {describeDays(item.days)} · {item.voiceName ? `AI voice of ${item.voiceName}` : "stock voice"}<br />{kind === "reminder" ? item.text : CHECKIN_STYLES[item.text as keyof typeof CHECKIN_STYLES] ?? item.text}</span>
    <button className="text-button" disabled={busy} onClick={() => void remove(item)} aria-label={`Remove the ${item.time} ${kind === "reminder" ? "reminder" : "check-in"}`}>Remove</button>
  </li>)}</ul>;
  return <div className="voice-library">
    <div className="section-heading"><div><p className="eyebrow">REMINDERS &amp; CHECK-INS</p><h1>A gentle nudge, in a familiar voice.</h1><p className="muted">These play on the Talk screen while it is open on their device. They cannot play when the app is closed.</p></div></div>
    {loading && <p role="status">Loading reminders…</p>}
    {message && <p className="form-message form-message-error" role="alert">{message}</p>}
    <div className="voice-card-grid">
      <section className="card guidance-card" aria-labelledby="reminders-title"><h2 id="reminders-title">Reminders</h2><p className="field-note">Spoken exactly as you write it. If it isn’t answered within 20 minutes, you’ll see a note on the overview.</p>
        {list("reminder")}
        <form onSubmit={(event) => void add(event, "reminder")}><div className="field"><label htmlFor="reminder-text">What to say</label><input id="reminder-text" name="text" required maxLength={200} placeholder="Time for your morning pills, the ones on the kitchen table." /></div>{fields("reminder")}<BigButton type="submit" secondary disabled={busy}>Add reminder</BigButton></form>
      </section>
      <section className="card guidance-card" aria-labelledby="checkins-title"><h2 id="checkins-title">Check-ins</h2><p className="field-note">A friendly hello that invites them to talk.</p>
        {list("checkin")}
        <form onSubmit={(event) => void add(event, "checkin")}><div className="field"><label htmlFor="checkin-style">What to say</label><select id="checkin-style" name="style" defaultValue="gentle">{Object.entries(CHECKIN_STYLES).map(([style, text]) => <option key={style} value={style}>{text}</option>)}</select></div>{fields("checkin")}<BigButton type="submit" secondary disabled={busy}>Add check-in</BigButton></form>
      </section>
    </div>
    <p className="form-note">Every scheduled message begins by saying it is Familiar, or whose AI voice it is.</p>
  </div>;
}
