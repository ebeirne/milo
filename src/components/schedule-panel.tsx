"use client";
import { useEffect, useState, type FormEvent } from "react";
import { BigButton } from "./big-button";
import { Intro, NextLink, Part, Tags, serial } from "./console";
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
  const when = (kind: ScheduleKind) => <>
    <div className="form-grid">
      <div className="field"><label htmlFor={`${kind}-time`}>Time</label><input id={`${kind}-time`} name="time" type="time" required /></div>
      <div className="field"><label htmlFor={`${kind}-voice`}>Spoken by</label><select id={`${kind}-voice`} name="voice" defaultValue=""><option value="">Milo’s stock voice</option>{voices.map((voice) => <option key={voice.id} value={voice.id}>AI voice of {voice.name}</option>)}</select></div>
    </div>
    <fieldset className="days"><legend>Days</legend>{DAY_NAMES.map((name, day) => <label className="day" key={name}><input type="checkbox" name="days" value={day} defaultChecked /><span>{name}</span></label>)}</fieldset>
  </>;
  const list = (kind: ScheduleKind) => {
    const rows = items.filter((item) => item.kind === kind);
    if (!rows.length) return <p className="entries-empty">None yet.</p>;
    return <ul className="entries">{rows.map((item, index) => <li className="entry" key={item.id}>
      <div className="entry-text"><Tags items={[serial(kind === "reminder" ? "R" : "C", index), item.time, describeDays(item.days), item.voiceName ? `AI voice of ${item.voiceName}` : "Stock voice"]} /><p>{kind === "reminder" ? item.text : CHECKIN_STYLES[item.text as keyof typeof CHECKIN_STYLES] ?? item.text}</p></div>
      <div className="entry-actions"><button className="icon-button" disabled={busy} onClick={() => void remove(item)} aria-label={`Remove the ${item.time} ${kind === "reminder" ? "reminder" : "check-in"}`}>−</button></div>
    </li>)}</ul>;
  };
  const reminders = items.filter((item) => item.kind === "reminder").length;
  return <>
    <Intro kicker="Family space" title="Reminders" sub="They play while Talk is open on their device." meta={<><span>Step 04 of 05</span><Tags items={[`${reminders} reminders`, `${items.length - reminders} check-ins`]} /></>} />
    {loading && <p className="entries-empty" role="status">Loading…</p>}
    {message && <p className="form-message form-message-error" role="alert">{message}</p>}
    <Part id="reminders" title="Reminders" note="Spoken exactly as written. One left unanswered for twenty minutes shows up under Their day.">
      {list("reminder")}
      <details className="more"><summary>Add a reminder</summary>
        <form onSubmit={(event) => void add(event, "reminder")}><div className="field"><label htmlFor="reminder-text">What to say</label><input id="reminder-text" name="text" required maxLength={200} placeholder="Time for your morning pills, the ones on the kitchen table." /></div>{when("reminder")}<div className="form-footer"><BigButton type="submit" disabled={busy}>Add reminder</BigButton></div></form>
      </details>
    </Part>
    <Part id="checkins" title="Check-ins" note="A friendly hello that invites a chat.">
      {list("checkin")}
      <details className="more"><summary>Add a check-in</summary>
        <form onSubmit={(event) => void add(event, "checkin")}><div className="field"><label htmlFor="checkin-style">What to say</label><select id="checkin-style" name="style" defaultValue="gentle">{Object.entries(CHECKIN_STYLES).map(([style, text]) => <option key={style} value={style}>{text}</option>)}</select></div>{when("checkin")}<div className="form-footer"><BigButton type="submit" disabled={busy}>Add check-in</BigButton></div></form>
      </details>
    </Part>
    <p className="form-note">Every scheduled message starts by saying it is Milo, or whose AI voice it is.</p>
    <NextLink after="04" />
  </>;
}
