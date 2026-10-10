"use client";

import { useEffect, useRef } from "react";

export type OrbMode = "idle" | "listening" | "thinking" | "speaking";

// A dark, softly lit voice form that fades into fog, in the place augen.pro gives its portrait.
// `level` is the live microphone or playback loudness (RMS), so the shape moves with real sound.
export function VoiceOrb({ level = 0, mode = "idle" }: { level?: number; mode?: OrbMode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ level, mode });
  useEffect(() => { live.current = { level, mode }; }, [level, mode]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext("2d");
    if (!element || !context) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let smooth = 0;
    let glow = 0;
    let width = 0;
    let height = 0;
    let visible = true;
    const noise = document.createElement("canvas");
    noise.width = noise.height = 160;
    const noiseContext = noise.getContext("2d");
    if (noiseContext) {
      const pixels = noiseContext.createImageData(160, 160);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const value = Math.random() * 255;
        pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = value;
        pixels.data[index + 3] = 22;
      }
      noiseContext.putImageData(pixels, 0, 0);
    }
    const grain = context.createPattern(noise, "repeat");
    const resize = () => {
      const box = element.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = box.width; height = box.height;
      element.width = Math.round(width * ratio); element.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const draw = (now: number) => {
      const t = reduced ? 0 : now / 1000;
      const { level: target, mode: current } = live.current;
      smooth += (Math.min(target * 6, 1) - smooth) * 0.18;
      glow += ((current === "listening" ? 1 : current === "speaking" ? 0.7 : current === "thinking" ? 0.35 : 0) - glow) * 0.06;
      context.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height * 0.47;
      const radius = Math.min(width, height) * 0.3 * (1 + smooth * 0.07);
      const wobble = 0.014 + smooth * 0.07 + (current === "thinking" ? 0.012 : 0);
      const spin = current === "thinking" ? t * 0.9 : t * 0.25;
      const points = 120;
      context.beginPath();
      for (let index = 0; index <= points; index++) {
        const angle = (index / points) * Math.PI * 2;
        const offset = Math.sin(angle * 3 + t * 0.9) * 0.5 + Math.sin(angle * 5 - t * 1.4) * 0.3 + Math.sin(angle * 2 + t * 0.55) * 0.2;
        const r = radius * (1 + wobble * offset);
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      }
      context.closePath();
      // A soft shadow halo first, so the edge reads like a photographed object rather than a cut-out.
      context.save();
      context.filter = `blur(${Math.round(radius * 0.08)}px)`;
      context.fillStyle = "rgba(15, 16, 18, .22)";
      context.fill();
      context.restore();
      const light = context.createRadialGradient(cx - radius * 0.36 + Math.cos(spin) * radius * 0.08, cy - radius * 0.42 + Math.sin(spin) * radius * 0.06, radius * 0.02, cx - radius * 0.1, cy - radius * 0.08, radius * 1.12);
      light.addColorStop(0, "#b3b8c0");
      light.addColorStop(0.1, "#767a82");
      light.addColorStop(0.36, "#34363c");
      light.addColorStop(0.7, "#17181b");
      light.addColorStop(1, "#0c0d0f");
      context.fillStyle = light;
      context.fill();
      context.save();
      context.clip();
      // Light bouncing up from the fog below gives the lower half its volume.
      const bounce = context.createRadialGradient(cx, cy + radius * 1.05, 0, cx, cy + radius * 1.05, radius * 1.1);
      bounce.addColorStop(0, "rgba(255, 255, 255, .26)");
      bounce.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = bounce;
      context.fillRect(0, 0, width, height);
      // A cool blue light rises inside while Milo listens or speaks.
      if (glow > 0.01) {
        const inner = context.createRadialGradient(cx + radius * 0.25, cy + radius * 0.45, 0, cx + radius * 0.25, cy + radius * 0.45, radius * 1.1);
        inner.addColorStop(0, `rgba(0, 113, 227, ${0.55 * glow * (0.6 + smooth * 0.6)})`);
        inner.addColorStop(1, "rgba(0, 113, 227, 0)");
        context.fillStyle = inner;
        context.fillRect(0, 0, width, height);
      }
      const rim = context.createLinearGradient(cx + radius, cy - radius, cx - radius * 0.2, cy + radius * 0.2);
      rim.addColorStop(0, "rgba(255, 255, 255, .16)");
      rim.addColorStop(0.35, "rgba(255, 255, 255, 0)");
      context.fillStyle = rim;
      context.fillRect(0, 0, width, height);
      // Fine film grain so the surface reads as photographed rather than flat vector.
      if (grain) {
        context.globalAlpha = 0.5;
        context.fillStyle = grain;
        context.fillRect(0, 0, width, height);
        context.globalAlpha = 1;
      }
      context.restore();
      frame = visible ? requestAnimationFrame(draw) : 0;
    };
    // Drawing pauses while the orb is scrolled out of view.
    const sight = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(draw);
    });
    sight.observe(element);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); sight.disconnect(); };
  }, []);

  return <div className="orb" aria-hidden="true"><canvas ref={canvas} /><div className="orb-fog" /><div className="orb-mist" /></div>;
}
