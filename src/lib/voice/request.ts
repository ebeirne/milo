import "server-only";

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0].trim() ?? new URL(request.url).host;
    return ["http:", "https:"].includes(originUrl.protocol) && originUrl.host === host;
  } catch { return false; }
}

export async function boundedBody(request: Request, limit: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > limit) throw new Error("Request too large");
  if (!request.body) throw new Error("Missing request body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new Error("Request too large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
