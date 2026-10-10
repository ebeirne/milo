import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, unlink, rmdir } from "node:fs/promises";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import type { AudioQuality } from "../enrollment-contract";

export function pcmQuality(pcm: Uint8Array): AudioQuality {
  if (pcm.length < 2 || pcm.length % 2) throw new Error("Recording could not be decoded.");
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const frames: number[] = [];
  let sum = 0, clipped = 0, frameSum = 0, frameCount = 0;
  for (let offset = 0; offset < pcm.length; offset += 2) {
    const sample = view.getInt16(offset, true) / 32768;
    sum += sample * sample; frameSum += sample * sample; frameCount++;
    if (Math.abs(sample) >= 0.98) clipped++;
    if (frameCount === 400) { frames.push(Math.sqrt(frameSum / frameCount)); frameSum = 0; frameCount = 0; }
  }
  if (frameCount) frames.push(Math.sqrt(frameSum / frameCount));
  const sorted = [...frames].sort((a, b) => a - b);
  const quiet = sorted[Math.floor((sorted.length - 1) * 0.2)] ?? 0;
  const loud = sorted[Math.floor((sorted.length - 1) * 0.8)] ?? 0;
  return {
    duration: pcm.length / 32000, rms: Math.sqrt(sum / (pcm.length / 2)), clipping: clipped / (pcm.length / 2),
    contrast: loud / Math.max(quiet, 0.001), speechFraction: frames.filter((rms) => rms > 0.012).length / frames.length,
  };
}

export function qualityProblem(quality: AudioQuality, minSeconds: number, maxSeconds: number): string | null {
  if (quality.duration < minSeconds - 0.5) return `Please record at least ${minSeconds} seconds.`;
  if (quality.duration > maxSeconds + 0.3) return `Please keep the recording under ${maxSeconds} seconds.`;
  if (quality.rms < 0.008 || quality.speechFraction < 0.12) return "Your voice is too quiet or there is too much silence. Move closer and record again.";
  if (quality.clipping > 0.02) return "The recording is distorted. Move a little farther from the microphone and try again.";
  if (quality.contrast < 1.5) return "The recording has steady noise or little variation. Find a quiet room and use your natural speaking voice.";
  return null;
}

export async function inspectAudio(bytes: Uint8Array, mime: string, signal: AbortSignal): Promise<{ quality: AudioQuality; sample: Uint8Array }> {
  if (!ffmpeg) throw new Error("Audio inspection is unavailable.");
  const formats: Record<string, string> = { "audio/webm": "matroska", "audio/m4a": "mov", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp3": "mp3", "audio/mpeg": "mp3", "audio/aac": "aac" };
  if (!formats[mime]) throw new Error("This recording format is not supported.");
  const root = path.resolve("data/voice-work");
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, "decode-"));
  const filename = path.join(directory, "recording");
  const prepared = path.join(directory, "sample.mp3");
  try {
    await writeFile(filename, bytes, { mode: 0o600 });
    const pcm = await new Promise<Uint8Array>((resolve, reject) => {
      const parts: Buffer[] = [];
      let size = 0;
      const child = spawn(ffmpeg!, ["-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe", "-f", formats[mime], "-i", filename, "-map", "0:a:0", "-vn", "-t", "181", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1", "-map", "0:a:0", "-vn", "-t", "181", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "128k", prepared], { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
      const abort = () => child.kill();
      const timeout = setTimeout(abort, 15000);
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      child.stderr.resume();
      child.stdout.on("data", (part: Buffer) => {
        size += part.length;
        if (size > 181 * 32000 + 1024) child.kill(); else parts.push(part);
      });
      child.on("error", () => reject(new Error("Audio inspection is unavailable.")));
      child.on("close", (code) => {
        clearTimeout(timeout); signal.removeEventListener("abort", abort);
        if (code !== 0 || signal.aborted) reject(new Error("Recording could not be decoded. Please record again."));
        else resolve(Buffer.concat(parts));
      });
    });
    signal.throwIfAborted();
    return { quality: pcmQuality(pcm), sample: new Uint8Array(await readFile(prepared)) };
  } finally {
    // Only the fixed file in this owned temporary directory is removed.
    await unlink(filename).catch(() => {});
    await unlink(prepared).catch(() => {});
    await rmdir(directory).catch(() => {});
  }
}
