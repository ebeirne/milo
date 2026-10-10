import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "familiar_access";
export function publicAccessRequired(request: Request): boolean {
  const isLocal = (host: string) => ["localhost", "127.0.0.1", "[::1]"].includes(host);
  try {
    if (process.env.PUBLIC_APP_URL && !isLocal(new URL(process.env.PUBLIC_APP_URL).hostname)) return true;
    const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() ?? request.headers.get("host");
    return !isLocal(host ? new URL(`http://${host}`).hostname : new URL(request.url).hostname);
  } catch { return true; }
}

export function correctAccessCode(code: string): boolean {
  const expected = process.env.CAREGIVER_ACCESS_CODE?.trim() ?? "";
  if (expected.length < 16 || code.length > 200) return false;
  return timingSafeEqual(createHash("sha256").update(expected).digest(), createHash("sha256").update(code).digest());
}

export function newAccessSession(): string {
  const value = `${Date.now() + 12 * 60 * 60 * 1000}.${randomBytes(16).toString("hex")}`;
  return `${value}.${createHmac("sha256", process.env.CAREGIVER_ACCESS_CODE!.trim()).update(value).digest("hex")}`;
}

export function caregiverAuthorized(request: Request): boolean {
  if (!publicAccessRequired(request)) return true;
  const key = process.env.CAREGIVER_ACCESS_CODE?.trim() ?? "";
  if (key.length < 16) return false;
  const cookie = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ACCESS_COOKIE}=`))?.slice(ACCESS_COOKIE.length + 1);
  if (!cookie || cookie.length > 200) return false;
  const [expires, nonce, signature, extra] = cookie.split(".");
  if (extra || !/^\d+$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce ?? "") || !/^[a-f0-9]{64}$/.test(signature ?? "") || Number(expires) <= Date.now()) return false;
  const expected = createHmac("sha256", key).update(`${expires}.${nonce}`).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected);
}
