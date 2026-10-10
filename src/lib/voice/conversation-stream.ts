import "server-only";
import { ReplyParser, type ConversationEvent, type SpeakerInfo } from "./protocol";
import { speechTicket } from "./tickets";
import type { SafetyKind, Tier } from "../safety";

export function conversationStream(input: { conversationId: string; text?: string; startedAt: number; evaluationId?: string; speaker?: { info: SpeakerInfo; switched: boolean } | null }, requestSignal: AbortSignal, dependencies: {
  reply: (signal: AbortSignal, notice: (model: { provider: "sonnet" | "gemini"; fallback: boolean }) => void) => AsyncIterable<string>;
  save: (heard: string, reply: string, remembered: string[]) => Promise<void>;
  // Screens what the person said, with the model's own label once the reply is complete. Must not throw.
  assess?: (heard: string, modelTier: Tier | null) => Promise<{ tier: Tier; kind: SafetyKind } | null>;
  release: () => void;
}): ReadableStream<Uint8Array> {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancellation.signal, AbortSignal.timeout(45000)]);
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const produce = async () => {
        const emit = (event: ConversationEvent) => {
          signal.throwIfAborted();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        let previousText = "";
        let heard = input.text ?? "";
        let firstPhraseMs: number | null = null;
        let announced: Tier | null = null;
        // The screen runs as soon as the words are known, so a call button never waits for the model.
        const screen = async (modelTier: Tier | null) => {
          const safety = heard ? await dependencies.assess?.(heard, modelTier) : null;
          if (!safety || safety.tier === "concern" || safety.tier === announced) return;
          announced = safety.tier;
          emit({ type: "safety", tier: safety.tier, kind: safety.kind });
        };
        try {
          emit({ type: "start", conversationId: input.conversationId, ...(input.evaluationId ? { evaluationId: input.evaluationId } : {}) });
          emit({ type: "speaker", speaker: input.speaker?.info ?? null, switched: input.speaker?.switched ?? false });
          let screened = Boolean(heard);
          if (screened) await screen(null);
          const parser = new ReplyParser();
          const sendSentences = (sentences: string[]) => {
            if (!heard && parser.transcript) {
              heard = parser.transcript;
              emit({ type: "transcript", text: heard });
            }
            for (const sentence of sentences) {
              firstPhraseMs ??= Math.round(performance.now() - input.startedAt);
              emit({ type: "sentence", text: sentence, ticket: speechTicket(sentence, previousText, input.speaker?.info.id ?? null) });
              previousText += `${sentence} `;
            }
          };
          for await (const chunk of dependencies.reply(signal, (model) => emit({ type: "model", ...model }))) {
            sendSentences(parser.push(chunk));
            if (!screened && heard) { screened = true; await screen(null); }
          }
          sendSentences(parser.push("", true));
          await screen(parser.flag);
          if (!previousText.trim()) throw new Error("Empty reply");
          signal.throwIfAborted();
          if (heard) await dependencies.save(heard, previousText.trim(), parser.remembered);
          emit({ type: "timings", firstPhraseMs: firstPhraseMs ?? Math.round(performance.now() - input.startedAt) });
        } catch {
          if (!signal.aborted) {
            const fallback = "I'm having trouble right now. Please try again, or contact someone you trust.";
            emit({ type: "error", message: fallback });
            if (!previousText) emit({ type: "sentence", text: fallback, ticket: speechTicket(fallback, "", input.speaker?.info.id ?? null) });
          }
        } finally {
          dependencies.release();
          if (!signal.aborted) { emit({ type: "done" }); controller.close(); }
          else { try { controller.close(); } catch { /* The cancelled reader owns closure. */ } }
        }
      };
      // Keep start synchronous so cancel can abort the provider immediately.
      void produce();
    },
    cancel() { cancellation.abort(); },
  });
}
