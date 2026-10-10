import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const state = globalThis as unknown as { familiarTtsSecret?: Buffer };
const secret = state.familiarTtsSecret ??= randomBytes(32);

export function speechTicket(text: string, previousText: string, voiceId: string | null = null): string {
  const payload = Buffer.from(JSON.stringify({ text, previousText, ...(voiceId ? { voiceId } : {}), expires: Date.now() + 120000 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function readSpeechTicket(ticket: string): { text: string; previousText: string; voiceId: string | null } | null {
  try {
    if (ticket.length > 6000) return null;
    const [payload, signature, extra] = ticket.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", secret).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof value.text !== "string" || value.text.length > 500 || typeof value.previousText !== "string" || value.previousText.length > 1000 || !Number.isFinite(value.expires) || value.expires < Date.now()) return null;
    if (value.voiceId !== undefined && (typeof value.voiceId !== "string" || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value.voiceId))) return null;
    return { text: value.text, previousText: value.previousText, voiceId: value.voiceId ?? null };
  } catch { return null; }
}
