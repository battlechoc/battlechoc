// Waiting in tests. Prefer `until` on something that can be observed over a fixed `sleep`: a
// sleep is either too short on a slow machine (CI) or wastes time everywhere else.

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Resolves as soon as `condition()` (sync or async) holds; rejects after `timeoutMs` with a
 * message that says what it was waiting for.
 */
const until = async (condition, what = 'the condition', timeoutMs = 3000) => {
    const end = Date.now() + timeoutMs;
    while (!(await condition())) {
        if (Date.now() > end) {
            throw new Error(`timeout waiting for ${what}`);
        }
        await sleep(5);
    }
};

module.exports = { sleep, until };
