"use client";
import { useEffect, useState, type FormEvent } from "react";
import { BigButton } from "./big-button";
import { RULE_KINDS, type MemoryFact, type RuleKind, type TopicRule } from "@/lib/guidance";

const kinds: Record<RuleKind, { title: string; note: string; label: string; placeholder: string }> = {
  avoid: { title: "Topics to avoid", note: "Familiar won’t bring these up, and gently moves on if they come up.", label: "A topic to avoid", placeholder: "The old house being sold" },
  steer: { title: "Topics to steer toward", note: "Comforting subjects to return to when a conversation stalls.", label: "A topic they enjoy", placeholder: "The garden and her roses" },
  never_say: { title: "Never say", note: "Things Familiar must never say or imply.", label: "Something never to say", placeholder: "Maria passed away in 2019, never say she is alive" },
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
  return <div className="voice-library">
    <div className="section-heading"><div><p className="eyebrow">TOPICS &amp; MEMORY</p><h1>You steer the conversation.</h1><p className="muted">These rules are part of every reply, whichever voice is speaking.</p></div></div>
    {loading && <p role="status">Loading your rules…</p>}
    {message && <p className="form-message form-message-error" role="alert">{message}</p>}
    {pending.length > 0 && <section className="card guidance-card" aria-labelledby="review-title"><h2 id="review-title">Waiting for your review</h2><p className="field-note">Familiar suggested remembering these from conversations. Nothing here is used until you approve it.</p>
      <ul className="guidance-list">{pending.map((fact) => <li key={fact.id}><span>{fact.text}</span><span className="guidance-actions"><BigButton secondary disabled={busy} onClick={() => void approve(fact.id)} aria-label={`Approve: ${fact.text}`}>Approve</BigButton><button className="text-button" disabled={busy} onClick={() => void removeFact(fact.id)} aria-label={`Dismiss: ${fact.text}`}>Dismiss</button></span></li>)}</ul>
    </section>}
    <div className="voice-card-grid">{RULE_KINDS.map((kind) => <section className="card guidance-card" key={kind} aria-labelledby={`${kind}-title`}>
      <h2 id={`${kind}-title`}>{kinds[kind].title}</h2><p className="field-note">{kinds[kind].note}</p>
      <ul className="guidance-list">{rules.filter((rule) => rule.kind === kind).map((rule) => <li key={rule.id}><span>{rule.text}</span><button className="text-button" disabled={busy} onClick={() => void removeRule(rule.id)} aria-label={`Remove: ${rule.text}`}>Remove</button></li>)}</ul>
      <form onSubmit={(event) => void add(event, kind)}><div className="field"><label htmlFor={`${kind}-text`}>{kinds[kind].label}</label><input id={`${kind}-text`} name="text" required maxLength={200} placeholder={kinds[kind].placeholder} /></div><BigButton type="submit" secondary disabled={busy}>Add</BigButton></form>
    </section>)}
    <section className="card guidance-card" aria-labelledby="facts-title">
      <h2 id="facts-title">Things Familiar may remember</h2><p className="field-note">Facts about the person that any voice may mention. Shared memories with one person belong in that voice’s persona.</p>
      <ul className="guidance-list">{approved.map((fact) => <li key={fact.id}><span>{fact.text}</span><button className="text-button" disabled={busy} onClick={() => void removeFact(fact.id)} aria-label={`Remove: ${fact.text}`}>Remove</button></li>)}</ul>
      <form onSubmit={(event) => void add(event, "fact")}><div className="field"><label htmlFor="fact-text">A fact to remember</label><input id="fact-text" name="text" required maxLength={200} placeholder="She has tea at four every afternoon." /></div><BigButton type="submit" secondary disabled={busy}>Add</BigButton></form>
    </section></div>
  </div>;
}
