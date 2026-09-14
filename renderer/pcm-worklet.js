class NativePCM extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.current = null;
    this.position = 0;
    this.available = 0;
    this.port.onmessage = (e) => {
      if (e.data.reset) {
        this.queue = [];
        this.current = null;
        this.available = 0;
        this.position = 0;
        return;
      }
      const samples = e.data.samples;
      if (!samples?.length) return;
      this.queue.push(samples);
      this.available += samples.length;
      if (this.available > 44100 * 0.16) {
        this.queue = this.queue.slice(-3);
        this.current = null;
        this.position = 0;
        this.available = this.queue.reduce((n, x) => n + x.length, 0);
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (!this.current) {
        this.current = this.queue.shift();
        this.position = 0;
      }
      if (!this.current) {
        out[i] = 0;
        continue;
      }
      const index = Math.floor(this.position),
        next = Math.min(index + 1, this.current.length - 1),
        fraction = this.position - index;
      out[i] =
        this.current[index] * (1 - fraction) + this.current[next] * fraction;
      this.position += 44100 / sampleRate;
      this.available = Math.max(0, this.available - 44100 / sampleRate);
      if (this.position >= this.current.length) {
        this.position -= this.current.length;
        this.current = this.queue.shift() || null;
      }
    }
    return true;
  }
}
registerProcessor("native-pcm", NativePCM);
