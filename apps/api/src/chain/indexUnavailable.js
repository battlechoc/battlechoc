// The chain index cannot answer: a view is missing, the database cannot be reached, or the read
// role lacks a right. Whoever asks changes nothing on such an answer (no item leaves anybody
// because the indexer is down or resyncing).

class IndexUnavailableError extends Error {
    constructor(message = 'the chain index is unavailable', options) {
        super(message, options);
        this.name = 'IndexUnavailableError';
    }
}

module.exports = { IndexUnavailableError };
