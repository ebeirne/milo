"use client";

import { BigButton } from "@/components/big-button";
import { ScreenShell } from "@/components/screen-shell";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <ScreenShell><div className="patient-content error-content"><h1>Let’s try that again.</h1><p>Familiar is having trouble loading this page.</p><BigButton onClick={reset}>Try again</BigButton></div></ScreenShell>;
}
