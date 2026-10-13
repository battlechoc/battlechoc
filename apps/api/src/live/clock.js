// The server clock of live matches: monotonic milliseconds plus timers. Tests use the
// ManualClock to fast-forward match time; network heartbeats always use real time.

const { performance } = require('perf_hooks');

const systemClock = {
    now: () => Math.floor(performance.timeOrigin + performance.now()),
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: timer => clearTimeout(timer),
};

class ManualClock {
    constructor(start = 1000000) {
        this.time = start;
        this.timers = new Map();
        this.nextId = 1;
    }

    now() {
        return this.time;
    }

    setTimer(fn, ms) {
        const id = this.nextId++;
        this.timers.set(id, { at: this.time + Math.max(0, ms), fn, id });
        return id;
    }

    clearTimer(id) {
        this.timers.delete(id);
    }

    /** Moves the clock forward and runs every timer that falls due, in time order. */
    advance(ms) {
        const until = this.time + ms;
        for (;;) {
            const due = [...this.timers.values()].filter(timer => timer.at <= until).sort((a, b) => a.at - b.at || a.id - b.id)[0];
            if (!due) {
                break;
            }
            this.timers.delete(due.id);
            this.time = Math.max(this.time, due.at);
            due.fn();
        }
        this.time = until;
    }
}

module.exports = { systemClock, ManualClock };
