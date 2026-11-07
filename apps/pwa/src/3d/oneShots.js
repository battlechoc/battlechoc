// Effects that run once and clean up after themselves: an explosion, a melting cell, a floating
// info, an energy bar. Each one ends once, at its own end or when all of them are stopped (the
// board is cleared), never twice; and the timers that belong to them are cancelled with them, so
// that nothing of a cleared board runs later.
export class OneShots {
  constructor() {
    this.running = new Set();
    this.timers = new Set();
  }

  // `stop` cleans the effect up; returns the function that ends it, which may be called any
  // number of times (from an animation's end, a timer, stopAll) and stops it only the first time
  start(stop) {
    const end = () => {
      if (this.running.delete(end)) {
        stop();
      }
    };
    this.running.add(end);
    return end;
  }

  // `callback` in `ms`; when everything stops first, `cancel` runs instead
  later(callback, ms, cancel = () => {}) {
    const timer = {
      cancel,
      id: setTimeout(() => {
        this.timers.delete(timer);
        callback();
      }, ms),
    };
    this.timers.add(timer);
  }

  get size() {
    return this.running.size;
  }

  stopAll() {
    const timers = [...this.timers];
    this.timers.clear();
    timers.forEach((timer) => {
      clearTimeout(timer.id);
      timer.cancel();
    });
    [...this.running].forEach((end) => end());
  }
}
