const { live } = require('../../index');

describe('ClockSync', () => {
    test('keeps the offset of the round trip with the lowest latency', () => {
        const clock = new live.ClockSync({ samples: 4 });
        // the server is 5000 ms ahead
        clock.sample(1000, 6100, 1200); // rtt 200, offset 5000
        clock.sample(2000, 7030, 2040); // rtt 40, offset 5010
        clock.sample(3000, 8300, 3400); // rtt 400, offset 5100
        expect(clock.rtt).toBe(40);
        expect(clock.offset).toBe(5010);
        expect(clock.serverNow(4000)).toBe(9010);
        expect(clock.matchTime(8000, 4000)).toBe(1010);
        expect(clock.matchTime(20000, 4000)).toBe(0);
    });

    test('forgets old samples', () => {
        const clock = new live.ClockSync({ samples: 2 });
        clock.sample(0, 100, 10);
        clock.sample(100, 1200, 200);
        clock.sample(200, 1300, 300);
        expect(clock.rtt).toBe(100);
        expect(clock.offset).toBe(1050);
    });

    test('piggy-backed server times only correct an offset that is clearly behind', () => {
        const clock = new live.ClockSync({ correctionMs: 100 });
        clock.observe(5000, 1000);
        expect(clock.offset).toBe(4000);
        clock.sample(1000, 5040, 1080);
        expect(clock.offset).toBe(4000);
        // arrived later than estimated: plain latency, no correction
        clock.observe(5500, 1600);
        expect(clock.offset).toBe(4000);
        clock.observe(5650, 1600);
        expect(clock.offset).toBe(4000);
        // the server time is 300 ms ahead of our estimate: the offset was too small
        clock.observe(5900, 1600);
        expect(clock.offset).toBe(4300);
        clock.sample(2000, NaN, 2010);
        clock.sample(3000, 7000, 2990);
        expect(clock.samples).toHaveLength(1);
    });
});
