import { ShieldCheck } from "lucide-react";

export function Banner() {
  return (
    <aside className="disclosure" aria-label="About AI voices">
      <ShieldCheck size={26} strokeWidth={1.7} aria-hidden="true" />
      <p>Familiar is an AI companion. Family voices are recreations, made only with their permission.</p>
    </aside>
  );
}
