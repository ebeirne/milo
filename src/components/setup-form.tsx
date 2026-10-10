"use client";

import { useActionState } from "react";
import { Check } from "lucide-react";
import { saveSetup } from "@/app/caregiver/actions";
import { initialSetupState, type SetupInput } from "@/lib/setup";
import { BigButton } from "./big-button";
import { Part } from "./console";

export function SetupForm({ defaults, databaseAvailable }: { defaults: SetupInput; databaseAvailable: boolean }) {
  const [state, action, pending] = useActionState(saveSetup, initialSetupState);
  const error = (name: keyof SetupInput) => state.errors?.[name] ? <p className="field-error" id={`${name}-error`}>{state.errors[name]}</p> : null;
  const described = (name: keyof SetupInput) => state.errors?.[name] ? `${name}-error` : undefined;
  return (
    <form action={action} className="setup-form">
      <fieldset disabled={pending || !databaseAvailable}>
        <legend className="sr-only">Companion and caregiver details</legend>
        <Part title="Who Milo is for" note="Set it up for someone you love, or for yourself.">
          <div className="form-grid">
            <div className="field"><label htmlFor="patientName">Their name</label><input id="patientName" name="patientName" autoComplete="off" placeholder="Elizabeth" defaultValue={defaults.patientName} required maxLength={100} aria-invalid={!!state.errors?.patientName} aria-describedby={described("patientName")} />{error("patientName")}</div>
            <div className="field"><label htmlFor="preferredName">What they like to be called</label><input id="preferredName" name="preferredName" autoComplete="off" placeholder="Liz" defaultValue={defaults.preferredName} required maxLength={100} aria-invalid={!!state.errors?.preferredName} aria-describedby={described("preferredName")} />{error("preferredName")}</div>
          </div>
        </Part>
        <Part title="You" note="The person family alerts are for.">
          <div className="form-grid">
            <div className="field"><label htmlFor="caregiverName">Your name</label><input id="caregiverName" name="caregiverName" autoComplete="name" defaultValue={defaults.caregiverName} required maxLength={100} aria-invalid={!!state.errors?.caregiverName} aria-describedby={described("caregiverName")} />{error("caregiverName")}</div>
            <div className="field"><label htmlFor="caregiverRole">I’m setting this up for</label><select id="caregiverRole" name="caregiverRole" defaultValue={defaults.caregiverRole} aria-invalid={!!state.errors?.caregiverRole} aria-describedby={described("caregiverRole")}><option value="family">A family member</option><option value="friend">A friend</option><option value="self">Myself</option></select>{error("caregiverRole")}</div>
          </div>
          <div className="field"><label htmlFor="caregiverEmail">Your email <span className="optional">(optional)</span></label><input id="caregiverEmail" name="caregiverEmail" type="email" autoComplete="email" placeholder="you@example.com" defaultValue={defaults.caregiverEmail} maxLength={254} aria-invalid={!!state.errors?.caregiverEmail} aria-describedby={`email-note${state.errors?.caregiverEmail ? " caregiverEmail-error" : ""}`} /><p id="email-note" className="field-note">Saved as a contact. Email alerts are not connected yet.</p>{error("caregiverEmail")}</div>
          <div className="form-footer">
            <BigButton type="submit" disabled={pending || !databaseAvailable}>{pending ? "Saving…" : defaults.patientName ? "Save changes" : "Save & get started"}</BigButton>
            <div aria-live="polite" aria-atomic="true">{state.message && <p className={`form-message ${state.status === "error" ? "form-message-error" : ""}`} role={state.status === "error" ? "alert" : "status"}>{state.status === "success" && <Check size={18} aria-hidden="true" />}{state.message}</p>}</div>
          </div>
        </Part>
      </fieldset>
    </form>
  );
}
