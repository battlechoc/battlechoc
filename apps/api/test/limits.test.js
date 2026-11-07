// The in-memory limits: they must keep limiting, and they must forget the keys (client addresses,
// players) that are no longer in a window instead of growing for as long as the process runs.

const { fixedWindowLimit, slidingWindowLimit } = require('../src/limits');
const { rateLimit } = require('../src/middleware');
const { HttpError } = require('../src/errors');
const { Lobby } = require('../src/live/lobby');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

describe('fixed window (requests per address)', () => {
    test('allows `max` per window and key, then again in the next window', () => {
        let time = 1000;
        const limit = fixedWindowLimit({ windowMs: MINUTE, max: 2, now: () => time });
        expect([limit.allow('a'), limit.allow('a'), limit.allow('a'), limit.allow('b')]).toEqual([true, true, false, true]);
        time += MINUTE + 1;
        expect(limit.allow('a')).toBe(true);
    });

    test('forgets the addresses whose window is over', () => {
        let time = 1000;
        const limit = fixedWindowLimit({ windowMs: MINUTE, max: 5, now: () => time });
        for (let i = 0; i < 1000; i++) {
            limit.allow(`10.0.${Math.floor(i / 250)}.${i % 250}`);
        }
        expect(limit.size).toBe(1000);
        time += 30 * 1000;
        limit.allow('late');
        // nothing is over yet
        expect(limit.size).toBe(1001);
        time += 31 * 1000;
        limit.allow('next');
        // the thousand are gone; "late" is still in its window
        expect(limit.size).toBe(2);
        expect(limit.allow('late')).toBe(true);
    });

    test('the middleware answers 429 over the limit and keeps no address for ever', () => {
        let time = 1000;
        const limit = rateLimit({ windowMs: MINUTE, max: 1, now: () => time });
        const request = ip => {
            const next = jest.fn();
            limit({ ip }, {}, next);
            return next;
        };
        expect(request('1.1.1.1')).toHaveBeenCalledTimes(1);
        let thrown;
        try {
            request('1.1.1.1');
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(HttpError);
        expect(thrown).toMatchObject({ status: 429, code: 'TOO MANY REQUESTS' });
        request('2.2.2.2');
        expect(limit.size).toBe(2);
        time += 2 * MINUTE;
        request('3.3.3.3');
        expect(limit.size).toBe(1);
    });
});

describe('sliding window (lab tries per player)', () => {
    test('allows `max` within any window of the length', () => {
        let time = 1000;
        const limit = slidingWindowLimit({ windowMs: HOUR, max: 2, now: () => time });
        expect(limit.allow('p')).toBe(true);
        time += 40 * MINUTE;
        expect(limit.allow('p')).toBe(true);
        expect(limit.allow('p')).toBe(false);
        // the first try is over an hour ago, the second is not
        time += 21 * MINUTE;
        expect(limit.allow('p')).toBe(true);
        expect(limit.allow('p')).toBe(false);
        expect(limit.allow('q')).toBe(true);
    });

    test('forgets the players who have not tried for a window', () => {
        let time = 1000;
        const limit = slidingWindowLimit({ windowMs: HOUR, max: 30, now: () => time });
        for (let i = 0; i < 500; i++) {
            limit.allow(`player-${i}`);
        }
        expect(limit.size).toBe(500);
        time += 30 * MINUTE;
        limit.allow('regular');
        time += 31 * MINUTE;
        limit.allow('newcomer');
        expect(limit.size).toBe(2);
        // a refused try is not counted, so a player over the limit is forgotten as well
        const strict = slidingWindowLimit({ windowMs: HOUR, max: 1, now: () => time });
        strict.allow('p');
        expect(strict.allow('p')).toBe(false);
        time += HOUR + 1;
        strict.allow('other');
        expect(strict.size).toBe(1);
    });
});

describe('timers of the lobby', () => {
    // a clock whose timers are objects like Node's, to see what happens to them
    const stubClock = () => {
        const timers = new Set();
        return {
            timers,
            now: () => 0,
            setTimer: fn => {
                const timer = { fn, unref: jest.fn() };
                timers.add(timer);
                return timer;
            },
            clearTimer: timer => timers.delete(timer),
        };
    };
    const endedRoom = id => ({ id, humanIndexes: () => [], write: () => Promise.resolve(), suspend: () => Promise.resolve() });

    test('the timer that forgets an ended room does not keep the process alive and is cleared on shutdown', async () => {
        const clock = stubClock();
        const lobby = new Lobby({ pool: null, store: null, clock, config: { endedRoomLingerMs: 1000 }, log: console });
        const [first, second] = [endedRoom('m1'), endedRoom('m2')];
        [first, second].forEach(room => lobby.rooms.set(room.id, room));
        lobby.matchEnded(first);
        const timer = lobby.lingering.get('m1');
        expect([...clock.timers]).toEqual([timer]);
        expect(timer.unref).toHaveBeenCalledTimes(1);
        // the end of a match processed again (as after a restart) replaces the timer
        lobby.matchEnded(first);
        expect([...clock.timers]).toEqual([lobby.lingering.get('m1')]);
        expect(lobby.lingering.get('m1')).not.toBe(timer);

        // a timer that falls due forgets its room
        lobby.matchEnded(second);
        const due = lobby.lingering.get('m2');
        clock.timers.delete(due);
        due.fn();
        expect(lobby.rooms.has('m2')).toBe(false);
        expect(lobby.lingering.has('m2')).toBe(false);
        expect(lobby.rooms.has('m1')).toBe(true);

        await lobby.shutdown();
        expect(clock.timers.size).toBe(0);
        expect(lobby.lingering.size).toBe(0);
    });
});
