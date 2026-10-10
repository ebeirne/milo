// Milo's mark: a voice point with sound moving out on both sides. Thin lines, like the rest of the type.
export function MiloMark({ className = "mark" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" aria-hidden="true">
      <circle cx="16" cy="16" r="1.7" fill="currentColor" stroke="none" />
      <path d="M11.6 11.2a7 7 0 0 0 0 9.6" />
      <path d="M20.4 11.2a7 7 0 0 1 0 9.6" />
      <path d="M7.4 7.2a12.6 12.6 0 0 0 0 17.6" />
      <path d="M24.6 7.2a12.6 12.6 0 0 1 0 17.6" />
    </svg>
  );
}

export function PillArrow({ down = false }: { down?: boolean }) {
  return (
    <span className={`pill-arrow${down ? " down" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        {down ? <path d="M5 1.5v7M2.5 6 5 8.5 7.5 6" /> : <path d="M1.5 5h7M6 2.5 8.5 5 6 7.5" />}
      </svg>
    </span>
  );
}
