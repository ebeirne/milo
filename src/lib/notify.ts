import "server-only";
import type { Safety } from "./safety";

// Caregiver notification interface. This demo delivers through the family dashboard (the stored flag) and a
// server log line; email or SMS would be added here. The notice carries a category, never the person's words.
export function notifyCaregiver(safety: Safety): void {
  if (safety.tier === "concern") return;
  console.info(`Familiar caregiver notice: ${safety.tier} (${safety.reason}). It is shown on the family dashboard.`);
}
