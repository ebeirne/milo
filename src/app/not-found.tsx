import { BigButton } from "@/components/big-button";
import { ScreenShell } from "@/components/screen-shell";

export default function NotFound() {
  return <ScreenShell><div className="patient-content error-content"><h1>Let’s head home.</h1><p>This page couldn’t be found.</p><BigButton href="/">Go to Familiar home</BigButton></div></ScreenShell>;
}
