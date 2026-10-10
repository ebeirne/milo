"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { asset } from "@/lib/base-path";

export type Sample = { audio: string; text: string; duration: number; words: { text: string; start: number; end: number }[] };

const clock = (seconds: number) => `0:${String(Math.floor(seconds)).padStart(2, "0")}`;

// The voice sample. Each word lights up as it is spoken, using ElevenLabs' own timings.
export function Listen({ sample }: { sample: Sample }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const bar = useRef<HTMLElement>(null);
  // -1 means not started, so no word is lit before the first play.
  const [time, setTime] = useState(-1);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const element = new Audio(asset(sample.audio));
    element.preload = "auto";
    audio.current = element;
    let frame = 0;
    const tick = () => {
      setTime(element.currentTime);
      if (bar.current) bar.current.style.width = `${Math.min(100, (element.currentTime / sample.duration) * 100)}%`;
      if (!element.paused) frame = requestAnimationFrame(tick);
    };
    const onPlay = () => { setPlaying(true); frame = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(frame); tick(); };
    const onEnd = () => { setPlaying(false); cancelAnimationFrame(frame); setTime(sample.duration + 1); if (bar.current) bar.current.style.width = "100%"; };
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("ended", onEnd);
    return () => { element.pause(); cancelAnimationFrame(frame); element.removeEventListener("play", onPlay); element.removeEventListener("pause", onPause); element.removeEventListener("ended", onEnd); };
  }, [sample.audio, sample.duration]);

  function toggle() {
    const element = audio.current;
    if (!element) return;
    if (element.paused) {
      if (element.ended || element.currentTime >= sample.duration) element.currentTime = 0;
      void element.play().catch(() => setPlaying(false));
    } else element.pause();
  }

  return (
    <>
      <p className="listen-line">
        <span className="sr-only">{sample.text}</span>
        {sample.words.map((word, index) => <span key={index} aria-hidden="true" className={time >= word.end ? "said" : time >= word.start ? "now" : undefined}>{word.text}{index < sample.words.length - 1 ? " " : ""}</span>)}
      </p>
      <div className="listen-bar" aria-hidden="true"><i ref={bar} /></div>
      <div className="listen-controls">
        <button type="button" className="play" onClick={toggle}>
          <span className="play-icon" aria-hidden="true">{playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" />}</span>{playing ? "Pause" : "Play sample"}
        </button>
        <span className="listen-time" aria-hidden="true">{clock(Math.max(0, Math.min(time, sample.duration)))} / {clock(sample.duration)}</span>
      </div>
    </>
  );
}
