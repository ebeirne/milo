import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Shared = { children: ReactNode; className?: string; secondary?: boolean };
type Props = Shared & (
  | { href: string; ariaLabel?: string }
  | (ButtonHTMLAttributes<HTMLButtonElement> & { href?: never })
);

export function BigButton(props: Props) {
  const className = `big-button ${props.secondary ? "big-button-secondary" : ""} ${props.className ?? ""}`;
  if (typeof props.href === "string") {
    return <Link href={props.href} className={className} aria-label={props.ariaLabel}>{props.children}</Link>;
  }
  const { children, secondary: _secondary, className: _className, ...buttonProps } = props;
  // Styling-only props must not be passed to the native button.
  void _secondary;
  void _className;
  return <button {...buttonProps} type={buttonProps.type ?? "button"} className={className}>{children}</button>;
}
