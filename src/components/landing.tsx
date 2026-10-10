import { ScreenShell } from "./screen-shell";
import { Listen, type Sample } from "./listen";
import { PillArrow } from "./milo-mark";
import { BackgroundEase, Brighten, GiantType, GrowBand, HeroHeads, LoadIn, Reveal, ScrollWords, SmoothScroll } from "./motion-kit";

// The three parts of Milo, named the way augen names its products. Jev chose these names and every line
// on this page from short candidates (scripts/jev-copy.ts), and what to cut (scripts/jev-site.ts).
const PRODUCTS = [
  { id: "talk", code: "T", name: "Talk", line: "One tap to talk. Short, warm replies." },
  { id: "voices", code: "V", name: "Voices", line: "Their family’s voices, with consent" },
  { id: "day", code: "D", name: "Day", line: "Family sees how the day went, not every word" },
];
const PROMISES = ["Always labeled as AI", "Consent before any voice", "No invented memories"];

export type Action = { href: string; label: string; down?: boolean };

// The Milo website. It has no menu: it is read top to bottom, and the only way on is the band at the end.
// The app serves it with links into setup and Talk; the static GitHub Pages copy links to the code instead.
export function Landing({ sample, title, action, footerLinks }: { sample: Sample; title: string; action: Action; footerLinks: Action[] }) {
  return (
    <ScreenShell variant="site" footerLinks={footerLinks}>
      <SmoothScroll />
      <BackgroundEase />

      <section className="hero" data-bg="white" aria-labelledby="hero-title">
        <HeroHeads />
        <LoadIn className="hero-copy">
          <span className="wordmark">milo</span>
          <h1 id="hero-title">A familiar voice, whenever they need one.</h1>
          <p className="chips"><span className="chips-label">Explore</span>
            {PRODUCTS.map((product) => <a key={product.id} className="chip" href={`#${product.id}`}><span aria-hidden="true">{product.code}<sup>1</sup></span> {product.name}</a>)}
          </p>
        </LoadIn>
        <a className="scroll-cue" href="#overview" aria-label="Scroll down">↓</a>
      </section>

      <section id="overview" className="sec sec-grey overview grid5" data-bg="grey" aria-labelledby="overview-title">
        <p className="label col-label"><span>Overview</span><span lang="el">μιλώ · I speak</span></p>
        <div className="col-main">
          <Reveal><h2 id="overview-title" className="statement">Milo is a voice companion for people with mild memory loss. It can speak in family voices, <em>always with permission.</em></h2></Reveal>
          <Reveal delay={0.15}><a className="arrow-link" href="#listen"><PillArrow down />Hear a sample</a></Reveal>
        </div>
      </section>

      <section className="sec sec-dark rows" data-bg="dark" aria-label="Milo's three parts">
        {PRODUCTS.map((product, index) => (
          <Brighten key={product.id} className="row"><p className="label" id={product.id}><span>0{index + 1}</span><span>{product.code}<sup>1</sup> {product.name}</span></p><p className="row-body">{product.line}</p></Brighten>
        ))}
      </section>

      <section className="sec sec-off meet" data-bg="off" aria-labelledby="giant-title">
        <GiantType id="giant-title" lines={["Warm", "Voices"]} />
      </section>

      <section id="listen" className="sec sec-white listen" data-bg="white" aria-labelledby="listen-title">
        <h2 id="listen-title" className="listen-head">Hear a sample</h2>
        <Listen sample={sample} />
        <p className="listen-note">A stock voice standing in for a family voice.</p>
      </section>

      <section className="sec sec-ink facts" data-bg="ink" aria-labelledby="made-title">
        <div className="grid5">
          <p className="label col-label"><span id="made-title">Made for</span></p>
          <Reveal className="col-main"><p className="facts-lead">People with mild dementia who spend time alone</p></Reveal>
        </div>
        <div className="grid5 terms">
          <p className="label col-label"><span>Promise</span><span>How Milo talks</span></p>
          <ul className="facts-grid promises">{PROMISES.map((promise, index) => <Reveal as="li" key={promise} className="fact" delay={index * 0.08}><p>{promise}</p></Reveal>)}</ul>
        </div>
      </section>

      <section className="sec sec-black story" data-bg="black" aria-labelledby="rhythm-title">
        <div className="grid5 story-inner">
          <p className="story-kicker">How it works</p>
          <div className="story-title"><ScrollWords id="rhythm-title" text="The daily rhythm" /></div>
          <Reveal className="story-text"><h3>Reminders and check-ins</h3><p>Set a reminder once. Milo says it at the right time, in the voice you choose, while Talk is open.</p></Reveal>
          <p className="story-note">Nothing plays when the app is closed.</p>
          <div className="story-rule" />
        </div>
      </section>

      <section className="sec sec-black story" data-bg="black" aria-labelledby="safety-title">
        <div className="grid5 story-inner">
          <p className="story-kicker">Safety</p>
          <div className="story-title"><ScrollWords id="safety-title" text="Help, one tap away" /></div>
          <Reveal className="story-text"><h3>Kind words first</h3><p>Milo listens for a fall, pain or confusion, and asks if they need help.</p></Reveal>
          <p className="story-note">It never calls anyone by itself.</p>
        </div>
      </section>

      <GrowBand className="sec sec-blue band" labelledBy="start-title">
        <div className="band-grid"><div className="band-inner">
          <div className="band-body">
            <h2 id="start-title">{title}</h2>
            <a className="arrow-link" href={action.href}><PillArrow down={action.down} />{action.label}</a>
          </div>
        </div></div>
      </GrowBand>
    </ScreenShell>
  );
}
