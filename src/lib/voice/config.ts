import "server-only";

// Provider-supplied George stock voice, pinned independently of account metadata.
export const DEFAULT_STOCK_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

export function voiceSettings() {
  return {
    geminiKey: process.env.GEMINI_API_KEY?.trim() ?? "",
    geminiModel: process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-3.5-flash-lite",
    elevenlabsKey: process.env.ELEVENLABS_API_KEY?.trim() ?? "",
    ttsModel: process.env.ELEVENLABS_TTS_MODEL?.trim() || "eleven_flash_v2_5",
    stockVoiceId: process.env.ELEVENLABS_STOCK_VOICE_ID?.trim() || DEFAULT_STOCK_VOICE_ID,
  };
}

export function providersConfigured(): boolean {
  const settings = voiceSettings();
  return Boolean(settings.geminiKey && settings.elevenlabsKey);
}
