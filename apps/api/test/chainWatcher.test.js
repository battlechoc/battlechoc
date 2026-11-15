// The watcher (plan C, Task 7): an interval job that reads the index's tip, decides whether the
// index is fresh enough to act on, and runs its named steps in order (plan D's operations, plan E's
// salvage, plan C's ownership), each also after an earlier one failed.

const { createWatcher } = require('../src/chain/watcher');
const { IndexUnavailableError } = require('../src/chain/indexUnavailable');

const MINUTE = 60 * 1000;
const T0 = Date.parse('2026-11-15T12:00:00Z');
const silentLog = () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() });

// a chain with an index whose tip is `age` ms old at T0 (or the answer of `tip`)
const chainWith = ({ tip = async () => ({ blockNo: 7, slot: 70, hash: 'ab'.repeat(32), time: T0 - 1000 }), ensureViews } = {}) => ({
    enabled: true,
    indexMaxLagMs: 10 * MINUTE,
    index: { tip: jest.fn(tip), ...(ensureViews ? { ensureViews: jest.fn(ensureViews) } : {}) },
});

const step = (name, run = async () => ({ name })) => ({ name, run: jest.fn(run) });

describe('one run', () => {
    test('the steps run in order with the context, a throwing step does not stop the next, the report has each result', async () => {
        const order = [];
        const chain = chainWith();
        const log = silentLog();
        const failure = new Error('operations broke');
        const steps = [
            step('operations', async () => { order.push('operations'); throw failure; }),
            step('salvage', async () => { order.push('salvage'); return { credited: 0 }; }),
            step('ownership', async () => { order.push('ownership'); return { changed: 1 }; }),
        ];
        const pool = { name: 'pool' };
        const now = () => T0;
        const watcher = createWatcher({ chain, pool, steps, intervalMs: 20000, now, log });
        const report = await watcher.runOnce();
        expect(order).toEqual(['operations', 'salvage', 'ownership']);
        const tip = { blockNo: 7, slot: 70, hash: 'ab'.repeat(32), time: T0 - 1000 };
        expect(report).toEqual({ tip, fresh: true, steps: { operations: { error: failure }, salvage: { credited: 0 }, ownership: { changed: 1 } } });
        for (const { run } of steps) {
            expect(run).toHaveBeenCalledWith({ pool, chain, now, tip, fresh: true, log, memory: {} });
        }
        // each step has a memory of its own, kept from run to run
        const memories = steps.map(({ run }) => run.mock.calls[0][0].memory);
        expect(new Set(memories).size).toBe(3);
        await watcher.runOnce();
        steps.forEach(({ run }, i) => expect(run.mock.calls[1][0].memory).toBe(memories[i]));
        // the failure is logged with the step's name; nothing else is
        expect(log.error).toHaveBeenCalledTimes(1);
        expect(log.error.mock.calls[0][0]).toContain('operations');
        expect(log.info).not.toHaveBeenCalled();
        expect(log.warn).not.toHaveBeenCalled();
    });

    test('fresh: the tip at most indexMaxLagMs old; a tip 11 minutes old with the default lag is not', async () => {
        let age = 10 * MINUTE;
        const chain = chainWith({ tip: async () => ({ blockNo: 7, slot: 70, hash: 'ab'.repeat(32), time: T0 - age }) });
        const watcher = createWatcher({ chain, pool: {}, steps: [], intervalMs: 20000, now: () => T0, log: silentLog() });
        expect((await watcher.runOnce()).fresh).toBe(true);
        age = 11 * MINUTE;
        expect((await watcher.runOnce()).fresh).toBe(false);
    });

    test('an index that cannot answer: no tip, not fresh, the steps still run (they decide what needs no chain)', async () => {
        const chain = chainWith({ tip: async () => { throw new IndexUnavailableError(); } });
        const ownership = step('ownership');
        const watcher = createWatcher({ chain, pool: {}, steps: [ownership], intervalMs: 20000, now: () => T0, log: silentLog() });
        const report = await watcher.runOnce();
        expect(report).toMatchObject({ tip: null, fresh: false, steps: { ownership: { name: 'ownership' } } });
        expect(ownership.run).toHaveBeenCalledWith(expect.objectContaining({ tip: null, fresh: false }));
        // before the first sync the index has no tip: not fresh either
        const empty = createWatcher({ chain: chainWith({ tip: async () => null }), pool: {}, steps: [], intervalMs: 20000, now: () => T0, log: silentLog() });
        expect(await empty.runOnce()).toEqual({ tip: null, fresh: false, steps: {} });
    });

    test('a stale or unavailable index is logged when it starts and when it ends, not at every run', async () => {
        let tip = async () => ({ blockNo: 7, slot: 70, hash: 'ab'.repeat(32), time: T0 });
        const chain = chainWith({ tip: () => tip() });
        const log = silentLog();
        const watcher = createWatcher({ chain, pool: {}, steps: [], intervalMs: 20000, now: () => T0, log });
        await watcher.runOnce();
        const lines = () => [...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls].length;
        expect(lines()).toBe(0);
        tip = async () => { throw new IndexUnavailableError(); };
        await watcher.runOnce();
        await watcher.runOnce();
        await watcher.runOnce();
        expect(log.warn).toHaveBeenCalledTimes(1);
        expect(log.warn.mock.calls[0][0]).toMatch(/index/);
        tip = async () => ({ blockNo: 8, slot: 90, hash: 'cd'.repeat(32), time: T0 });
        await watcher.runOnce();
        await watcher.runOnce();
        expect(log.info).toHaveBeenCalledTimes(1);
        expect(lines()).toBe(2);
    });

    test('a tip that fails with something else is logged and counts as no tip; the run still resolves', async () => {
        const chain = chainWith({ tip: async () => { throw new Error('a bug'); } });
        const log = silentLog();
        const watcher = createWatcher({ chain, pool: {}, steps: [step('ownership')], intervalMs: 20000, now: () => T0, log });
        expect(await watcher.runOnce()).toMatchObject({ tip: null, fresh: false });
        expect(log.error).toHaveBeenCalledTimes(1);
    });
});

describe('lasting failures', () => {
    // the lines of `log` whose first argument matches `pattern`, by level
    const linesOf = (log, pattern) => Object.fromEntries(['info', 'warn', 'error'].map(level => [level, log[level].mock.calls.filter(call => pattern.test(call[0])).length]));

    test('ensureViews, the tip and a step that keep failing are logged once, again when the message changes, and once when it clears', async () => {
        let viewsError = null;
        let tipError = null;
        let stepError = null;
        const chain = chainWith({
            ensureViews: async () => {
                if (viewsError) {
                    throw viewsError;
                }
                return false;
            },
            tip: async () => {
                if (tipError) {
                    throw tipError;
                }
                return { blockNo: 7, slot: 70, hash: 'ab'.repeat(32), time: T0 };
            },
        });
        const ownership = step('ownership', async () => {
            if (stepError) {
                throw stepError;
            }
            return {};
        });
        const log = silentLog();
        const watcher = createWatcher({ chain, pool: {}, steps: [ownership], intervalMs: 20000, now: () => T0, log });
        const runs = async count => {
            for (let i = 0; i < count; i++) {
                await watcher.runOnce();
            }
        };
        for (const [set, pattern] of [
            [error => { viewsError = error; }, /chain views/],
            [error => { tipError = error; }, /tip/],
            [error => { stepError = error; }, /step ownership/],
        ]) {
            set(new Error('permission denied'));
            await runs(3);
            expect(linesOf(log, pattern)).toEqual({ info: 0, warn: 0, error: 1 });
            expect(log.error.mock.calls.filter(call => pattern.test(call[0]))[0][1]).toMatchObject({ message: 'permission denied' });
            set(new Error('disk full'));
            await runs(3);
            expect(linesOf(log, pattern)).toEqual({ info: 0, warn: 0, error: 2 });
            set(null);
            await runs(3);
            expect(linesOf(log, pattern)).toEqual({ info: 1, warn: 0, error: 2 });
            // it can come back, and is logged again then
            set(new Error('disk full'));
            await runs(2);
            expect(linesOf(log, pattern)).toEqual({ info: 1, warn: 0, error: 3 });
            set(null);
            await runs(1);
            expect(linesOf(log, pattern)).toEqual({ info: 2, warn: 0, error: 3 });
        }
    });
});

describe('runs never overlap', () => {
    test('a runOnce while one runs gets the running one\'s promise; afterwards a new run starts', async () => {
        let release;
        const ownership = step('ownership', () => new Promise(resolve => { release = resolve; }));
        const watcher = createWatcher({ chain: chainWith(), pool: {}, steps: [ownership], intervalMs: 20000, now: () => T0, log: silentLog() });
        const first = watcher.runOnce();
        const second = watcher.runOnce();
        expect(second).toBe(first);
        await new Promise(resolve => setImmediate(resolve));
        release({ changed: 0 });
        await first;
        expect(ownership.run).toHaveBeenCalledTimes(1);
        const third = watcher.runOnce();
        expect(third).not.toBe(first);
        await new Promise(resolve => setImmediate(resolve));
        release({ changed: 0 });
        await third;
        expect(ownership.run).toHaveBeenCalledTimes(2);
    });
});

describe('the views of the index', () => {
    test('ensureViews is called at each run until it answers true, then no more', async () => {
        const answers = [false, false, true];
        const chain = chainWith({ ensureViews: async () => answers.shift() });
        const watcher = createWatcher({ chain, pool: {}, steps: [], intervalMs: 20000, now: () => T0, log: silentLog() });
        for (let i = 0; i < 5; i++) {
            await watcher.runOnce();
        }
        expect(chain.index.ensureViews).toHaveBeenCalledTimes(3);
        // and before the tip, in the same run
        expect(chain.index.ensureViews.mock.invocationCallOrder[0]).toBeLessThan(chain.index.tip.mock.invocationCallOrder[0]);
    });

    test('an ensureViews that throws is tried again at the next run', async () => {
        let calls = 0;
        const chain = chainWith({ ensureViews: async () => { calls += 1; if (calls === 1) throw new IndexUnavailableError(); return true; } });
        const watcher = createWatcher({ chain, pool: {}, steps: [], intervalMs: 20000, now: () => T0, log: silentLog() });
        await watcher.runOnce();
        await watcher.runOnce();
        await watcher.runOnce();
        expect(calls).toBe(2);
    });

    test('ready, then the index answers IndexUnavailableError once (its views were dropped): the next run makes them again', async () => {
        let unavailable = false;
        const chain = chainWith({
            ensureViews: async () => true,
            tip: async () => {
                if (unavailable) {
                    unavailable = false;
                    throw new IndexUnavailableError();
                }
                return { blockNo: 7, slot: 70, hash: 'ab'.repeat(32), time: T0 };
            },
        });
        const watcher = createWatcher({ chain, pool: {}, steps: [], intervalMs: 20000, now: () => T0, log: silentLog() });
        await watcher.runOnce();
        await watcher.runOnce();
        expect(chain.index.ensureViews).toHaveBeenCalledTimes(1);
        unavailable = true;
        await watcher.runOnce();
        expect(chain.index.ensureViews).toHaveBeenCalledTimes(1);
        await watcher.runOnce();
        expect(chain.index.ensureViews).toHaveBeenCalledTimes(2);
        await watcher.runOnce();
        expect(chain.index.ensureViews).toHaveBeenCalledTimes(2);
    });

    test('a step that meets an unavailable index also makes the next run call ensureViews', async () => {
        let fail = false;
        const chain = chainWith({ ensureViews: async () => true });
        const ownership = step('ownership', async () => {
            if (fail) {
                fail = false;
                throw new IndexUnavailableError();
            }
            return {};
        });
        const watcher = createWatcher({ chain, pool: {}, steps: [ownership], intervalMs: 20000, now: () => T0, log: silentLog() });
        await watcher.runOnce();
        fail = true;
        await watcher.runOnce();
        await watcher.runOnce();
        expect(chain.index.ensureViews).toHaveBeenCalledTimes(2);
    });

    test('an index without ensureViews (the chain double) is never asked for it', async () => {
        const watcher = createWatcher({ chain: chainWith(), pool: {}, steps: [], intervalMs: 20000, now: () => T0, log: silentLog() });
        expect((await watcher.runOnce()).fresh).toBe(true);
    });
});

describe('start and stop', () => {
    test('start runs at once and every intervalMs, its timer does not keep the process alive; stop ends it', async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] });
        try {
            const ownership = step('ownership');
            const watcher = createWatcher({ chain: chainWith(), pool: {}, steps: [ownership], intervalMs: 20000, now: () => T0, log: silentLog() });
            const stop = watcher.start();
            await new Promise(resolve => setImmediate(resolve));
            expect(ownership.run).toHaveBeenCalledTimes(1);
            expect(jest.getTimerCount()).toBe(1);
            await jest.advanceTimersByTimeAsync(20000);
            expect(ownership.run).toHaveBeenCalledTimes(2);
            await jest.advanceTimersByTimeAsync(40000);
            expect(ownership.run).toHaveBeenCalledTimes(4);
            stop();
            expect(jest.getTimerCount()).toBe(0);
            await jest.advanceTimersByTimeAsync(60000);
            expect(ownership.run).toHaveBeenCalledTimes(4);
        } finally {
            jest.useRealTimers();
        }
    });

    test('the timer is unref\'d, and a run that fails never becomes an unhandled rejection', async () => {
        const unref = jest.fn();
        const timer = { unref };
        const setTimer = jest.spyOn(global, 'setInterval').mockReturnValue(timer);
        const clear = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
        try {
            const log = silentLog();
            // a log that throws inside the run: the run's own catch must still hold
            const chain = chainWith({ tip: async () => { throw new Error('a bug'); } });
            log.error.mockImplementationOnce(() => { throw new Error('the log broke'); });
            const watcher = createWatcher({ chain, pool: {}, steps: [], intervalMs: 20000, now: () => T0, log });
            const rejections = [];
            const onRejection = reason => rejections.push(reason);
            process.on('unhandledRejection', onRejection);
            try {
                const stop = watcher.start();
                expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 20000);
                expect(unref).toHaveBeenCalledTimes(1);
                await new Promise(resolve => setTimeout(resolve, 20));
                stop();
                expect(clear).toHaveBeenCalledWith(timer);
            } finally {
                process.removeListener('unhandledRejection', onRejection);
            }
            expect(rejections).toEqual([]);
        } finally {
            setTimer.mockRestore();
            clear.mockRestore();
        }
    });

    test('a real start and stop leave no open handle', async () => {
        const watcher = createWatcher({ chain: chainWith(), pool: {}, steps: [step('ownership')], intervalMs: 20000, now: () => T0, log: silentLog() });
        const stop = watcher.start();
        await watcher.runOnce();
        stop();
    });
});
