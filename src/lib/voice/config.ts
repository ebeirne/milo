import "server-only";

// Provider-supplied George stock voice, pinned independently of account metadata.
export const DEFAULT_STOCK_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export function voiceSettings() {
  return {
    geminiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
    geminiModel: process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-3.5-flash-lite",
    sttModel: process.env.GEMINI_STT_MODEL?.trim() || "gemini-3.5-flash-lite",
    anthropicKey: process.env.ANTHROPIC_API_KEY?.trim() ?? "",
    sonnetModel: process.env.SONNET_CHAT_MODEL?.trim() || "claude-sonnet-5-5",
    conversationProvider: process.env.CONVERSATION_PROVIDER === "gemini" ? "gemini" as const : "sonnet" as const,
    typesafeKey: process.env.TYPESAFE_API_KEY?.trim() ?? "",
    jevModel: process.env.JEV_MODEL?.trim() || "jev-latest",
    elevenlabsKey: process.env.ELEVENLABS_API_KEY?.trim() ?? "",
    ttsModel: process.env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_flash_v2_5",
    stockVoiceId: process.env.ELEVENLABS_STOCK_VOICE_ID?.trim() || DEFAULT_STOCK_VOICE_ID,
  };
}

export function providersConfigured(): boolean {
  const settings = voiceSettings();
  const conversationKey = activeConversationProvider() === "sonnet" ? settings.anthropicKey : settings.geminiKey;
  return Boolean(conversationKey && settings.elevenlabsKey);
}

export function activeConversationProvider(): "sonnet" | "gemini" {
  const settings = voiceSettings();
  return settings.conversationProvider === "sonnet" && settings.anthropicKey ? "sonnet" : "gemini";
}
