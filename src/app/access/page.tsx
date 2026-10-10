"use client";
import { useState, type FormEvent } from "react";
import { BigButton } from "@/components/big-button";
import { useRouter } from "next/navigation";

export default function AccessPage() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const data = new FormData(event.currentTarget);
      const response = await fetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: data.get("code") }) });
      if (!response.ok) throw new Error("The code was not accepted. Ask the person setting up Familiar for help.");
      router.replace("/"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setBusy(false); }
  }
  return <main className="patient-content error-content"><h1>Welcome to Familiar.</h1><p>Enter the access code from the person who set up this space.</p><form className="setup-card card" onSubmit={(event) => void unlock(event)}><div className="field"><label htmlFor="code">Access code</label><input id="code" name="code" type="password" autoComplete="current-password" required maxLength={200} /></div><BigButton type="submit" disabled={busy}>{busy ? "Opening…" : "Open Familiar"}</BigButton></form>{message && <p role="alert">{message}</p>}</main>;
}
