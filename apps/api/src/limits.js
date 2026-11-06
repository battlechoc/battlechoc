// Limits kept in memory, per key (a client address, a player). Both forget the keys that are no
// longer in a window: without that they hold one entry for every address or player that ever came
// by, for as long as the process runs. The sweep runs with a request, at most once per window, so
// it needs no timer of its own; a map then holds the keys of the last two windows at most.

const sweeper = (windowMs, now, sweep) => {
    let sweptAt = now();
    return at => {
        if (at - sweptAt > windowMs) {
            sweptAt = at;
            sweep(at);
        }
    };
};

/** At most `max` events per key in a window that starts with the key's first event. */
const fixedWindowLimit = ({ windowMs, max, now = () => Date.now() }) => {
    // key -> { since, count }
    const windows = new Map();
    const sweep = sweeper(windowMs, now, at => windows.forEach((entry, key) => {
        if (at - entry.since > windowMs) {
            windows.delete(key);
        }
    }));
    return {
        /** Counts an event of `key`; false when the key is over the limit (the event is not counted). */
        allow(key) {
            const at = now();
            sweep(at);
            const entry = windows.get(key);
            if (!entry || at - entry.since > windowMs) {
                windows.set(key, { since: at, count: 1 });
            } else if (entry.count >= max) {
                return false;
            } else {
                entry.count += 1;
            }
            return true;
        },
        get size() {
            return windows.size;
        },
    };
};

/** At most `max` events per key within any span of `windowMs`. */
const slidingWindowLimit = ({ windowMs, max, now = () => Date.now() }) => {
    // key -> the times of its events within the window
    const events = new Map();
    const sweep = sweeper(windowMs, now, at => events.forEach((times, key) => {
        if (times.length === 0 || times[times.length - 1] <= at - windowMs) {
            events.delete(key);
        }
    }));
    return {
        /** Counts an event of `key`; false when the key is over the limit (the event is not counted). */
        allow(key) {
            const at = now();
            sweep(at);
            const recent = (events.get(key) || []).filter(time => time > at - windowMs);
            if (recent.length >= max) {
                events.set(key, recent);
                return false;
            }
            recent.push(at);
            events.set(key, recent);
            return true;
        },
        get size() {
            return events.size;
        },
    };
};

module.exports = { fixedWindowLimit, slidingWindowLimit };
