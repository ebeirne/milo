"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, RotateCcw } from "lucide-react";
import { BigButton } from "./big-button";

export type Recording = { blob: Blob; duration: number };
export function AudioRecorder({ label, minSeconds, maxSeconds, onRecording, disabled = false }: { label: string; minSeconds: number; maxSeconds: number; onRecording: (value: Recording | null) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "starting" | "recording" | "ready">("idle");
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [message, setMessage] = useState("");
  const [url, setUrl] = useState("");
  const version = useRef(0);
  const capture = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const clock = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioUrl = useRef("");

  function cleanup() {
    if (clock.current) clearInterval(clock.current);
    clock.current = null;
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    void context.current?.close().catch(() => {}); context.current = null;
  }
  useEffect(() => {
    const lifecycle = version;
    const onHide = () => { if (document.hidden && capture.current?.state === "recording") capture.current.stop(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      lifecycle.current++;
      if (clock.current) clearInterval(clock.current);
      if (capture.current?.state === "recording") capture.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      void context.current?.close().catch(() => {});
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  async function start() {
    if (disabled || state === "starting" || state === "recording") return;
    const current = ++version.current;
    onRecording(null); setMessage(""); setSeconds(0); setState("starting");
    if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
    audioUrl.current = ""; setUrl("");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Recording needs a supported browser over HTTPS, or localhost. Please try Chrome or Safari.");
      try { context.current = new AudioContext(); void context.current.resume().catch(() => {}); } catch { /* Recording can work without level feedback. */ }
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (current !== version.current) { microphone.getTracks().forEach((track) => track.stop()); return; }
      if (document.hidden) { microphone.getTracks().forEach((track) => track.stop()); cleanup(); setState("idle"); setMessage("Return to this page and start recording when you’re ready."); return; }
      stream.current = microphone;
      const analyser = context.current?.createAnalyser();
      if (analyser) { analyser.fftSize = 256; context.current!.createMediaStreamSource(microphone).connect(analyser); }
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(microphone, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
      capture.current = recorder;
      const chunks: Blob[] = [];
      let size = 0;
      const started = performance.now();
      recorder.ondataavailable = (event) => { if (event.data.size) { chunks.push(event.data); size += event.data.size; } if (size > 20 * 1024 * 1024 && recorder.state === "recording") recorder.stop(); };
      recorder.onerror = () => { version.current++; cleanup(); setState("idle"); setMessage("The microphone stopped working. Please record again."); };
      recorder.onstop = () => {
        if (current !== version.current) return;
        cleanup(); capture.current = null;
        const duration = (performance.now() - started) / 1000;
        const blob = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type || "audio/webm" });
        setLevel(0);
        if (duration < minSeconds || blob.size < 1024 || blob.size > 20 * 1024 * 1024) { setState("idle"); setMessage(`Please record at least ${minSeconds} seconds, within the size limit.`); return; }
        audioUrl.current = URL.createObjectURL(blob); setUrl(audioUrl.current);
        setState("ready"); onRecording({ blob, duration });
      };
      recorder.start(250); setState("recording");
      clock.current = setInterval(() => {
        const elapsed = (performance.now() - started) / 1000;
        setSeconds(Math.floor(elapsed));
        if (analyser) {
          const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
          setLevel(Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length));
        }
        if (elapsed >= maxSeconds && recorder.state === "recording") recorder.stop();
      }, 200);
    } catch (error) {
      if (current !== version.current) return;
      cleanup(); setState("idle");
      setMessage(error instanceof DOMException && error.name === "NotAllowedError" ? "Allow microphone access in your browser, then try again." : error instanceof Error ? error.message : "The microphone could not be opened.");
    }
  }

  return <div className="recording-box">
    <div className="recording-heading"><strong>{label}</strong><span>{minSeconds}–{maxSeconds} seconds</span></div>
    {state === "recording" && <><meter aria-label="Microphone level" min={0} max={0.2} value={level} /><p role="status">{seconds} seconds · {level < 0.008 ? "Speak clearly and move closer if needed." : level > 0.3 ? "Move a little farther from the microphone." : "Your microphone is picking up sound."}</p></>}
    {state === "recording" ? <BigButton secondary onClick={() => { if (capture.current?.state === "recording") capture.current.stop(); }}><Square size={23} aria-hidden="true" />Finish recording</BigButton> : <BigButton secondary disabled={disabled || state === "starting"} onClick={() => void start()}>{state === "ready" ? <RotateCcw size={23} aria-hidden="true" /> : <Mic size={23} aria-hidden="true" />}{state === "starting" ? "Opening microphone…" : state === "ready" ? "Record again" : "Start recording"}</BigButton>}
    {url && <><p>Recording ready. Listen to check that it is clear.</p><audio controls src={url} aria-label={`${label} playback`} /></>}
    {message && <p role="alert" className="field-error">{message}</p>}
  </div>;
}
