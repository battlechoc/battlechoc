// The watcher: an interval job (like cleanup.js) that reads the chain index's tip, decides whether
// the index is fresh enough to act on, and runs its steps in order: plan D's `operations` and
// plan E's `salvage` before plan C's `ownership`. A step that throws is logged with its name and
// the next one still runs; a run never rejects. Runs never overlap.
//
// The views the index reads (views.sql) are made by ensureViews once Yaci Store has made its
// tables, and they can disappear again (a rebuild of the index drops Yaci Store's schema and the
// views with it): the watcher calls ensureViews at each run until it answers true, and again after
// a run in which the index answered IndexUnavailableError.
//
// It logs what changes and what fails, never an idle run: the steps log their own changes, the
// watcher a failing step and the moments the index stops and starts being fresh. A failure that
// lasts (of ensureViews, of the tip, of a step) is logged when it starts, again when its message
// changes and once when it ends (lastingLog.js), not every 20 s.

const { IndexUnavailableError } = require('./indexUnavailable');
const { lastingLog, messageOf } = require('./lastingLog');

/**
 * A watcher over `chain` (chain/index.js: its `index` and `indexMaxLagMs`) and `pool`, running
 * `steps` ([{ name, run(context) }], in order) every `intervalMs` once started. Each step gets
 * `{ pool, chain, now, tip, fresh, log, memory }`: `now` is the clock (a function, ms), `tip` the
 * index's tip ({ blockNo, slot, hash, time } or null when it has none or cannot answer), `fresh`
 * whether that tip is at most `chain.indexMaxLagMs` old (nothing may be decided on the chain
 * otherwise), `memory` an object of the step's own that the watcher keeps from run to run (for
 * lastingLog.js).
 * `runOnce()` resolves with `{ tip, fresh, steps: { [name]: result | { error } } }`; while a run
 * is going, it hands out that run's promise. `start()` runs at once and every `intervalMs` (the
 * timer does not keep the process alive) and returns the function that stops it.
 */
const createWatcher = ({ chain, pool, steps, intervalMs, now = Date.now, log = console }) => {
    const index = chain.index;
    const hasViews = typeof index.ensureViews === 'function';
    let viewsReady = !hasViews;
    let running = null;
    // whether the last run found the index fresh (null before the first run)
    let wasFresh = null;
    const lasting = lastingLog({});
    const memories = new Map(steps.map(step => [step, {}]));

    const makeViews = async () => {
        try {
            viewsReady = (await index.ensureViews()) === true;
            lasting.clear('views', () => log.info('watcher: making the chain views works again'));
        } catch (error) {
            viewsReady = false;
            if (!(error instanceof IndexUnavailableError)) {
                lasting.report('views', messageOf(error), () => log.error('watcher: making the chain views failed', error));
            }
        }
    };

    const readTip = async () => {
        try {
            const tip = (await index.tip()) ?? null;
            lasting.clear('tip', () => log.info('watcher: reading the chain index\'s tip works again'));
            return { tip, unavailable: false };
        } catch (error) {
            if (error instanceof IndexUnavailableError) {
                return { tip: null, unavailable: true };
            }
            lasting.report('tip', messageOf(error), () => log.error('watcher: reading the chain index\'s tip failed', error));
            return { tip: null, unavailable: false };
        }
    };

    const noteFreshness = (fresh, tip, unavailable) => {
        if (!fresh && wasFresh !== false) {
            const why = unavailable ? 'unavailable' : tip === null ? 'empty' : `${Math.round((now() - tip.time) / 1000)} s behind`;
            log.warn(`watcher: the chain index is ${why}; nothing is decided on the chain until it is fresh again`);
        } else if (fresh && wasFresh === false) {
            log.info(`watcher: the chain index is fresh again (block ${tip.blockNo})`);
        }
        wasFresh = fresh;
    };

    const run = async () => {
        if (!viewsReady) {
            await makeViews();
        }
        const { tip, unavailable } = await readTip();
        let indexFailed = unavailable;
        const fresh = tip !== null && now() - tip.time <= chain.indexMaxLagMs;
        noteFreshness(fresh, tip, unavailable);
        const report = { tip, fresh, steps: {} };
        for (const step of steps) {
            const condition = `step ${step.name}`;
            try {
                report.steps[step.name] = await step.run({ pool, chain, now, tip, fresh, log, memory: memories.get(step) });
                lasting.clear(condition, () => log.info(`watcher: step ${step.name} runs again`));
            } catch (error) {
                indexFailed = indexFailed || error instanceof IndexUnavailableError;
                report.steps[step.name] = { error };
                lasting.report(condition, messageOf(error), () => log.error(`watcher: step ${step.name} failed`, error));
            }
        }
        if (indexFailed && hasViews) {
            viewsReady = false;
        }
        return report;
    };

    const runOnce = () => {
        if (running === null) {
            running = run()
                .catch(error => {
                    // only a broken log gets here; the run's own failures are caught above
                    try {
                        log.error('watcher: a run failed', error);
                    } catch {
                        // nothing left to tell
                    }
                    return { tip: null, fresh: false, steps: {}, error };
                })
                .finally(() => {
                    running = null;
                });
        }
        return running;
    };

    const start = () => {
        runOnce();
        const timer = setInterval(runOnce, intervalMs);
        if (typeof timer.unref === 'function') {
            timer.unref();
        }
        return () => clearInterval(timer);
    };

    return Object.freeze({ runOnce, start });
};

module.exports = { createWatcher };
