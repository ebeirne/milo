import { ShieldCheck } from "lucide-react";

export function Banner() {
  return (
    <aside className="disclosure" aria-label="About AI voices">
      <ShieldCheck size={20} strokeWidth={1.4} aria-hidden="true" />
      <p>Milo is an AI companion. Family voices are recreations, made only with their permission.</p>
    </aside>
  );
}
