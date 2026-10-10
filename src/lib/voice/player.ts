// Browser-only Web Audio queue. Pending work carries a generation number so
// stopping cannot be undone by a late decode or network response.
export class VoicePlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private generation = 0;
  private nextStart = 0;
  private volume = 0.8;
  private sources = new Map<AudioBufferSourceNode, () => void>();
  private idleWaiters: (() => void)[] = [];

  private initialize(): AudioContext {
    if (!this.context) {
      const BrowserContext = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!BrowserContext) throw new Error("Audio playback is unsupported");
      this.context = new BrowserContext();
      this.gain = this.context.createGain();
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.gain.connect(this.analyser);
      this.analyser.connect(this.context.destination);
    }
    return this.context;
  }

  async unlock(): Promise<void> {
    const context = this.initialize();
    await context.resume();
    if (context.state !== "running") throw new Error("Audio playback is paused");
    this.gain!.gain.setValueAtTime(this.volume, context.currentTime);
  }

  monitorMicrophone(stream: MediaStream): { analyser: AnalyserNode; disconnect: () => void } {
    const context = this.initialize();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    return { analyser, disconnect: () => { source.disconnect(); analyser.disconnect(); } };
  }

  async queue(bytes: ArrayBuffer, onStart?: () => void): Promise<void> {
    const generation = this.generation;
    const context = this.initialize();
    if (context.state !== "running") throw new Error("Audio playback is paused");
    const buffer = await context.decodeAudioData(bytes.slice(0));
    if (generation !== this.generation) return;
    this.addBuffer(buffer, onStart);
  }

  private addBuffer(buffer: AudioBuffer, onStart?: () => void) {
    const context = this.context!;
    const generation = this.generation;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain!);
    const start = Math.max(context.currentTime + 0.025, this.nextStart);
    this.nextStart = start + buffer.duration;
    const timer = setTimeout(() => { if (generation === this.generation) onStart?.(); }, Math.max(0, (start - context.currentTime) * 1000));
    const finish = () => {
      clearTimeout(timer);
      source.disconnect();
      this.sources.delete(source);
      if (!this.sources.size) this.idleWaiters.splice(0).forEach((resolve) => resolve());
    };
    this.sources.set(source, finish);
    source.onended = finish;
    source.start(start);
  }

  waitForIdle(): Promise<void> {
    if (!this.sources.size) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.context && this.gain) this.gain.gain.setValueAtTime(this.volume, this.context.currentTime);
  }

  level(): number {
    if (!this.analyser || !this.sources.size) return 0;
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  }

  stop() {
    this.generation++;
    if (this.context && this.gain) this.gain.gain.setValueAtTime(0, this.context.currentTime);
    for (const [source, finish] of [...this.sources]) {
      source.onended = null;
      try { source.stop(); } catch { /* Already ended. */ }
      finish();
    }
    this.nextStart = 0;
    this.idleWaiters.splice(0).forEach((resolve) => resolve());
  }

  async dispose() {
    this.stop();
    await this.context?.close().catch(() => {});
    this.context = null;
    this.gain = null;
    this.analyser = null;
  }
}
