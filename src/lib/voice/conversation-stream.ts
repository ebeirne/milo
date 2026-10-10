import "server-only";
import { ReplyParser, type ConversationEvent, type SpeakerInfo } from "./protocol";
import { speechTicket } from "./tickets";

export function conversationStream(input: { conversationId: string; text?: string; startedAt: number; evaluationId?: string; speaker?: { info: SpeakerInfo; switched: boolean } | null }, requestSignal: AbortSignal, dependencies: {
  reply: (signal: AbortSignal, notice: (model: { provider: "sonnet" | "gemini"; fallback: boolean }) => void) => AsyncIterable<string>;
  save: (heard: string, reply: string) => Promise<void>;
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
        try {
          emit({ type: "start", conversationId: input.conversationId, ...(input.evaluationId ? { evaluationId: input.evaluationId } : {}) });
          emit({ type: "speaker", speaker: input.speaker?.info ?? null, switched: input.speaker?.switched ?? false });
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
          for await (const chunk of dependencies.reply(signal, (model) => emit({ type: "model", ...model }))) sendSentences(parser.push(chunk));
          sendSentences(parser.push("", true));
          if (!previousText.trim()) throw new Error("Empty reply");
          signal.throwIfAborted();
          if (heard) await dependencies.save(heard, previousText.trim());
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
