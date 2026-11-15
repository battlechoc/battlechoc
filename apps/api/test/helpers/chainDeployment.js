// Plan B's fixture deployment on plan C's chain double (minting plan D), without Jest: the API
// tests (helpers/chainApp.js) and the browser tests' API (test/e2eServer.js, plain node) put the
// same chain together here.
//
// The double reads what `submit` and `queue` get with `describeTx` (default: the real CBOR reader
// of helpers/describeTx.js), and the JSON transactions of jsonTx (the double's own tests, and the
// config changes below) as JSON. The config UTxO of fixtureContracts sits at the config address
// with the config NFT and its inline datum, in the first block after the genesis block, so plan
// B's readConfig finds it by the NFT (CHAIN_CONFIG_POLICY_ID, `configPolicyId` below) or by its
// reference (`configRef`). Its server key is fixtureKey('server')'s unless `serverKeys` says
// otherwise; its fees default to the preprod fee (one ADA option of 1, 2 and 4 ADA by tier).

const crypto = require('crypto');
const { Address, Data } = require('@evolution-sdk/evolution');
const { EmptyPlayerStats, PlayerType, engine } = require('@battlechoc/battlechoc-shared-functions');
const { createChainDouble, describeJsonTx, jsonTx } = require('../chainDouble');
const { CONFIG_TOKEN_NAME } = require('../../src/chain/blueprint');
const { creditVerifiedMatch, rateAiMatch } = require('../../src/rewards');
const players = require('../../src/players');
const { fixtureContracts } = require('./chain');
const { describeTx: describeCborTx } = require('./describeTx');

const CONFIG_LOVELACE = '2000000';

// a JSON transaction of jsonTx is the hex of '{…}'; a real transaction's CBOR starts with 0x84
const isJsonTx = cborHex => typeof cborHex === 'string' && cborHex.startsWith('7b');

// the settings of fixtureContracts that a config datum says: what is left out is the fixture's default
const settingsOf = ({ paused, fees, serverKeys } = {}) => ({
    paused: paused ?? false,
    ...(fees === undefined ? {} : { fees }),
    ...(serverKeys === undefined ? {} : { serverKeys }),
});

/**
 * A chain double for the items policy `policyId` with the fixture deployment's config on it.
 * Options: `now` (the clock of the double, default the real one), `slotsPerBlock`, `describeTx`
 * (how a submitted transaction that is not JSON is read), `fees`, `paused`, `serverKeys` (the
 * deployment's config datum, as fixtureContracts takes them), `config: false` (no config on the
 * chain), `beforeBlock()` (called before each block of `block`: a test clock moves there).
 *
 * { double, contracts (fixtureContracts of the deployment's settings), configPolicyId,
 * configUnit, configRef (the first config UTxO's "<txHash>#<index>", or zeros #0 without a
 * config), currentConfig(), configWaiting(), block(count) (the tip after `count` blocks),
 * setConfig(settings), removeConfig(), restoreConfig() }.
 *
 * The config is found on the double by the config NFT's unit (as readConfig finds it by
 * CHAIN_CONFIG_POLICY_ID), in the blocks, read from the double's ledger (not through its
 * provider, so no fault of fail() stops it): whatever a rollback left there counts, not where
 * this helper put it last. currentConfig() → { at: { txHash, index }, datum (CBOR hex) } of the
 * output that holds the NFT now, null when no output holds it. configWaiting(): whether a waiting
 * transaction moves, makes or burns the NFT.
 *
 * setConfig({ paused, fees, serverKeys }) is an admin update that REPLACES the datum: the config
 * NFT moves to a new UTxO with that datum, in a block; what `settings` leaves out is the
 * deployment's setting (`serverKeys`) or the fixture's default (not paused, the preprod fee), not
 * what the config said before. removeConfig() burns the NFT: no config any more. Both throw when
 * no output holds the NFT. restoreConfig() puts the deployment's datum back when the double holds
 * another one (one block) or none (a new config output, one block): true when it changed
 * something, false (no block) when the deployment's datum is there.
 */
const createDeployedChain = ({ policyId, now = () => Date.now(), slotsPerBlock, describeTx = describeCborTx, fees, paused = false, serverKeys, config = true, beforeBlock = () => {} } = {}) => {
    const read = cborHex => (isJsonTx(cborHex) ? describeJsonTx(cborHex) : describeTx(cborHex));
    const double = createChainDouble({ policyId, now, ...(slotsPerBlock === undefined ? {} : { slotsPerBlock }), describeTx: read });

    const deployed = { fees, paused, serverKeys };
    const contracts = fixtureContracts(settingsOf(deployed));
    const configUnit = contracts.configPolicyId + CONFIG_TOKEN_NAME;
    const configAddress = Address.toBech32(contracts.configUtxo.address);
    // the datum of `settings`, the deployment's server keys unless they name others
    const datumOf = settings => Data.toCBORHex(fixtureContracts(settingsOf({ serverKeys, ...settings })).configUtxo.datumOption.data);
    const deployedDatum = datumOf(deployed);

    const block = (count = 1) => {
        for (let i = 0; i < count; i++) {
            beforeBlock();
            double.produceBlocks();
        }
        return double.tip();
    };

    // a new output with the config NFT (made from nothing, as the deployment made it) and `datum`, in a block
    const placeConfig = datum => {
        const at = double.fund(configAddress, CONFIG_LOVELACE, { [configUnit]: '1' }, { inlineDatum: datum });
        block();
        return at;
    };
    const first = config ? placeConfig(deployedDatum) : null;
    const configRef = first ? `${first.txHash}#${first.index}` : `${'00'.repeat(32)}#0`;

    // read from the double's own ledger, not through its provider: a fault a test arranged with
    // fail() does not stop a config change or a reset
    const currentConfig = async () => {
        const [holding] = double.unspentHolding(configUnit);
        return holding ? { at: { txHash: holding.txHash, index: holding.index }, datum: holding.output.inlineDatum ?? null } : null;
    };
    /** Whether a waiting transaction moves, makes or burns the config NFT (it would land on top of a restored config). */
    const configWaiting = () => double.waitingTransactions().some(tx => tx.mint[configUnit] !== undefined || tx.outputs.some(output => output.assets[configUnit] !== undefined));
    const configTx = async ({ outputs, mint = {} }) => {
        const current = await currentConfig();
        if (!current) {
            throw new Error('createDeployedChain: there is no config to change');
        }
        const txHash = crypto.randomBytes(32).toString('hex');
        await double.submit(jsonTx({ txHash, ttlSlot: null, inputs: [current.at], outputs, mint }));
        block();
        return txHash;
    };
    const setConfig = async (settings = {}) => {
        await configTx({ outputs: [{ address: configAddress, lovelace: CONFIG_LOVELACE, assets: { [configUnit]: '1' }, inlineDatum: datumOf(settings) }] });
    };
    const removeConfig = async () => {
        await configTx({ outputs: [], mint: { [configUnit]: '-1' } });
    };
    const restoreConfig = async () => {
        const current = await currentConfig();
        if (current && current.datum === deployedDatum) {
            return false;
        }
        if (current) {
            await setConfig(deployed);
        } else {
            placeConfig(deployedDatum);
        }
        return true;
    };

    return {
        double, contracts, configPolicyId: contracts.configPolicyId, configUnit, configRef, currentConfig, configWaiting, block, setConfig, removeConfig, restoreConfig,
    };
};

/**
 * A won match of `playerId` against the server AI as the live lobby plays and credits it, when
 * the AI gives up at once (live.matches.test.js plays it so): the match the lobby starts for the
 * player's AI ladder (lobby.js startMatch: playerSetup, engine.aiLadderSetup, room.js create:
 * engine.createMatch and the prepared scenario), the AI's surrender, the room's result for the
 * player (room.js resultFor: the awards the engine gives, the statistics, the record), then the
 * lobby's end of a room (lobby.js matchEnded): rewards.rateAiMatch against the room's AI rating
 * when the match ran (the prepared first game runs from the start; a later one ends before it
 * runs and is not rated, as in the lobby), rewards.creditVerifiedMatch, and when it credited,
 * players.advanceAiLadder(…, 'won'). chainDeployment.test.js compares it with a real win.
 */
const creditWonMatch = async (pool, playerId, { id, now, random }) => {
    const row = await players.findPlayer(pool, playerId);
    const ai = engine.aiLadderSetup(players.ladderOf(row));
    const { opponent } = ai;
    const match = engine.createMatch({
        players: [
            { id: 'p0', name: row.username || EmptyPlayerStats.username, type: PlayerType.HUMAN, loadout: players.loadoutOf(row, await players.itemsOf(pool, playerId)) },
            { id: 'p1', name: opponent.name, type: opponent.type },
        ],
        boardSize: ai.boardSize,
        seed: id,
        balance: ai.balance,
    });
    if (ai.scenario) {
        engine.prepareScenario(match, ai.scenario);
    }
    const surrender = engine.applyAction(match, { type: engine.MatchActionTypes.surrender, player: 1, t: match.t, payload: {} });
    if (!surrender.ok) {
        throw new Error(`creditMatches: the AI could not give up (${surrender.error})`);
    }
    const { winners } = match.outcome;
    const me = match.players[0];
    const awards = engine.computeMatchAwards(match, 0).map(award => ({ key: award.key, xp: award.xp }));
    const record = {
        ...structuredClone(me.statistics),
        id,
        online: true,
        won: true,
        lost: false,
        opponent: { name: opponent.name, type: opponent.type, ai: true },
        winners: winners.map(winner => ({ idx: winner, id: match.players[winner].id, name: match.players[winner].name, type: match.players[winner].type })),
        awards,
    };
    // room.js aiRating: the fixed rating of the AI of this board and strength
    const { rows, cols } = match.board.size;
    const rating = rows === cols ? engine.aiRatingOf({ kind: opponent.agent.kind, handicap: opponent.agent.options && opponent.agent.options.handicap, board: rows }) : null;
    const ran = match.startedAt !== null && typeof match.startedAt !== 'undefined';
    if (rating && ran) {
        await rateAiMatch(pool, id, playerId, rating, 1);
    }
    const credit = await creditVerifiedMatch(pool, { playerId, record, isWinner: true, opponentIsAi: true, now, random });
    if (credit) {
        await players.advanceAiLadder(pool, playerId, 'won');
    }
};

let matchCount = 0;
/**
 * `count` server-hosted matches of `playerId` won against the server AI (at `now` ms; `random`:
 * the drops' random source, default the one the API tests use), each as the live lobby plays and
 * credits a match the AI gives up at once (creditWonMatch): the verified record, its awards' XP
 * and drops, the rating when the match ran, one step of the AI ladder. The matches of the mint
 * gate.
 */
const creditMatches = async (pool, playerId, count, { now = Date.now(), random = () => 0.5 } = {}) => {
    for (let i = 0; i < count; i++) {
        matchCount += 1;
        await creditWonMatch(pool, playerId, { id: `chain-app-match-${matchCount}-${crypto.randomBytes(4).toString('hex')}`, now, random });
    }
};

module.exports = { createDeployedChain, creditMatches };
