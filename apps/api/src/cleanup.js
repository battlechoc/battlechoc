// Deletes what is kept only for a while: spoiled and used-up ingredient batches, problem
// reports after 60 days, and sign-in challenges nobody used in time. One failing cleanup does not stop the others.
//
// Matches are kept for ever by default. Only when the operator sets a retention
// (MATCH_RETENTION_DAYS, config.js) the logged actions and the snapshot of a match are removed
// that many days after it was over; the match row with players and outcome stays.

const pantry = require('./pantry');
const reports = require('./reports');
const { createMatchStore } = require('./live/store');
const { cleanupChallenges } = require('./cardano');
const { cleanupLinkCodes } = require('./linkCodes');

const DAY_MS = 24 * 60 * 60 * 1000;

const trimMatches = (days, log) => async (pool, now) => {
    const trimmed = await createMatchStore(pool).trimEndedBefore(new Date(now - days * DAY_MS), new Date(now));
    if (trimmed > 0) {
        log.info(`match retention: removed actions and snapshots of ${trimmed} matches over for more than ${days} days`);
    }
};

/**
 * Cleans up now and then every `intervalMs`; returns a stop function. `matchRetentionDays`
 * (default: none, matches are not touched) turns the match retention on.
 */
const scheduleCleanup = (pool, { intervalMs = 60 * 60 * 1000, log = console, matchRetentionDays } = {}) => {
    const cleanups = {
        pantry: pantry.cleanup,
        reports: reports.cleanup,
        challenges: cleanupChallenges,
        linkCodes: cleanupLinkCodes,
        ...(matchRetentionDays > 0 ? { matches: trimMatches(matchRetentionDays, log) } : {}),
    };
    const run = () => Promise.all(Object.entries(cleanups).map(([name, cleanup]) =>
        cleanup(pool, Date.now()).catch(error => log.error(`${name} cleanup failed`, error))));
    run();
    const timer = setInterval(run, intervalMs);
    if (typeof timer.unref === 'function') {
        timer.unref();
    }
    return () => clearInterval(timer);
};

module.exports = { scheduleCleanup };
