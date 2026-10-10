"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mic, Send, Square, Volume2, MessageCircle } from "lucide-react";
import { BigButton } from "./big-button";
import { VoicePlayer } from "@/lib/voice/player";
import { readSse, STOCK_VOICE_LABEL, type ConversationEvent, type VoiceConfig } from "@/lib/voice/protocol";

type Status = "loading" | "idle" | "starting" | "recording" | "thinking" | "speaking";
type Metrics = { firstPhraseMs?: number; firstPlaybackMs?: number; firstReplyPlaybackMs?: number; playbackCompleteMs?: number; stopMs?: number };

const statusText: Record<Status, string> = {
  loading: "Getting ready…", idle: "Take your time. I’m here to listen.",
  starting: "Getting your microphone ready…", recording: "I’m listening. Tap Finish when you’re done.",
  thinking: "One moment. I’m thinking.", speaking: "You can stop my voice at any time.",
};

export function TalkPanel() {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [heard, setHeard] = useState("");
  const [typed, setTyped] = useState("");
  const [metrics, setMetrics] = useState<Metrics>({});
  const [debug, setDebug] = useState(false);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [volume, setVolume] = useState(80);
  const player = useRef<VoicePlayer | null>(null);
  const version = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const mic = useRef<MediaStream | null>(null);
  const micMonitor = useRef<{ disconnect: () => void } | null>(null);
  const micAnalyser = useRef<AnalyserNode | null>(null);
  const autoFinish = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationId = useRef<string | null>(null);
  const fillers = useRef<Partial<Record<"thinking" | "disclosure", ArrayBuffer>>>({});
  const introduced = useRef(false);
  const statusRef = useRef<Status>("loading");
  const stopRef = useRef<() => void>(() => {});
  const metricRef = useRef<Metrics>({});

  function updateStatus(value: Status) { statusRef.current = value; setStatus(value); }
  function addMetrics(values: Metrics) {
    metricRef.current = { ...metricRef.current, ...values };
    setMetrics({ ...metricRef.current });
  }
  function releaseMicrophone() {
    if (autoFinish.current) clearTimeout(autoFinish.current);
    autoFinish.current = null;
    mic.current?.getTracks().forEach((track) => track.stop());
    mic.current = null;
    micMonitor.current?.disconnect();
    micMonitor.current = null;
    micAnalyser.current = null;
  }
  function stop() {
    const started = performance.now();
    version.current++;
    controller.current?.abort();
    controller.current = null;
    player.current?.stop();
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    recorder.current = null;
    releaseMicrophone();
    updateStatus("idle");
    setLevel(0);
    addMetrics({ stopMs: Math.round((performance.now() - started) * 10) / 10 });
    setMessage("Stopped. You can talk again whenever you like.");
  }

  useEffect(() => {
    const abort = new AbortController();
    player.current = new VoicePlayer();
    const lifecycleVersion = version;
    const lifecyclePlayer = player.current;
    void (async () => {
      try {
        const response = await fetch("/api/voice-config", { signal: abort.signal });
        if (!response.ok) throw new Error("Configuration unavailable");
        const value = await response.json() as VoiceConfig;
        if (abort.signal.aborted) return;
        setDebug(new URLSearchParams(window.location.search).get("debug") === "1");
        setConfig(value);
        setStatus("idle");
        statusRef.current = "idle";
        if (value.ready) {
          await Promise.allSettled((["thinking", "disclosure"] as const).map(async (phrase) => {
            const audio = await fetch(`/api/filler?phrase=${phrase}`, { signal: abort.signal });
            if (audio.ok) fillers.current[phrase] = await audio.arrayBuffer();
          }));
        }
      } catch {
        if (!abort.signal.aborted) {
          setMessage("Familiar isn’t ready right now. Please try again in a moment.");
          setStatus("idle");
          statusRef.current = "idle";
        }
      }
    })();
    const onHide = () => { if (document.hidden) stopRef.current(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      abort.abort();
      lifecycleVersion.current++;
      controller.current?.abort();
      if (autoFinish.current) clearTimeout(autoFinish.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      mic.current?.getTracks().forEach((track) => track.stop());
      micMonitor.current?.disconnect();
      void lifecyclePlayer.dispose();
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  useEffect(() => { stopRef.current = stop; });

  useEffect(() => {
    if (!["recording", "speaking", "thinking"].includes(status)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    const timer = setInterval(() => {
      if (status === "recording") {
        setSeconds(Math.floor((performance.now() - started) / 1000));
        const analyser = micAnalyser.current;
        if (analyser && !reduced) {
          const samples = new Float32Array(analyser.fftSize);
          analyser.getFloatTimeDomainData(samples);
          setLevel(Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length));
        }
      } else if (!reduced) setLevel(player.current?.level() ?? 0);
    }, 100);
    return () => clearInterval(timer);
  }, [status]);

  async function sendTurn(data: FormData, currentVersion: number) {
    if (currentVersion !== version.current) return;
    const started = performance.now();
    const active = new AbortController();
    controller.current = active;
    metricRef.current = {};
    setMetrics({});
    setReply("");
    setMessage("");
    updateStatus("thinking");
    if (conversationId.current) data.set("conversationId", conversationId.current);
    const playbackStarted = (isReply: boolean) => {
      if (currentVersion !== version.current) return;
      const elapsed = Math.round(performance.now() - started);
      addMetrics({ ...(metricRef.current.firstPlaybackMs === undefined ? { firstPlaybackMs: elapsed } : {}), ...(isReply && metricRef.current.firstReplyPlaybackMs === undefined ? { firstReplyPlaybackMs: elapsed } : {}) });
      updateStatus("speaking");
    };
    const filler = !introduced.current ? fillers.current.disclosure : fillers.current.thinking;
    let playback = Promise.resolve();
    if (filler) {
      playback = player.current!.queue(filler, () => {
        introduced.current = true;
        playbackStarted(false);
      }).catch(() => {});
    }
    let streamFinished = false;
    let hadError = false;
    try {
      const response = await fetch("/api/converse", { method: "POST", body: data, signal: active.signal });
      if (!response.ok || !response.body) {
        if (response.status === 409) conversationId.current = null;
        const error = await response.json().catch(() => ({}));
        throw new Error(typeof error.message === "string" ? error.message : "I’m having trouble right now. Please try again.");
      }
      for await (const eventData of readSse(response.body)) {
        if (currentVersion !== version.current) return;
        const event = JSON.parse(eventData) as ConversationEvent;
        if (event.type === "start") conversationId.current = event.conversationId;
        if (event.type === "transcript") setHeard(event.text);
        if (event.type === "error") { setMessage(event.message); hadError = true; }
        if (event.type === "timings") addMetrics({ firstPhraseMs: event.firstPhraseMs });
        if (event.type === "sentence") {
          setReply((value) => `${value}${value ? " " : ""}${event.text}`);
          // Start synthesis immediately, but add completed audio to the queue in sentence order.
          const audio = fetch("/api/tts", { method: "POST", signal: active.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket: event.ticket }) }).then(async (result) => {
            if (!result.ok) throw new Error("Voice unavailable");
            return result.arrayBuffer();
          });
          // Attach a rejection handler immediately while the previous sentence decodes.
          void audio.catch(() => {});
          playback = playback.then(async () => {
            const bytes = await audio;
            if (currentVersion === version.current) await player.current!.queue(bytes, () => playbackStarted(true));
          }).catch(() => {
            if (currentVersion === version.current && !active.signal.aborted) {
              hadError = true;
              setMessage("I couldn’t play my voice. You can read my reply below.");
            }
          });
        }
        if (event.type === "done") streamFinished = true;
      }
      if (!streamFinished) throw new Error("The connection ended early. Please try again.");
      await playback;
      await player.current?.waitForIdle();
      if (currentVersion !== version.current) return;
      addMetrics({ playbackCompleteMs: Math.round(performance.now() - started) });
      if (process.env.NODE_ENV === "development") console.info("Familiar turn timings (ms)", { ...metricRef.current });
      if (!hadError) setMessage("");
    } catch (error) {
      if (currentVersion !== version.current || active.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : "I’m having trouble right now. Please try again.");
      active.abort();
      player.current?.stop();
    } finally {
      if (currentVersion === version.current) {
        controller.current = null;
        updateStatus("idle");
        setLevel(0);
      }
    }
  }

  async function startRecording() {
    if (!config?.ready || statusRef.current !== "idle") return;
    stop();
    const currentVersion = version.current;
    setMessage("");
    setHeard("");
    setSeconds(0);
    updateStatus("starting");
    try {
      await player.current!.unlock();
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Microphone recording needs a supported browser and a secure connection. You can type instead.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (currentVersion !== version.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      mic.current = stream;
      try {
        const monitor = player.current!.monitorMicrophone(stream);
        micMonitor.current = monitor;
        micAnalyser.current = monitor.analyser;
      } catch { /* The recorder works even without a visual waveform. */ }
      if (currentVersion !== version.current) { releaseMicrophone(); return; }
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const capture = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.current = capture;
      const chunks: Blob[] = [];
      let size = 0;
      capture.ondataavailable = (event) => {
        if (event.data.size) { chunks.push(event.data); size += event.data.size; }
        if (size > 5 * 1024 * 1024 && currentVersion === version.current) { stop(); setMessage("That recording was too long. Please try a shorter message."); }
      };
      capture.onerror = () => { if (currentVersion === version.current) { stop(); setMessage("The microphone stopped working. Please try again or type your message."); } };
      capture.onstop = () => {
        if (mic.current === stream) releaseMicrophone();
        if (currentVersion !== version.current) return;
        recorder.current = null;
        const blob = new Blob(chunks, { type: capture.mimeType || chunks[0]?.type || "audio/webm" });
        if (blob.size <= 100) { updateStatus("idle"); setMessage("I didn’t hear a recording. Please try again."); return; }
        const data = new FormData();
        data.set("audio", blob, blob.type.includes("mp4") ? "recording.m4a" : "recording.webm");
        void sendTurn(data, currentVersion);
      };
      capture.start(250);
      updateStatus("recording");
      autoFinish.current = setTimeout(() => { if (currentVersion === version.current && capture.state === "recording") capture.stop(); }, 60000);
    } catch (error) {
      if (currentVersion !== version.current) return;
      releaseMicrophone();
      updateStatus("idle");
      const denied = error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError"].includes(error.name);
      setMessage(denied ? "Your microphone is turned off. Allow microphone access in your browser, or type a message below." : error instanceof Error ? error.message : "I couldn’t open your microphone. You can type instead.");
    }
  }

  async function sendTyped(event: FormEvent) {
    event.preventDefault();
    if (!typed.trim() || !config?.ready || statusRef.current !== "idle") return;
    const text = typed.trim();
    stop();
    const currentVersion = version.current;
    setHeard(text);
    setTyped("");
    try { await player.current!.unlock(); } catch { setMessage("Sound is unavailable. You can still read the reply."); }
    if (currentVersion !== version.current) return;
    const data = new FormData();
    data.set("text", text);
    await sendTurn(data, currentVersion);
  }

  function finishRecording() {
    if (recorder.current?.state !== "recording") return;
    updateStatus("thinking");
    recorder.current.stop();
  }

  const busy = ["starting", "thinking", "speaking"].includes(status);
  return (
    <section className="talk-panel" aria-labelledby="talk-title">
      <div className="talk-voice"><MessageCircle size={26} aria-hidden="true" /><span>{STOCK_VOICE_LABEL}</span></div>
      <h1 id="talk-title">{config?.preferredName ? `Hello, ${config.preferredName}.` : "A little company."}</h1>
      <p className="talk-instruction">Tap Talk to speak. Tap Finish when you’re done.</p>
      <div className="voice-wave" aria-hidden="true">{Array.from({ length: 19 }, (_, index) => <span key={index} style={{ height: `${8 + Math.min(level * 900, 55) * (0.3 + Math.sin(index * 1.9) ** 2 * 0.7)}px` }} />)}</div>
      <p className="talk-status" role="status" aria-live="polite">{statusText[status]}{status === "recording" && <span className="recording-time"> {seconds}s / 60s</span>}</p>
      {config && !config.ready && <div className="talk-notice"><p>{config.reason === "setup" ? "Let’s set up your space first." : "Voice conversations aren’t ready yet. Please ask the person setting up Familiar for help."}</p><BigButton href="/caregiver" secondary>Go to family &amp; setup</BigButton></div>}
      <div className="talk-controls">
        <BigButton className="talk-button" disabled={!config?.ready || busy} onClick={() => status === "recording" ? finishRecording() : void startRecording()}>
          {status === "recording" ? <><Square size={30} aria-hidden="true" />Finish speaking</> : <><Mic size={34} aria-hidden="true" />Talk</>}
        </BigButton>
        <BigButton secondary className="stop-button" disabled={status === "idle" || status === "loading"} onClick={stop}><Square size={24} aria-hidden="true" />Stop</BigButton>
      </div>
      {message && <p className="talk-message" role="alert">{message}</p>}
      {reply && <div className="reply-caption"><span>Familiar’s reply</span><p>{reply}</p></div>}
      <label className="volume-control"><Volume2 size={25} aria-hidden="true" /><span>Voice volume</span><input aria-label="Voice volume" type="range" min="0" max="100" value={volume} onChange={(event) => { const value = Number(event.target.value); setVolume(value); player.current?.setVolume(value / 100); }} /></label>
      <details className="help-panel type-fallback">
        <summary>Prefer to type?</summary>
        <form onSubmit={(event) => void sendTyped(event)}><label htmlFor="typed-message">Your message</label><textarea id="typed-message" value={typed} onChange={(event) => setTyped(event.target.value)} maxLength={2000} rows={3} disabled={!config?.ready || status !== "idle"} /><BigButton type="submit" disabled={!config?.ready || status !== "idle" || !typed.trim()}><Send size={23} aria-hidden="true" />Send message</BigButton></form>
      </details>
      <p className="talk-privacy">Your recording is sent to the AI provider for a reply. Familiar doesn’t save audio. This companion does not call or notify anyone.</p>
      {debug && <details className="latency-panel" open><summary>Turn timing</summary><dl>{([ ["First sentence from server", "firstPhraseMs"], ["First audio (includes filler)", "firstPlaybackMs"], ["First reply audio", "firstReplyPlaybackMs"], ["Playback complete", "playbackCompleteMs"], ["Stop handler", "stopMs"] ] as const).map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{metrics[key] === undefined ? "—" : `${metrics[key]} ms`}</dd></div>)}</dl><p>Browser playback timing; speaker audibility and phone performance need device testing.</p>{heard && <p>Heard: {heard}</p>}</details>}
    </section>
  );
}
