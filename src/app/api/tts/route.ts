import { readSpeechTicket } from "@/lib/voice/tickets";
import { streamSpeech } from "@/lib/voice/elevenlabs";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  let speech: { text: string; previousText: string } | null;
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 8000)));
    speech = typeof value.ticket === "string" ? readSpeechTicket(value.ticket) : null;
  } catch { speech = null; }
  if (!speech) return Response.json({ message: "Speech request expired. Please try talking again." }, { status: 400 });
  try {
    const response = await streamSpeech(speech.text, speech.previousText, request.signal);
    return new Response(response.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return Response.json({ message: "I couldn’t play my voice. You can read my reply." }, { status: 503 });
  }
}
