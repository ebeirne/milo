import { BigButton } from "@/components/big-button";
import { ScreenShell } from "@/components/screen-shell";

export default function NotFound() {
  return <ScreenShell variant="patient"><section className="solo" data-nav-theme="light"><div className="solo-inner"><h1>Let’s head home.</h1><p className="lede">This page couldn’t be found.</p><BigButton href="/talk">Go to Talk</BigButton></div></section></ScreenShell>;
}
