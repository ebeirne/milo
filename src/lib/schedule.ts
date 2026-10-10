export type ScheduleKind = "reminder" | "checkin";
export type ScheduleItem = { id: string; kind: ScheduleKind; text: string; time: string; days: number[]; voiceId: string | null; voiceName: string | null };
export type DayEvent = { id: string; kind: ScheduleKind; text: string; status: "pending" | "done" | "missed"; created_at: string };
// The patient's device supplies its own local date and time, so schedules follow the clock the person sees.
export type LocalNow = { date: string; minutes: number; day: number };

export const MAX_REMINDERS = 12;
export const MAX_CHECKINS = 6;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const CHECKIN_STYLES = {
  gentle: "I'm just checking in. How are you feeling today?",
  cheerful: "I was thinking of you. What have you been up to today?",
} as const;
export type CheckinStyle = keyof typeof CHECKIN_STYLES;
export const isCheckinStyle = (value: unknown): value is CheckinStyle => typeof value === "string" && Object.hasOwn(CHECKIN_STYLES, value);
export const isScheduleKind = (value: unknown): value is ScheduleKind => value === "reminder" || value === "checkin";

export const parseTime = (value: unknown): string | null => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
export function parseDays(value: unknown): number[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 7) return null;
  if (!value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) || new Set(value).size !== value.length) return null;
  return [...value].sort();
}
const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function parseLocalNow(params: URLSearchParams): LocalNow | null {
  const date = params.get("date") ?? "", time = parseTime(params.get("time")), day = Number(params.get("day") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || !time || !Number.isInteger(day) || day < 0 || day > 6) return null;
  return { date, minutes: minutesOf(time), day };
}

// Due from its time until an hour later, so opening the app a little late still delivers it once.
export function isDue(item: { time: string; days: number[] }, now: LocalNow, windowMinutes = 60): boolean {
  const late = now.minutes - minutesOf(item.time);
  return item.days.includes(now.day) && late >= 0 && late <= windowMinutes;
}

// Every scheduled message opens by saying whose AI voice it is.
export function spokenLines(kind: ScheduleKind, text: string, preferredName: string, voiceName: string | null): string[] {
  const body = /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
  return [
    `Hello ${preferredName}. This is ${voiceName ? `the AI voice of ${voiceName}` : "Familiar"}.`,
    kind === "reminder" ? `Here is a reminder. ${body}` : body,
  ];
}
