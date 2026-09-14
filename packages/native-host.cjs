"use strict";
const { spawn } = require("node:child_process");
const { EventEmitter } = require("node:events");
const net = require("node:net"),
  crypto = require("node:crypto");
class PcmParser {
  constructor(onFrame) {
    this.pending = Buffer.alloc(0);
    this.onFrame = onFrame;
  }
  push(bytes) {
    this.pending = Buffer.concat([this.pending, bytes]);
    if (this.pending.length > 1024 * 1024)
      throw new Error("Audio channel exceeded buffer budget");
    while (this.pending.length >= 16) {
      const b = this.pending;
      if (b.readUInt32LE(0) !== 0x47504156)
        throw new Error("Invalid audio protocol");
      const count = b.readUInt32LE(4),
        rate = b.readUInt32LE(8),
        seq = b.readUInt32LE(12);
      if (!count || count > 44100 || rate !== 44100)
        throw new Error("Invalid audio frame");
      const end = 16 + count * 4;
      if (b.length < end) break;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = b.readFloatLE(16 + i * 4);
      this.pending = b.subarray(end);
      this.onFrame({ samples, rate, seq });
    }
  }
}
function nativeTask(exe, args, { onEvent = () => {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "",
      errorText = "",
      last,
      settled = false;
    child.stdin.on("error", () => {});
    const abort = () => child.kill();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text) => {
      buffer += text;
      if (buffer.length > 1024 * 1024) {
        child.kill();
        return;
      }
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        try {
          const e = JSON.parse(line);
          last = e;
          onEvent(e);
        } catch {}
      }
    });
    child.stderr.on("data", (b) => {
      errorText = (errorText + b.toString()).slice(-3000);
    });
    child.on("error", (e) => {
      settled = true;
      reject(e);
    });
    child.on("close", (code) => {
      signal?.removeEventListener("abort", abort);
      if (settled) return;
      if (signal?.aborted) return reject(new Error("Cancelled"));
      if (code !== 0 || last?.type === "error")
        reject(
          new Error(
            last?.message || errorText || `Recognition helper exited (${code})`,
          ),
        );
      else resolve(last);
    });
  });
}
class LiveHost extends EventEmitter {
  constructor(exe) {
    super();
    this.exe = exe;
    this.wanted = false;
    this.child = null;
    this.server = null;
    this.socket = null;
    this.timer = null;
    this.generation = 0;
  }
  async start(db, device, channel = 0) {
    await this.stop();
    this.wanted = true;
    this.options = { db, device, channel };
    await this.launch();
  }
  async launch() {
    const generation = ++this.generation;
    const pipe = "\\\\.\\pipe\\GenrePoliceAutoVJ-" + crypto.randomUUID();
    this.server = net.createServer((socket) => {
      if (generation !== this.generation || this.socket) {
        socket.destroy();
        return;
      }
      this.socket = socket;
      const parser = new PcmParser((frame) => this.emit("pcm", frame));
      socket.on("data", (b) => {
        try {
          parser.push(b);
        } catch (e) {
          this.emit("status", { type: "error", message: e.message });
          socket.destroy();
        }
      });
      socket.on("close", () => {
        if (this.socket === socket) this.socket = null;
      });
      socket.on("error", () => {});
    });
    await new Promise((res, rej) => {
      this.server.once("error", rej);
      this.server.listen(pipe, res);
    });
    const { db, device, channel } = this.options;
    const child = spawn(
      this.exe,
      ["--listen", db, device, pipe, String(channel)],
      { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
    );
    this.child = child;
    child.stdin.on("error", () => {});
    let pending = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (text) => {
      if (generation !== this.generation) return;
      pending += text;
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) {
        try {
          this.emit("status", JSON.parse(line));
        } catch {}
      }
    });
    child.stderr.on("data", () => {});
    child.on("error", (e) =>
      this.emit("status", { type: "error", message: e.message }),
    );
    child.on("exit", (code) => {
      if (this.child === child) this.child = null;
      if (generation !== this.generation) return;
      this.closeTransport();
      if (this.wanted) {
        this.emit("status", { type: "reconnecting", code });
        this.timer = setTimeout(
          () =>
            this.launch().catch((e) =>
              this.emit("status", { type: "error", message: e.message }),
            ),
          2000,
        );
      }
    });
  }
  closeTransport() {
    this.socket?.destroy();
    this.socket = null;
    this.server?.close();
    this.server = null;
  }
  async stop() {
    this.wanted = false;
    ++this.generation;
    clearTimeout(this.timer);
    const child = this.child;
    this.child = null;
    if (child) {
      await new Promise((resolve) => {
        const t = setTimeout(() => {
          child.kill();
          resolve();
        }, 1500);
        child.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
        child.stdin.end("stop\n");
      });
    }
    this.closeTransport();
  }
}
module.exports = { nativeTask, LiveHost, PcmParser };
