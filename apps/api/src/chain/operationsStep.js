// The watcher's step `operations` (spec 6.2, minting plan D): at each run it moves the open chain
// operations along (chain/ops.js, each move a compare-and-set). It runs before the ownership sync,
// so a mint that landed is a minted item, and one whose block was rolled back a plain item again,
// before the sync looks at the minted items.
//
// Per operation, oldest first:
// - prepared: past its sign window, expired ('not-signed'). That needs no chain (the server signs
//   last: a transaction it has not signed cannot land), so it happens on a stale index too.
// Everything else is decided on a fresh index only (a stale or unreachable one decides nothing):
// - included, the index has it in the same block: final once that block is K_FINAL deep;
// - included, the index does not have it (its block was rolled back) or has it in another block
//   (rolled back and included again): submitted again, then judged as submitted, so that the
//   depth always counts from the block the transaction is really in. An inclusion and a rollback
//   clear the noted tip beyond the ttl (it was noted on a fork that is gone), so the run of a
//   rollback can at most note a new one, never expire on the old one;
// - submitted, the index has it: included (a mint's item becomes a minted item; a burn changes no
//   item here, plan E's credit does), final at once if it is K_FINAL deep already;
// - submitted, not in the index, the tip before the ttl (the ttl is exclusive: the transaction can
//   land while tip.slot < ttl): submitted again at most once a minute (a node's mempool forgets);
// - submitted, not in the index, the tip at or past the ttl: the first such tip is noted
//   (ttl_passed_block); K_FINAL blocks past it the operation expires: the transaction can then
//   provably no longer land (only a rollback deeper than K_FINAL could bring a block from before
//   the ttl that holds it). 'rejected' if the network refused it and took no submit since, else
//   'expired'. A rollback that has the tip before the ttl again clears the noted tip.
//   The expiry is irreversible (the item is free again: a second mint would make a second token
//   for it, a burn that landed after all would leave a usable item whose token is gone), so the
//   index alone never decides it: the provider is asked for the user token first, once a run for
//   each operation the index's rule would expire, and the expiry happens only when its answer says
//   the transaction did not land: for a mint, nobody holds the token; for a burn (plan E) the
//   mirror, the token is still held. A provider that cannot answer leaves the operation for the
//   next run (no failure), and the run asks it no more. An answer that says it landed (a mint's
//   token held, a burn's gone) where the index has no such transaction means the index misses
//   them (its filters, or a sync that skipped blocks): the operation stays submitted (the item
//   minting, or burning) and that is logged once as an error, one line for mints and one for
//   burns. A burn's token can also be gone because another transaction burned it (the holder may
//   burn alone, outside the game): the index's burns of the token decide then. Another burn
//   K_FINAL deep (the server's one depth rule) ends ours expired with the error
//   'burned-elsewhere' (its input is spent for good; the credit step credits the other burn);
//   one less deep, or ours in the index's burns, decides nothing this run; no burn known is the
//   index missing ours, the lasting line. What an operator does then: fix the index (deploy/chain/application-plugins.yml's
//   filters, a sync from before the transaction's block), never the operation; once the index has
//   the transaction, the next run includes it (and finalises it when it is deep enough) as any
//   other.
//
// One operation's failure (the provider, a database error) does not stop the others: it is
// counted, logged when it starts and when it changes (lastingLog), and tried again at the next
// run. A step another process (a second API process, a request) took first is the expected loser
// of a safe race, no failure: the operation is read again at the next run. After the first
// provider failure that is no answer (busy, unavailable, unauthorized, a timeout) a run sends no
// more resubmits: each could wait for the provider's timeout. An index that cannot answer ends
// the chain's part of the run: the remaining operations get only the unsigned expiry, and the step
// then throws, so the watcher logs it and makes the index's views again. No log line holds a
// transaction's bytes.

const ops = require('./ops');
const { ProviderError } = require('./provider');
const { IndexUnavailableError } = require('./indexUnavailable');
const { lastingLog, reasonOf: failureReasonOf } = require('./lastingLog');

/** The most operations one run looks at; the next run goes on after the last of them. */
const MAX_PER_RUN = 200;
/** How long after a submit the watcher submits a transaction that is not in a block again. */
const RESUBMIT_AFTER_MS = 60 * 1000;
// the most characters of a reason noted or logged
const MAX_REASON = 300;

/** What went wrong, as noted and logged (lastingLog.js reasonOf): '<code>: <reason>', bytes cut. */
const reasonOf = error => failureReasonOf(error, MAX_REASON);

/** A step another process (or request) took first: no failure, the operation is read again at the next run. */
class MovedOnError extends Error {
    constructor(step) {
        super(`${step}: the operation had moved on meanwhile`);
        this.name = 'MovedOnError';
    }
}

// the row a step returned; null means another process moved the operation first
const moved = (step, row) => {
    if (row === null) {
        throw new MovedOnError(step);
    }
    return row;
};

const timeOf = value => (value === null ? 0 : new Date(value).getTime());

/**
 * The watcher step: { expired, included, rolledBack, final, resubmitted, failed }. `expired`: the
 * operations that ended expired (unsigned or submitted); `included`, `rolledBack`, `final`: the
 * moves of that name; `resubmitted`: the submits the network answered (accepted, or refused: a
 * node that has the transaction already refuses it too); `failed`: the operations whose move
 * failed (a provider that could not answer a submit, a database error), tried again at the next
 * run; a step another process took first counts nowhere. Context as the watcher gives it: `now` the clock (a
 * function, ms; read once), `tip` and `fresh` the index's, `memory` the step's own (where the next
 * run goes on, the lasting log lines); `limit` the most operations of a run (MAX_PER_RUN).
 */
const advanceOperations = async ({ pool, chain, now, tip, fresh, log = console, memory = {}, limit = MAX_PER_RUN }) => {
    const at = now();
    const result = { expired: 0, included: 0, rolledBack: 0, final: 0, resubmitted: 0, failed: 0 };
    const rows = await ops.openOperations(pool, { after: memory.after ?? null, limit });
    // a full page: the next run goes on after its last operation; else it starts from the oldest
    const last = rows[rows.length - 1];
    memory.after = rows.length === limit ? { createdAt: last.created_at, id: last.id } : null;

    let chainDown = null;
    let failure = null;
    let failures = 0;
    // the first resubmit of this run that got no answer (then no more are sent)
    let submitFailure = null;
    let submitAnswered = false;

    const isFinal = row => tip.blockNo - row.included_block >= chain.kFinal;

    const finalise = async row => {
        if (isFinal(row)) {
            moved('final', await ops.markFinal(pool, row, at));
            result.final += 1;
        }
    };

    const resubmit = async row => {
        if (submitFailure !== null) {
            return;
        }
        let error = null;
        try {
            await chain.provider.submit(row.signed_cbor);
        } catch (caught) {
            error = caught;
        }
        const rejected = error instanceof ProviderError && error.code === 'rejected';
        moved('note the submit', await ops.noteSubmit(pool, row, { now: at, error: error === null ? null : reasonOf(error), rejected }));
        if (error === null || rejected) {
            result.resubmitted += 1;
            submitAnswered = true;
        } else {
            result.failed += 1;
            submitFailure = reasonOf(error);
        }
    };

    // operations the index's rule would expire that the provider's answer says landed (a mint
    // whose user token it sees, a burn whose user token it does not); whether the provider could
    // not say for one (then the lasting lines are not cleared: nothing is over yet)
    const notIndexed = { mint: [], burn: [] };
    let undecided = false;

    // whether the provider sees the user token of `row` ('held', 'none'), or cannot say ('unknown';
    // also, without asking, once the provider gave no answer this run: each call could wait for its
    // timeout). Held is the evidence that a mint landed and that a burn did not.
    const tokenOnChain = async row => {
        if (undecided || submitFailure !== null) {
            return 'unknown';
        }
        try {
            return (await chain.provider.utxoByUnit(chain.policyId + row.asset_name)) === undefined ? 'none' : 'held';
        } catch (error) {
            if (error instanceof ProviderError) {
                return 'unknown';
            }
            throw error;
        }
    };

    // For a burn `row` whose token the provider no longer sees, the index's burns of its token:
    // 'final' when another transaction burned it K_FINAL deep (ours can never land: its input is
    // spent for good); 'undecided' when another transaction burned it less deep (a rollback may
    // still undo that burn), or when the index has ours (then it is ours, and the next run that
    // finds the transaction includes it); 'none' when the index knows no burn of it (it misses ours).
    // One call of the index, only for an operation in this branch.
    const burnedElsewhere = async row => {
        const burns = await chain.index.burnsOf([row.asset_name]);
        if (burns.some(entry => entry.txHash === row.tx_hash)) {
            return 'undecided';
        }
        const others = burns.filter(entry => entry.assetName === row.asset_name);
        if (others.some(entry => tip.blockNo - entry.block >= chain.kFinal)) {
            return 'final';
        }
        return others.length > 0 ? 'undecided' : 'none';
    };

    const advanceSubmitted = async (row, found) => {
        if (found) {
            const included = moved('include', await ops.markIncluded(pool, row, { blockNo: found.blockNo, now: at }));
            result.included += 1;
            await finalise(included);
            return;
        }
        if (tip.slot < row.ttl_slot) {
            const current = row.ttl_passed_block === null ? row : moved('clear the ttl', await ops.noteTtlPassed(pool, row, null));
            if (at - timeOf(current.last_submit_at) >= RESUBMIT_AFTER_MS) {
                await resubmit(current);
            }
            return;
        }
        const passed = row.ttl_passed_block === null ? moved('note the ttl', await ops.noteTtlPassed(pool, row, tip.blockNo)) : row;
        if (tip.blockNo - passed.ttl_passed_block >= chain.kFinal) {
            const token = await tokenOnChain(passed);
            undecided = undecided || token === 'unknown';
            if (token === 'unknown') {
                return;
            }
            const burn = passed.kind === 'burn';
            const landed = burn ? token === 'none' : token === 'held';
            let because = null;
            if (landed && burn) {
                // the token is gone: ours, or another transaction burned it (the holder may burn alone)
                const elsewhere = await burnedElsewhere(passed);
                if (elsewhere === 'undecided') {
                    undecided = true;
                    return;
                }
                because = elsewhere === 'final' ? ops.BURNED_ELSEWHERE : null;
            }
            if (landed && because === null) {
                notIndexed[burn ? 'burn' : 'mint'].push(passed.id);
                return;
            }
            moved('expire', await ops.expireSubmitted(pool, passed, at, { because }));
            result.expired += 1;
        }
    };

    const advance = async op => {
        if (op.state === 'prepared') {
            if (new Date(op.sign_until).getTime() <= at) {
                moved('expire unsigned', await ops.expireUnsigned(pool, op, at));
                result.expired += 1;
            }
            return;
        }
        if (!fresh || chainDown) {
            return;
        }
        const found = await chain.index.transaction(op.tx_hash);
        if (op.state === 'included') {
            if (found && found.blockNo === op.included_block) {
                await finalise(op);
                return;
            }
            // rolled back; or rolled back and included again at another block since the last run
            const rolledBack = moved('roll back', await ops.markRolledBack(pool, op));
            result.rolledBack += 1;
            await advanceSubmitted(rolledBack, found);
            return;
        }
        await advanceSubmitted(op, found);
    };

    for (const op of rows) {
        try {
            await advance(op);
        } catch (error) {
            if (error instanceof IndexUnavailableError) {
                chainDown = error;
                continue;
            }
            if (error instanceof MovedOnError) {
                continue;
            }
            result.failed += 1;
            failures += 1;
            failure = failure || error;
        }
    }

    const changes = ['included', 'rolledBack', 'final', 'expired'].filter(name => result[name] > 0);
    if (changes.length > 0) {
        log.info(`watcher: operations: ${changes.map(name => `${result[name]} ${name}`).join(', ')}`);
    }
    const lasting = lastingLog(memory);
    if (submitFailure !== null) {
        lasting.report('submit', submitFailure, () =>
            log.warn('watcher: operations: a signed transaction could not be submitted again, the next run tries again', { reason: submitFailure })
        );
    } else if (submitAnswered) {
        lasting.clear('submit', () => log.info('watcher: operations: submitting works again'));
    }
    if (notIndexed.mint.length > 0) {
        lasting.report('notIndexed', notIndexed.mint.join(' '), () =>
            log.error('watcher: operations: the index does not have a mint the provider sees: check the index\'s filters; the operations stay submitted', { operations: notIndexed.mint })
        );
    } else if (fresh && !chainDown && !undecided) {
        lasting.clear('notIndexed', () => log.info('watcher: operations: the index has every mint the provider sees again'));
    }
    if (notIndexed.burn.length > 0) {
        lasting.report('burnNotIndexed', notIndexed.burn.join(' '), () =>
            log.error('watcher: operations: the index does not have a burn the provider sees (the token is gone): check the index\'s filters; the operations stay submitted', {
                operations: notIndexed.burn,
            })
        );
    } else if (fresh && !chainDown && !undecided) {
        lasting.clear('burnNotIndexed', () => log.info('watcher: operations: the index has every burn the provider sees again'));
    }
    if (failures > 0) {
        const reason = reasonOf(failure);
        lasting.report('failed', `${failures}: ${reason}`, () =>
            log.error(`watcher: operations: ${failures} of ${rows.length} open operations failed, the next run tries again`, { reason })
        );
    } else if (fresh && !chainDown) {
        // while the index is stale or down most operations were not looked at: nothing is over yet
        lasting.clear('failed', () => log.info('watcher: operations: no operation fails any more'));
    }
    if (chainDown) {
        throw chainDown;
    }
    return result;
};

const operationsStep = Object.freeze({ name: 'operations', run: advanceOperations });

module.exports = { MAX_PER_RUN, RESUBMIT_AFTER_MS, advanceOperations, operationsStep };
