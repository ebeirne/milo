"use client";

import { useActionState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { saveSetup } from "@/app/caregiver/actions";
import { initialSetupState, type SetupInput } from "@/lib/setup";
import { BigButton } from "./big-button";

export function SetupForm({ defaults, databaseAvailable }: { defaults: SetupInput; databaseAvailable: boolean }) {
  const [state, action, pending] = useActionState(saveSetup, initialSetupState);
  const fieldError = (name: keyof SetupInput) => state.errors?.[name] ? (
    <p className="field-error" id={`${name}-error`}>{state.errors[name]}</p>
  ) : null;
  return (
    <form action={action} className="setup-form">
      <fieldset disabled={pending || !databaseAvailable}>
        <legend className="sr-only">Companion and caregiver details</legend>
        <div className="form-section-heading"><span className="step-number">1</span><h3>Who is Familiar for?</h3></div>
        <p className="muted">Set it up for someone you love, or for yourself.</p>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="patientName">Their name</label>
            <input id="patientName" name="patientName" autoComplete="off" placeholder="e.g. Elizabeth" defaultValue={defaults.patientName} required maxLength={100} aria-invalid={!!state.errors?.patientName} aria-describedby={state.errors?.patientName ? "patientName-error" : undefined} />
            {fieldError("patientName")}
          </div>
          <div className="field">
            <label htmlFor="preferredName">What they like to be called</label>
            <input id="preferredName" name="preferredName" autoComplete="off" placeholder="e.g. Liz" defaultValue={defaults.preferredName} required maxLength={100} aria-invalid={!!state.errors?.preferredName} aria-describedby={state.errors?.preferredName ? "preferredName-error" : undefined} />
            {fieldError("preferredName")}
          </div>
        </div>
        <div className="form-section-heading second-section"><span className="step-number">2</span><h3>A person to stay connected</h3></div>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="caregiverName">Your name</label>
            <input id="caregiverName" name="caregiverName" autoComplete="name" defaultValue={defaults.caregiverName} required maxLength={100} aria-invalid={!!state.errors?.caregiverName} aria-describedby={state.errors?.caregiverName ? "caregiverName-error" : undefined} />
            {fieldError("caregiverName")}
          </div>
          <div className="field">
            <label htmlFor="caregiverRole">I’m setting this up for</label>
            <select id="caregiverRole" name="caregiverRole" defaultValue={defaults.caregiverRole} aria-invalid={!!state.errors?.caregiverRole} aria-describedby={state.errors?.caregiverRole ? "caregiverRole-error" : undefined}>
              <option value="family">A family member</option>
              <option value="friend">A friend</option>
              <option value="self">Myself</option>
            </select>
            {fieldError("caregiverRole")}
          </div>
        </div>
        <div className="field">
          <label htmlFor="caregiverEmail">Your email <span className="optional">(optional)</span></label>
          <input id="caregiverEmail" name="caregiverEmail" type="email" autoComplete="email" placeholder="you@example.com" defaultValue={defaults.caregiverEmail} maxLength={254} aria-invalid={!!state.errors?.caregiverEmail} aria-describedby={`email-note${state.errors?.caregiverEmail ? " caregiverEmail-error" : ""}`} />
          <p id="email-note" className="field-note">Saved as a contact detail. Email notifications are not connected yet.</p>
          {fieldError("caregiverEmail")}
        </div>
      </fieldset>
      <div aria-live="polite" aria-atomic="true">
        {state.message && <p className={`form-message ${state.status === "error" ? "form-message-error" : ""}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" && <Check size={24} aria-hidden="true" />}{state.message}</p>}
      </div>
      <div className="form-footer">
        <BigButton type="submit" disabled={pending || !databaseAvailable}>
          {pending ? "Saving…" : defaults.patientName ? "Save changes" : "Save & get started"}<ArrowRight size={24} aria-hidden="true" />
        </BigButton>
        <p>You can change these details any time.</p>
      </div>
    </form>
  );
}
