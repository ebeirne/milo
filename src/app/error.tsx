"use client";

import { BigButton } from "@/components/big-button";
import { ScreenShell } from "@/components/screen-shell";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <ScreenShell variant="patient"><section className="solo" data-nav-theme="light"><div className="solo-inner"><h1>Let’s try that again.</h1><p className="lede">Milo is having trouble loading this page.</p><BigButton onClick={reset}>Try again</BigButton></div></section></ScreenShell>;
}
