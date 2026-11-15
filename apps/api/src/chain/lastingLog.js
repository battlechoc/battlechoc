// Conditions that can last for many runs of the watcher (one every 20 s): a step that keeps
// failing, items the ownership sync keeps leaving alone. Each is logged when it appears, again only
// when what it says changes (a count, an error's message), and once more when it clears; never at
// every run.

/**
 * The lasting conditions kept in `memory` (an object that lives from run to run; under each
 * condition's `name` it holds what was logged last, null once it cleared):
 * - `report(name, content, write)` calls `write()` (which logs the condition) when `content` (a
 *   string) differs from what was last logged under `name`;
 * - `clear(name, write)` calls `write()` (which logs that it cleared) when something is logged
 *   under `name` and has not cleared yet.
 */
const lastingLog = memory => ({
    report: (name, content, write) => {
        if (memory[name] !== content) {
            memory[name] = content;
            write();
        }
    },
    clear: (name, write) => {
        if (typeof memory[name] === 'string') {
            memory[name] = null;
            write();
        }
    },
});

/** What a failure says, for `report`: its message (not its stack, which differs between runs). */
const messageOf = error => String(error?.message ?? error);

module.exports = { lastingLog, messageOf };
