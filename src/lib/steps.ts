// The family's setup workflow, in order. The console's side index lists these, and each page ends by
// pointing at the next one.
export const STEPS = [
  { index: "01", label: "About them", href: "/caregiver" },
  { index: "02", label: "Voices", href: "/caregiver/voices" },
  { index: "03", label: "Topics & memory", href: "/caregiver/guidance" },
  { index: "04", label: "Reminders", href: "/caregiver/reminders" },
  { index: "05", label: "Their day", href: "/caregiver/today" },
] as const;
