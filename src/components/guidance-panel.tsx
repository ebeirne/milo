"use client";
import { useEffect, useState, type FormEvent } from "react";
import { BigButton } from "./big-button";
import { Intro, NextLink, Part, Tags, serial } from "./console";
import { RULE_KINDS, type MemoryFact, type RuleKind, type TopicRule } from "@/lib/guidance";

const kinds: Record<RuleKind, { title: string; note: string; label: string; placeholder: string; code: string }> = {
  avoid: { title: "Topics to avoid", note: "Milo won’t raise these, and moves on gently if they come up.", label: "A topic to avoid", placeholder: "The old house being sold", code: "A" },
  steer: { title: "Topics they enjoy", note: "Comforting subjects to return to.", label: "A topic they enjoy", placeholder: "The garden and her roses", code: "S" },
  never_say: { title: "Never say", note: "Things Milo must never say or imply.", label: "Something never to say", placeholder: "Maria passed away in 2019, never say she is alive", code: "N" },
};

export function GuidancePanel() {
  const [rules, setRules] = useState<TopicRule[]>([]);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const [ruleResponse, factResponse] = await Promise.all([fetch("/api/rules", { signal: abort.signal }), fetch("/api/facts", { signal: abort.signal })]);
        if (!ruleResponse.ok || !factResponse.ok) throw new Error("Topics and memory are unavailable right now.");
        const [ruleData, factData] = await Promise.all([ruleResponse.json(), factResponse.json()]);
        if (!abort.signal.aborted) { setRules(ruleData.rules); setFacts(factData.facts); }
      } catch (error) { if (!abort.signal.aborted) setMessage(error instanceof Error ? error.message : "Please try again."); }
      finally { if (!abort.signal.aborted) setLoading(false); }
    })();
    return () => abort.abort();
  }, []);
  // Every change goes through the server, which validates the text and enforces the list limits.
  async function send(url: string, method: string, body?: object) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "That could not be saved.");
      return data;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); return null; }
    finally { setBusy(false); }
  }
  async function add(event: FormEvent<HTMLFormElement>, kind: RuleKind | "fact") {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") ?? "");
    const data = kind === "fact" ? await send("/api/facts", "POST", { text }) : await send("/api/rules", "POST", { kind, text });
    if (!data) return;
    if (kind === "fact") setFacts((items) => [...items, data.fact]); else setRules((items) => [...items, data.rule]);
    form.reset();
  }
  async function removeRule(id: string) { if (await send(`/api/rules/${id}`, "DELETE")) setRules((items) => items.filter((item) => item.id !== id)); }
  async function removeFact(id: string) { if (await send(`/api/facts/${id}`, "DELETE")) setFacts((items) => items.filter((item) => item.id !== id)); }
  async function approve(id: string) {
    const data = await send(`/api/facts/${id}`, "PATCH");
    if (data) setFacts((items) => items.map((item) => item.id === id ? data.fact : item));
  }
  const pending = facts.filter((fact) => !fact.approved);
  const approved = facts.filter((fact) => fact.approved);
  const addRow = (id: string, label: string, placeholder: string, kind: RuleKind | "fact") => (
    <form className="add-row" onSubmit={(event) => void add(event, kind)}>
      <div className="field"><label htmlFor={id}>{label}</label><input id={id} name="text" required maxLength={200} placeholder={placeholder} /></div>
      <BigButton type="submit" secondary disabled={busy}>Add</BigButton>
    </form>
  );
  return <>
    <Intro kicker="Family space" title="Topics & memory" sub="Part of every reply, in every voice." meta={<><span>Step 03 of 05</span><Tags items={[`${rules.length} rules`, `${approved.length} facts`]} /></>} />
    {loading && <p className="entries-empty" role="status">Loading…</p>}
    {message && <p className="form-message form-message-error" role="alert">{message}</p>}
    {pending.length > 0 && <Part title="Waiting for you" note="Milo suggested these from conversations. Nothing is used until you approve it.">
      <ul className="entries">{pending.map((fact, index) => <li className="entry" key={fact.id}>
        <div className="entry-text"><Tags items={[serial("M", index), { text: "Suggested", tone: "warn" }]} /><p>{fact.text}</p></div>
        <div className="entry-actions"><BigButton secondary disabled={busy} onClick={() => void approve(fact.id)} aria-label={`Approve: ${fact.text}`}>Approve</BigButton><button className="text-button" disabled={busy} onClick={() => void removeFact(fact.id)} aria-label={`Dismiss: ${fact.text}`}>Dismiss</button></div>
      </li>)}</ul>
    </Part>}
    {RULE_KINDS.map((kind) => {
      const items = rules.filter((rule) => rule.kind === kind);
      return <Part key={kind} id={kind} title={kinds[kind].title} note={kinds[kind].note}>
        {items.length ? <ul className="entries">{items.map((rule, index) => <li className="entry" key={rule.id}>
          <div className="entry-text"><Tags items={[serial(kinds[kind].code, index)]} /><p>{rule.text}</p></div>
          <div className="entry-actions"><button className="icon-button" disabled={busy} onClick={() => void removeRule(rule.id)} aria-label={`Remove: ${rule.text}`}>−</button></div>
        </li>)}</ul> : <p className="entries-empty">None yet.</p>}
        {addRow(`${kind}-text`, kinds[kind].label, kinds[kind].placeholder, kind)}
      </Part>;
    })}
    <Part id="facts" title="Things Milo may remember" note="Facts any voice may mention. Memories shared with one person belong in that voice’s persona.">
      {approved.length ? <ul className="entries">{approved.map((fact, index) => <li className="entry" key={fact.id}>
        <div className="entry-text"><Tags items={[serial("F", index), ...(fact.source === "proposed" ? ["Suggested by Milo"] : [])]} /><p>{fact.text}</p></div>
        <div className="entry-actions"><button className="icon-button" disabled={busy} onClick={() => void removeFact(fact.id)} aria-label={`Remove: ${fact.text}`}>−</button></div>
      </li>)}</ul> : <p className="entries-empty">None yet.</p>}
      {addRow("fact-text", "A fact to remember", "She has tea at four every afternoon.", "fact")}
    </Part>
    <NextLink after="03" />
  </>;
}
