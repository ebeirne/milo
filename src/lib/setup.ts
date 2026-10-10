export type SetupInput = {
  patientName: string;
  preferredName: string;
  caregiverName: string;
  caregiverEmail: string;
  caregiverRole: "family" | "friend" | "self";
};

export type SetupFieldErrors = Partial<Record<keyof SetupInput, string>>;

export type SetupState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: SetupFieldErrors;
};

export const initialSetupState: SetupState = { status: "idle", message: "" };

export function validateSetup(input: SetupInput): SetupFieldErrors {
  const errors: SetupFieldErrors = {};
  if (!input.patientName.trim() || input.patientName.trim().length > 100) {
    errors.patientName = "Enter a name of up to 100 characters.";
  }
  if (!input.preferredName.trim() || input.preferredName.trim().length > 100) {
    errors.preferredName = "Enter the name you would like Milo to use.";
  }
  if (!input.caregiverName.trim() || input.caregiverName.trim().length > 100) {
    errors.caregiverName = "Enter your name, up to 100 characters.";
  }
  if (input.caregiverEmail.length > 254 || (
    input.caregiverEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.caregiverEmail)
  )) {
    errors.caregiverEmail = "Enter a valid email address or leave this blank.";
  }
  if (!["family", "friend", "self"].includes(input.caregiverRole)) {
    errors.caregiverRole = "Choose who you are setting up Milo for.";
  }
  return errors;
}
