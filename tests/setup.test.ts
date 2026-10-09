import assert from "node:assert/strict";
import { test } from "node:test";
import { validateSetup, type SetupInput } from "../src/lib/setup";
const valid: SetupInput = {
  patientName: "Elizabeth", preferredName: "Liz", caregiverName: "Sarah",
  caregiverEmail: "", caregiverRole: "family",
};
test("self-setup and an optional email are supported", () => {
  assert.deepEqual(validateSetup({ ...valid, caregiverRole: "self" }), {});
});
test("missing names, invalid email, and unrecognized role are rejected", () => {
  const errors = validateSetup({
    ...valid, patientName: " ", preferredName: "", caregiverName: "A".repeat(101),
    caregiverEmail: "not-an-email", caregiverRole: "stranger" as SetupInput["caregiverRole"],
  });
  assert.deepEqual(Object.keys(errors).sort(), [
    "caregiverEmail", "caregiverName", "caregiverRole", "patientName", "preferredName",
  ]);
});
