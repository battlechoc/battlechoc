// Match clocks. The engine never reads a clock; the host asks a clock for the current match
// time (integer ms) and passes it to the engine.

// Monotonic clock based on performance.now(); pausing freezes the match time.
class MatchClock {
  constructor(source = () => performance.now()) {
    this.source = source;
    this.base = 0;
    this.since = 0;
    this.running = false;
  }

  start(t = 0) {
    this.base = t;
    this.since = this.source();
    this.running = true;
  }

  now() {
    return this.running
      ? Math.floor(this.base + this.source() - this.since)
      : this.base;
  }

  pause() {
    if (this.running) {
      this.base = this.now();
      this.running = false;
    }
  }

  resume() {
    if (!this.running) {
      this.since = this.source();
      this.running = true;
    }
  }
}

// Clock that only moves when told to; used by tests via window.__battlechoc.
class ManualClock {
  constructor() {
    this.t = 0;
    this.running = false;
    this.listeners = [];
  }

  start(t = 0) {
    this.t = t;
    this.running = true;
  }

  now() {
    return this.t;
  }

  pause() {
    this.running = false;
  }

  resume() {
    this.running = true;
  }

  advance(ms) {
    this.t += ms;
    this.listeners.forEach((listener) => listener());
  }

  onAdvance(listener) {
    this.listeners.push(listener);
  }
}

export { MatchClock, ManualClock };
