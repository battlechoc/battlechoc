// Runs tasks one at a time per key (a player): purchases and equipment changes of one player never
// interleave. Works within one API process, which is how the API runs.
const createKeyedQueue = () => {
    const queues = new Map();
    return (key, task) => {
        const previous = queues.get(key) || Promise.resolve();
        const next = previous.catch(() => {}).then(task);
        queues.set(key, next);
        next.catch(() => {}).finally(() => {
            if (queues.get(key) === next) {
                queues.delete(key);
            }
        });
        return next;
    };
};

module.exports = { createKeyedQueue };
