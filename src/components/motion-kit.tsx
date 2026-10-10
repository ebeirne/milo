"use client";

import Image from "next/image";
import Link from "next/link";
import { asset } from "@/lib/base-path";
import Lenis from "lenis";
import { useEffect, useRef, type ReactNode } from "react";
import { motion, MotionConfig, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";

const ease = [0.22, 1, 0.36, 1] as const;

export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

// Content arrives from a soft blur, the way augen.pro brings in each block.
export function Reveal({ children, delay = 0, className, as = "div" }: { children: ReactNode; delay?: number; className?: string; as?: "div" | "p" | "li" }) {
  const reduced = useReducedMotion();
  const Tag = motion[as];
  return (
    <Tag className={className} initial={reduced ? false : { opacity: 0, y: 26, filter: "blur(10px)" }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }} viewport={{ once: true, margin: "0px 0px -12% 0px" }} transition={{ duration: 1.1, ease, delay }}>
      {children}
    </Tag>
  );
}

function Word({ progress, range, children }: { progress: MotionValue<number>; range: [number, number]; children: string }) {
  const opacity = useTransform(progress, range, [0.5, 1]);
  const blur = useTransform(progress, range, [8, 0]);
  const filter = useTransform(blur, (value) => `blur(${value}px)`);
  return <motion.span style={{ opacity, filter, display: "inline-block", whiteSpace: "pre" }}>{children}</motion.span>;
}

// Words sharpen one after another as the line scrolls up the screen.
export function ScrollWords({ text, className, id, as = "h2" }: { text: string; className?: string; id?: string; as?: "h2" | "p" }) {
  const target = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ["start 92%", "start 45%"] });
  const words = text.split(" ");
  const Tag = as;
  if (reduced) return <Tag id={id} className={className}>{text}</Tag>;
  return (
    <Tag ref={target as never} id={id} className={className}>
      {words.map((word, index) => <Word key={`${word}-${index}`} progress={scrollYProgress} range={[index / words.length * 0.8, Math.min(1, (index + 1.6) / words.length * 0.8 + 0.2)]}>{index < words.length - 1 ? `${word} ` : word}</Word>)}
    </Tag>
  );
}

const MotionLink = motion.create(Link);

// A row whose large text brightens as it reaches the middle of the screen. Only the large text dims,
// and never below 3:1 contrast, so small labels stay fully legible.
export function Brighten({ children, className, href }: { children: ReactNode; className?: string; href?: string }) {
  const target = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ["start 95%", "start 55%"] });
  const lit = useTransform(scrollYProgress, [0, 1], [reduced ? 1 : 0.55, 1]);
  const style = { "--lit": lit } as never;
  if (href) return <MotionLink ref={target as never} href={href} className={className} style={style}>{children}</MotionLink>;
  return <motion.div ref={target as never} style={style} className={className}>{children}</motion.div>;
}

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.1, anchors: true });
    let frame = requestAnimationFrame(function loop(time) { lenis.raf(time); frame = requestAnimationFrame(loop); });
    return () => { cancelAnimationFrame(frame); lenis.destroy(); };
  }, []);
  return null;
}

// The giant two-line type. The lines drift past each other as the page scrolls, as on augen.pro.
export function GiantType({ lines, id }: { lines: [string, string]; id?: string }) {
  const target = useRef<HTMLHeadingElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ["start end", "end start"] });
  const first = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [-90, 90]);
  const second = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [90, -90]);
  return (
    <h2 ref={target} id={id} className="giant">
      <motion.span style={{ x: first }}>{lines[0]}</motion.span>{" "}
      <motion.span style={{ x: second }}>{lines[1]}</motion.span>
    </h2>
  );
}

// The two portraits, a grandfather and his granddaughter back to back. As the page scrolls on, they drift
// apart and fade into the fog.
export function HeroHeads() {
  const target = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ["start start", "end start"] });
  const apart = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, 60]);
  const left = useTransform(apart, (value) => -value);
  const rise = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, -40]);
  const opacity = useTransform(scrollYProgress, [0, 0.9], [1, reduced ? 1 : 0.35]);
  // On first load the portraits sharpen out of the fog and settle into place.
  return (
    <motion.div ref={target} className="hero-heads" aria-hidden="true" initial={reduced ? false : { opacity: 0, filter: "blur(22px)", y: 28 }} animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} transition={{ duration: 1.6, ease }}>
      <motion.div className="head head-man" style={{ x: left, y: rise, opacity }}><Image src={asset("/hero/left.webp")} alt="" width={748} height={1024} priority unoptimized /></motion.div>
      <motion.div className="head head-woman" style={{ x: apart, y: rise, opacity }}><Image src={asset("/hero/right.webp")} alt="" width={748} height={1024} priority unoptimized /></motion.div>
    </motion.div>
  );
}

// The hero's words settle in after the portraits. Only blur and position move, so the text is always at
// full contrast.
export function LoadIn({ children, delay = 0.9, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.div className={className} initial={reduced ? false : { filter: "blur(10px)", y: 16 }} animate={{ filter: "blur(0px)", y: 0 }} transition={{ duration: 1.1, ease, delay }}>{children}</motion.div>;
}

// The blue band opens from a thin line into the full section as it scrolls in.
export function GrowBand({ children, className, labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  const target = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ["start end", "start 35%"] });
  const inset = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [47, 0]);
  const clipPath = useTransform(inset, (value) => `inset(${value}% 0 ${value}% 0)`);
  // It keeps its own blue (no data-bg), so it opens out of the dark section above it.
  return <motion.section ref={target as never} className={className} aria-labelledby={labelledBy} style={{ clipPath }}>{children}</motion.section>;
}

const BACKGROUNDS: Record<string, string> = { white: "#ffffff", grey: "#efefef", off: "#f2f2f4", dark: "#1d1e20", ink: "#0f1012", black: "#000000" };
const DARK = new Set(["dark", "ink", "black"]);

// As on augen.pro, the page colour fades from one section's colour to the next instead of cutting at an
// edge. The text colour fades with it, so a section still on screen never ends up with light text on a
// light page. Sections keep their own colours until the first scroll, and with reduced motion nothing changes.
export function BackgroundEase() {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const middle = window.innerHeight * 0.55;
      const section = [...document.querySelectorAll<HTMLElement>("[data-bg]")].find((element) => { const box = element.getBoundingClientRect(); return box.top <= middle && box.bottom > middle; });
      if (!section || !layer.current) return;
      const tone = section.dataset.bg ?? "white";
      layer.current.style.backgroundColor = BACKGROUNDS[tone];
      root.dataset.tone = DARK.has(tone) ? "dark" : "light";
    };
    const onScroll = () => { root.dataset.ease = "on"; if (!frame) frame = requestAnimationFrame(update); };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); delete root.dataset.ease; delete root.dataset.tone; };
  }, []);
  return <div ref={layer} className="page-bg" aria-hidden="true" />;
}
