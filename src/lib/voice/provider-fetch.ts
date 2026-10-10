import "server-only";
import https from "node:https";
import { Readable } from "node:stream";

const state = globalThis as unknown as { familiarVoiceAgent?: https.Agent };
const agent = state.familiarVoiceAgent ??= new https.Agent({
  keepAlive: true, keepAliveMsecs: 15000, maxSockets: 8, maxFreeSockets: 4, scheduling: "lifo",
});

export function providerFetch(url: string, options: {
  method?: string; headers: Record<string, string>; body?: string; signal: AbortSignal;
}): Promise<Response> {
  return new Promise((resolve, reject) => {
    options.signal.throwIfAborted();
    const target = new URL(url);
    if (target.protocol !== "https:" || !["generativelanguage.googleapis.com", "api.elevenlabs.io"].includes(target.hostname)) {
      reject(new Error("Unsupported provider"));
      return;
    }
    const request = https.request(target, { method: options.method ?? "GET", headers: options.headers, agent, signal: options.signal }, (response) => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, { status: response.statusCode ?? 502, headers }));
    });
    request.on("error", () => reject(new Error("Provider connection failed")));
    request.end(options.body);
  });
}
