import Link from "next/link";
import type { ReactNode } from "react";
import { MiloMark, PillArrow } from "./milo-mark";
import { STEPS } from "@/lib/steps";

type Step = (typeof STEPS)[number]["index"];

// The family console, laid out like augen's inner pages: a quiet index on the left that stays put
// while the page scrolls, and the page itself on the right.
export function ConsoleShell({ step, children }: { step: Step; children: ReactNode }) {
  return (
    <div className="console">
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="console-index" aria-label="Family setup">
        <Link href="/" className="wordmark" aria-label="Milo home">milo</Link>
        <p className="console-index-label"><span>Family space</span><span>{STEPS.find((item) => item.index === step)?.label}</span></p>
        <ol>
          {STEPS.map((item) => (
            <li key={item.index}><Link href={item.href} aria-current={item.index === step ? "page" : undefined}><span className="dot" aria-hidden="true" />{item.index} {item.label}</Link></li>
          ))}
        </ol>
        <Link href="/talk" className="arrow-link console-talk"><PillArrow />Open Talk</Link>
      </nav>
      <main id="main" className="console-main" tabIndex={-1}>{children}</main>
    </div>
  );
}

export function Intro({ kicker, title, titleId, sub, meta, children }: { kicker: string; title: ReactNode; titleId?: string; sub?: ReactNode; meta?: ReactNode; children?: ReactNode }) {
  return (
    <header className="intro">
      <p className="intro-kicker">{kicker}</p>
      <h1 id={titleId}><MiloMark />{title}</h1>
      {sub && <p className="intro-sub">{sub}</p>}
      {children}
      {meta && <div className="intro-meta">{meta}</div>}
    </header>
  );
}

export function Part({ title, note, id, children }: { title: string; note?: ReactNode; id?: string; children: ReactNode }) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className="part" id={id} aria-labelledby={headingId}>
      <div className="part-head"><h2 id={headingId}>{title}</h2>{note && <p>{note}</p>}</div>
      <div className="part-body">{children}</div>
    </section>
  );
}

export function Tags({ items }: { items: (string | { text: string; tone: "on" | "warn" | "alert" })[] }) {
  return <span className="tags">{items.map((item) => typeof item === "string" ? <span className="tag" key={item}>{item}</span> : <span className={`tag ${item.tone}`} key={item.text}>{item.text}</span>)}</span>;
}

export function NextLink({ after }: { after: Step }) {
  const next = STEPS[STEPS.findIndex((item) => item.index === after) + 1];
  const target = next ?? { index: "→", label: "Open Talk", href: "/talk" };
  return <Link className="next-link" href={target.href}><span className="label"><span>Next · {target.index}</span><span>{target.label}</span></span><PillArrow /></Link>;
}

export function ArrowLink({ href, children, down = false }: { href: string; children: ReactNode; down?: boolean }) {
  return <Link href={href} className="arrow-link"><PillArrow down={down} />{children}</Link>;
}

export const serial = (prefix: string, index: number) => `${prefix}${String(index + 1).padStart(2, "0")}`;
