"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Volume2 } from "lucide-react";
import { BigButton } from "./big-button";
import { VoicePlayer } from "@/lib/voice/player";
import type { DueEvent } from "@/lib/voice/protocol";

const localNow = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `date=${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}&time=${pad(now.getHours())}:${pad(now.getMinutes())}&day=${now.getDay()}`;
};

async function fetchDue(signal?: AbortSignal): Promise<DueEvent[]> {
  const response = await fetch(`/api/due?${localNow()}`, { signal });
  if (!response.ok) return [];
  return (await response.json() as { events?: DueEvent[] }).events ?? [];
}

// Browsers only allow sound after the person has touched the page; until then the card is shown silently.
async function speak(player: VoicePlayer, due: DueEvent, setMessage: (message: string) => void) {
  setMessage("");
  try {
    player.stop();
    await Promise.race([player.unlock(), new Promise((_, reject) => setTimeout(() => reject(new Error("Sound is locked")), 1500))]);
    player.chime();
    const audio = due.sentences.map((sentence) => fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: sentence.ticket }) }).then((result) => {
      if (!result.ok) throw new Error("Voice unavailable");
      return result.arrayBuffer();
    }));
    for (const bytes of audio) void bytes.catch(() => {});
    for (const bytes of audio) await player.queue(await bytes);
  } catch { setMessage("Tap “Read it to me” to hear this."); }
}

// Scheduled reminders and check-ins for the Talk screen. They only arrive while this screen is open.
// `quiet` holds a new one back while the person is recording or listening to a reply.
export function DueReminders({ quiet, volume }: { quiet: boolean; volume: number }) {
  const [event, setEvent] = useState<DueEvent | null>(null);
  const [message, setMessage] = useState("");
  const player = useRef<VoicePlayer | null>(null);
  const announced = useRef(new Set<string>());
  const quietRef = useRef(quiet);
  const eventRef = useRef<DueEvent | null>(null);

  useEffect(() => { quietRef.current = quiet; if (quiet) player.current?.stop(); }, [quiet]);
  useEffect(() => { player.current?.setVolume(volume / 100); }, [volume]);

  useEffect(() => {
    player.current = new VoicePlayer();
    const active = player.current;
    const abort = new AbortController();
    const check = async () => {
      if (eventRef.current || quietRef.current || document.hidden) return;
      try {
        const next = (await fetchDue(abort.signal))[0];
        if (!next || eventRef.current || quietRef.current) return;
        eventRef.current = next;
        setEvent(next);
        if (!announced.current.has(next.id)) { announced.current.add(next.id); void speak(active, next, setMessage); }
      } catch { /* The next poll tries again. */ }
    };
    void check();
    const timer = setInterval(() => void check(), 30000);
    return () => { clearInterval(timer); abort.abort(); void active.dispose(); };
  }, []);

  async function replay() {
    if (!event) return;
    // Speech tickets are short-lived, so a replay asks for fresh ones.
    const fresh = (await fetchDue().catch(() => [])).find((item) => item.id === event.id) ?? event;
    await speak(player.current!, fresh, setMessage);
  }

  async function answer(action: "done" | "later") {
    if (!event) return;
    player.current?.stop();
    try {
      const response = await fetch(`/api/due/${event.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!response.ok) throw new Error("Not saved");
      announced.current.delete(event.id);
      eventRef.current = null;
      setEvent(null);
      setMessage("");
    } catch { setMessage("That couldn’t be saved. Please try again."); }
  }

  if (!event) return null;
  const reminder = event.kind === "reminder";
  return (
    <section className="card due-card" role="alert" aria-labelledby="due-title">
      <p className="due-voice"><Bell size={24} aria-hidden="true" />{event.speaker ? event.speaker.label : "Milo · AI stock voice"}</p>
      <h2 id="due-title">{reminder ? "A reminder for you" : "Just checking in"}</h2>
      <p className="due-text">{event.text}</p>
      <div className="talk-controls">
        <BigButton onClick={() => void answer("done")}>{reminder ? "Done" : "Thank you"}</BigButton>
        <BigButton secondary onClick={() => void answer("later")}>Remind me later</BigButton>
        <BigButton secondary onClick={() => void replay()}><Volume2 size={24} aria-hidden="true" />Read it to me</BigButton>
      </div>
      {message && <p className="field-note" role="status">{message}</p>}
    </section>
  );
}
