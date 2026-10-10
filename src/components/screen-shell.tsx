import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";

// No menu bar anywhere: the site is read by scrolling, the console has its own side index,
// and the Talk screen stays as quiet as possible.
export function ScreenShell({ children, variant = "patient", footerLinks = [] }: { children: ReactNode; variant?: "site" | "patient" | "guest"; footerLinks?: { href: string; label: string }[] }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <main id="main" tabIndex={-1}>{children}</main>
      {variant === "site" && <SiteFooter links={footerLinks} />}
    </>
  );
}
