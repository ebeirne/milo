import { getHousehold } from "@/lib/db/repository";
import { openConversation, saveConversationTurn } from "@/lib/db/conversations";
import { streamConversation } from "@/lib/voice/conversation-model";
import { providersConfigured, activeConversationProvider, voiceSettings } from "@/lib/voice/config";
import { evaluateReply } from "@/lib/voice/jev";
import { saveEvaluation } from "@/lib/db/evaluations";
import { activeVoices, getRotationPolicy, personaOf } from "@/lib/db/voices";
import { consentedVoice } from "@/lib/voice/enrollment";
import { chooseVoice, seemsDistressed } from "@/lib/voice/rotation";
import { speakerLabel, type Speaker } from "@/lib/voice/prompt";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { conversationStream } from "@/lib/voice/conversation-stream";
import { audioMime } from "@/lib/voice/protocol";
import { boundedBody, sameOrigin } from "@/lib/voice/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const state = globalThis as unknown as { familiarActiveTurns?: Set<string> };
const activeTurns = state.familiarActiveTurns ??= new Set<string>();

export async function POST(request: Request) {
  const started = performance.now();
  if (!sameOrigin(request)) return Response.json({ message: "Request not allowed." }, { status: 403 });
  if (!providersConfigured()) return Response.json({ message: "Voice conversations aren’t ready yet. Please ask the person setting up Familiar for help." }, { status: 503 });
  let text: string | undefined;
  let audio: { data: string; mimeType: string } | undefined;
  let previousId: string | null;
  try {
    const bytes = await boundedBody(request, 6 * 1024 * 1024);
    const data = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const rawText = data.get("text");
    const recording = data.get("audio");
    const rawId = data.get("conversationId");
    previousId = typeof rawId === "string" && rawId ? rawId : null;
    if (previousId && !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(previousId)) throw new Error("Invalid conversation");
    if (typeof rawText === "string" && rawText.trim() && rawText.length <= 2000) text = rawText.trim();
    if (recording instanceof File && recording.size > 100 && recording.size <= 5 * 1024 * 1024) {
      const mimeType = audioMime(recording.type);
      if (!mimeType) throw new Error("Unsupported recording");
      audio = { data: Buffer.from(await recording.arrayBuffer()).toString("base64"), mimeType };
    }
    if (Boolean(text) === Boolean(audio)) throw new Error("Provide text or audio");
  } catch {
    return Response.json({ message: "Please try a shorter recording or type your message." }, { status: 400 });
  }
  let patientId: string;
  let preferredName: string;
  let conversation: Awaited<ReturnType<typeof openConversation>>;
  try {
    const household = await getHousehold();
    if (!household.patient) return Response.json({ message: "Please complete Familiar’s setup first." }, { status: 409 });
    patientId = household.patient.id;
    preferredName = household.patient.preferred_name;
    if (activeTurns.has(patientId)) return Response.json({ message: "Please wait a moment before speaking again." }, { status: 429 });
    activeTurns.add(patientId);
    try { conversation = await openConversation(patientId, previousId); }
    catch (error) { activeTurns.delete(patientId); throw error; }
  } catch {
    return Response.json({ message: "I couldn’t start this conversation. Please try again." }, { status: 503 });
  }
  if (audio && !voiceSettings().geminiKey) {
    activeTurns.delete(patientId);
    return Response.json({ message: "Audio transcription isn’t ready. You can type your message instead." }, { status: 503 });
  }
  // Only active, ready voices whose consent record still exists may speak; otherwise the stock voice is used.
  let speaker: Speaker | null = null;
  let switched = false;
  let handoffFrom: string | null = null;
  try {
    const candidates = (await Promise.all((await activeVoices(patientId)).map((voice) => consentedVoice(voice.id, patientId).catch(() => null)))).filter((voice) => voice !== null);
    const choice = chooseVoice({
      policy: await getRotationPolicy(patientId), voices: candidates, conversationId: conversation.id,
      last: conversation.last, distressed: seemsDistressed(conversation.userTurns),
    });
    const chosen = choice && candidates.find((voice) => voice.id === choice.voice.id);
    if (choice && chosen) {
      speaker = { id: chosen.id, name: chosen.display_name, relationship: chosen.relationship, persona: personaOf(chosen) };
      switched = choice.switched && Boolean(conversation.last);
      handoffFrom = switched ? candidates.find((voice) => voice.id === choice.previousId)?.display_name ?? null : null;
    }
  } catch { speaker = null; }
  let provider = activeConversationProvider();
  const evaluationId = randomUUID();
  let completedTurn: { heard: string; reply: string } | null = null;
  after(async () => {
    if (!completedTurn) return;
    try {
      const evaluation = await evaluateReply({ ...completedTurn, context: JSON.stringify({ speaker: speaker ? `AI companion using an AI recreation of ${speaker.name}'s voice, recorded with their permission; approved shared facts: ${JSON.stringify(speaker.persona?.shared_facts ?? [])}` : "AI companion using a stock voice", history: conversation.history }) });
      await saveEvaluation(evaluationId, conversation.id, provider, evaluation);
    } catch { console.error("Familiar reply evaluation could not be saved."); }
  });
  const stream = conversationStream({ conversationId: conversation.id, text, startedAt: started, evaluationId, speaker: speaker ? { info: { id: speaker.id, name: speaker.name, relationship: speaker.relationship, label: speakerLabel(speaker.name) }, switched } : null }, request.signal, {
    reply: (signal, notice) => streamConversation({ text, audio, preferredName, history: conversation.history, speaker, handoffFrom }, signal, (model) => { provider = model.provider; notice(model); }),
    save: async (heard, reply) => { await saveConversationTurn(conversation.id, heard, reply, speaker?.id ?? null); completedTurn = { heard, reply }; },
    release: () => activeTurns.delete(patientId),
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
}
