import Link from "next/link";
import { ArrowLeft, Heart, Settings2 } from "lucide-react";
import type { ReactNode } from "react";

export function ScreenShell({ children, caregiver = false }: { children: ReactNode; caregiver?: boolean }) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <Link href="/" className="brand" aria-label="Familiar home">
          <span className="brand-mark"><Heart size={27} strokeWidth={1.8} aria-hidden="true" /></span>
          <span>familiar<span className="brand-dot">.</span></span>
        </Link>
        <nav aria-label="Main navigation">
          {caregiver ? (
            <Link href="/" className="nav-link"><ArrowLeft size={22} aria-hidden="true" /> Companion home</Link>
          ) : (
            <Link href="/caregiver" className="nav-link"><Settings2 size={22} aria-hidden="true" /> Family &amp; setup</Link>
          )}
        </nav>
      </header>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <span>A little closer, even when you’re apart.</span>
        <span>Made for moments of connection.</span>
      </footer>
    </div>
  );
}
