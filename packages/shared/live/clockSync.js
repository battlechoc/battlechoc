// Client side clock sync for live matches (§3.1 of the migration plan): NTP-style pings over
// the match WebSocket estimate offset = serverClock - localClock. The sample with the lowest
// round trip of the last few wins. Server times piggy-backed on pushed views correct the
// offset when it is clearly too small (a message can never arrive before it was sent).
//
// The match time is then serverNow() - epoch, where the server sends the epoch of the match
// (its server clock at match time 0) with every view.

class ClockSync {
    /**
     * @param {object} [options]
     * @param {() => number} [options.now] local monotonic clock in ms
     * @param {number} [options.samples] round trips to keep
     * @param {number} [options.correctionMs] piggy-back corrections below this are ignored
     */
    constructor({ now = () => Date.now(), samples = 8, correctionMs = 100 } = {}) {
        this.now = now;
        this.maxSamples = samples;
        this.correctionMs = correctionMs;
        this.samples = [];
        this.offset = 0;
        this.rtt = Infinity;
    }

    get synced() {
        return this.samples.length > 0;
    }

    /** Adds a ping round trip: local send time, the server's time, local receive time. */
    sample(clientSentAt, serverT, clientReceivedAt = this.now()) {
        const rtt = clientReceivedAt - clientSentAt;
        if (!(rtt >= 0) || !Number.isFinite(serverT)) {
            return;
        }
        this.samples.push({ rtt, offset: serverT - (clientSentAt + clientReceivedAt) / 2 });
        if (this.samples.length > this.maxSamples) {
            this.samples.shift();
        }
        const best = this.samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
        this.offset = best.offset;
        this.rtt = best.rtt;
    }

    /** A server time that came with a pushed message, received now. */
    observe(serverT, receivedAt = this.now()) {
        if (!Number.isFinite(serverT)) {
            return;
        }
        // the server sent it before we received it: our estimate must not be behind it
        if (!this.synced || serverT - (receivedAt + this.offset) > this.correctionMs) {
            this.offset = serverT - receivedAt;
        }
    }

    serverNow(local = this.now()) {
        return local + this.offset;
    }

    /** Estimated match time for a match whose time 0 was at `epoch` on the server clock. */
    matchTime(epoch, local = this.now()) {
        return Math.max(0, Math.floor(this.serverNow(local) - epoch));
    }
}

module.exports = { ClockSync };
