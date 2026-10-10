import { getFiller } from "@/lib/voice/elevenlabs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const phrase = new URL(request.url).searchParams.get("phrase");
  if (phrase !== "thinking" && phrase !== "disclosure") return Response.json({ message: "Unknown phrase." }, { status: 400 });
  try {
    const audio = await getFiller(phrase);
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ message: "Voice warm-up is unavailable. You can still read replies." }, { status: 503 });
  }
}
