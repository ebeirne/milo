"use server";

import { revalidatePath } from "next/cache";
import { saveHousehold } from "@/lib/db/repository";
import { validateSetup, type SetupInput, type SetupState } from "@/lib/setup";

export async function saveSetup(_previousState: SetupState, formData: FormData): Promise<SetupState> {
  const text = (field: string) => {
    const value = formData.get(field);
    return typeof value === "string" ? value.trim() : "";
  };
  const input: SetupInput = {
    patientName: text("patientName"),
    preferredName: text("preferredName"),
    caregiverName: text("caregiverName"),
    caregiverEmail: text("caregiverEmail"),
    caregiverRole: text("caregiverRole") as SetupInput["caregiverRole"],
  };
  const errors = validateSetup(input);
  if (Object.keys(errors).length) {
    return { status: "error", message: "Please check the highlighted details.", errors };
  }
  try {
    await saveHousehold(input);
  } catch {
    return { status: "error", message: "We couldn’t save your details. Please check the database connection and try again." };
  }
  revalidatePath("/");
  revalidatePath("/caregiver");
  revalidatePath("/talk");
  return { status: "success", message: "Your details are saved." };
}
