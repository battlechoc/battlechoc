// A single player match opened with ?testclock runs on a manual clock
// (window.__battlechoc.host.clock, src/testHooks.js): the tests move match time on themselves.

/** Runs `fn(arg)` in the page. */
export const host = (page, fn, arg) => page.evaluate(fn, arg);

/** Moves the match clock on by `ms`; every timer and AI decision on the way runs at its time. */
export const advance = (page, ms) => host(page, (ms) => window.__battlechoc.host.clock.advance(ms), ms);

/** The phase of the local match ("MatchPhase.RUNNING", …). */
export const phase = (page) => host(page, () => window.__battlechoc.host.match.phase);
