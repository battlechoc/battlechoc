// Deletes what is kept only for a while: spoiled and used-up ingredient batches, and problem
// reports after 60 days. One failing cleanup does not stop the others.

const pantry = require('./pantry');
const reports = require('./reports');

const CLEANUPS = { pantry: pantry.cleanup, reports: reports.cleanup };

/** Cleans up now and then every `intervalMs`; returns a stop function. */
const scheduleCleanup = (pool, { intervalMs = 60 * 60 * 1000, log = console } = {}) => {
    const run = () => Promise.all(Object.entries(CLEANUPS).map(([name, cleanup]) =>
        cleanup(pool, Date.now()).catch(error => log.error(`${name} cleanup failed`, error))));
    run();
    const timer = setInterval(run, intervalMs);
    if (typeof timer.unref === 'function') {
        timer.unref();
    }
    return () => clearInterval(timer);
};

module.exports = { scheduleCleanup };
