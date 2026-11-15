// What the game asks before it lets a player start a mint (minting plan D, Task 2): GET
// /chain/readiness, over plan C's chain double with plan B's fixture deployment on it and the real
// tx.js. The expected amounts come from plan B's functions and constants, never from a brief.

const crypto = require('crypto');
const { Address, Data, KeyHash, ScriptHash } = require('@evolution-sdk/evolution');
const request = require('supertest');
const { Items, chain: rules, cardano } = require('@battlechoc/battlechoc-shared-functions');
const ops = require('../src/chain/ops');
const { fundsCheck, gameFeeOf } = require('../src/chain/tx');
const { addressOfSubject } = require('../src/cardano');
const { closeTestPools } = require('./helpers/db');
const { createTestApp, createAccount } = require('./helpers/api');
const { testKeys, confirmWith, removeKey } = require('./helpers/cardano');
const { fixtureContracts, TEAM_ADDRESS } = require('./helpers/chain');
const { createChainApp, T0 } = require('./helpers/chainApp');
const { CONFIG_TTL_MS } = require('../src/chain/config');
const { UTXO_CACHE, createUtxoCache } = require('../src/chain/readiness');
const { ProviderError } = require('../src/chain/provider');
const { walletWitness } = require('./helpers/chain');

afterAll(closeTestPools);

const { preprod } = cardano.Networks;
const HOUR = 60 * 60 * 1000;
const { config } = fixtureContracts();
const [COMMON, RARE, EPIC] = [0, 1, 2];
// what an empty wallet needs for a mint of `tier` with the fee option `fee` (plan B's funds check)
const neededFor = (tier, fee = 0, settings = config) => fundsCheck({ utxos: [], kind: 'mint', gameFee: gameFeeOf(settings, { tier, fee }) }).needed;

let opSerial = 0;
/** A prepared mint of `itemId` by `playerId` at `now`, as the mint route stores one. */
const prepared = (pool, { playerId, itemId, subject, now }) => {
    opSerial += 1;
    return ops.insertPrepared(pool, {
        playerId,
        itemId,
        kind: 'mint',
        subject,
        ownerKeyHash: 'bb'.repeat(28),
        ownerAddress: testKeys().baseAddress,
        requiredKeys: ['bb'.repeat(28)],
        assetName: rules.USER_LABEL + opSerial.toString(16).padStart(56, '0'),
        txHash: crypto.randomBytes(32).toString('hex'),
        txCbor: '84a400',
        ttlSlot: 90_000_000 + opSerial,
        signUntil: now + rules.SIGN_WINDOW_MS,
        code: `readiness-code-${opSerial}`,
        feeOption: 0,
        networkFee: '490000',
        gameFeeAsset: 'lovelace',
        gameFee: '1000000',
        deposit: '3720000',
        depositUser: '1220000',
        now,
    });
};

/** A mint of a fresh item submitted at `at`; then final (`end: 'final'`) or expired after its ttl. */
const pastMint = async (env, { playerId, subject, at, end = 'final' }) => {
    const itemId = await env.giveItem(playerId, 'LIGHT_BARREL');
    const op = await prepared(env.pool, { playerId, itemId, subject, now: at });
    const submitted = await ops.markSubmitted(env.pool, op, { signedCbor: '84a400', now: at + 1000 });
    if (end === 'expired') {
        return ops.expireSubmitted(env.pool, submitted, at + rules.TX_VALIDITY_MS + HOUR);
    }
    const included = await ops.markIncluded(env.pool, submitted, { blockNo: 2000, now: at + 60_000 });
    return ops.markFinal(env.pool, included, at + 5 * 60_000);
};

const readiness = (account, itemId) => account.get(`/chain/readiness${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ''}`);

describe('chain features off', () => {
    // a chain whose provider, index and config reader fail the test when anything asks them
    const trap = name =>
        new Proxy(
            {},
            {
                get: (target, key) => {
                    throw new Error(`${name}.${String(key)} was used while the chain is off`);
                },
            }
        );

    test('GET /chain/readiness answers { enabled: false }; every other /chain/ route is 404 CHAIN OFF, for every method', async () => {
        const { app } = await createTestApp({ chain: { enabled: false, missing: ['CHAIN_K_FINAL'], provider: trap('provider'), index: trap('index') }, chainConfig: trap('config') });
        const player = await createAccount(app);
        const off = await player.get('/chain/readiness').expect(200);
        expect(off.text).toBe('{"enabled":false}');
        // the game may ask before it has an account
        expect((await request(app).get('/chain/readiness').expect(200)).body).toEqual({ enabled: false });
        const answers = [
            player.post('/chain/mint', { itemId: 'x', subject: 'stake:aa', fee: 0 }),
            player.post('/chain/burn', { itemId: 'x' }),
            player.get('/chain/operations/some-id'),
            player.del('/chain/operations/some-id'),
            request(app).get('/chain/sign/CODE'),
            request(app).post('/chain/sign/CODE').send({ witness: 'aa' }),
            request(app).put('/chain/anything'),
            request(app).patch('/chain/readiness'),
            player.post('/chain/readiness'),
        ];
        for (const answer of await Promise.all(answers)) {
            expect({ status: answer.status, text: answer.text }).toEqual({ status: 404, text: '{"error":"CHAIN OFF"}' });
        }
        // a path that only starts like /chain is not one of them
        expect((await player.get('/chainsaw')).body).toEqual({ error: 'NOT FOUND' });
    });

    test('a server without any chain settings is off too', async () => {
        const { app } = await createTestApp();
        expect((await request(app).get('/chain/readiness').expect(200)).body).toEqual({ enabled: false });
        await request(app).post('/chain/mint').expect(404);
    });
});

describe('GET /chain/readiness', () => {
    test('needs the player\'s session when the chain is on', async () => {
        const env = await createChainApp();
        expect((await request(env.app).get('/chain/readiness').expect(401)).body).toEqual({ error: 'missing access token' });
    });

    test('everything ready: the shape of the answer, with the fee options and the estimate of the largest fee', async () => {
        const env = await createChainApp();
        const { account, subjects } = await env.player('Ann', { lovelace: [30_000_000], wallets: ['eternl'], matches: 10 });
        const { body } = await readiness(account).expect(200);
        expect(body).toEqual({
            enabled: true,
            ready: true,
            paused: false,
            matches: { have: 10, need: rules.MINT_MIN_ONLINE_MATCHES },
            mintsLeftToday: rules.MINTS_PER_DAY,
            wallets: [
                {
                    subject: subjects[0],
                    address: addressOfSubject(subjects[0], preprod),
                    name: 'eternl',
                    asked: true,
                    lovelace: '30000000',
                    enough: true,
                    missing: '0',
                    needed: String(neededFor(EPIC)),
                    collateral: true,
                    waitUntil: null,
                },
            ],
            estimate: {
                networkFee: String(rules.MINT_NETWORK_FEE_ESTIMATE_LOVELACE),
                deposit: String(rules.MINT_DEPOSIT_ESTIMATE_LOVELACE),
                needed: String(neededFor(EPIC)),
            },
            gameFees: [{ fee: 0, asset: 'lovelace', label: 'ADA', amounts: ['1000000', '2000000', '4000000'] }],
            operation: null,
        });
        // plan B's rule for a wallet of one pure UTxO and a single receiver: the estimate plus the fee
        expect(neededFor(EPIC)).toBe(rules.MINT_NEEDED_ESTIMATE_LOVELACE + 4_000_000);
    });

    test('a wallet\'s ADA is what the funds check can spend: not a listing under its stake key at a script address, not an output with a datum', async () => {
        const env = await createChainApp();
        const { account, keys, subjects } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        const listing = Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex('5c'.repeat(28)), stakingCredential: KeyHash.fromHex(keys[0].stakeKeyHashHex) }));
        env.double.fund(listing, '50000000');
        env.double.fund(env.double.addressOf(keys[0]), '7000000', {}, { inlineDatum: Data.toCBORHex(Data.constr(0n, [])) });
        env.block();
        const utxos = await env.chain.provider.utxosOf(subjects[0]);
        expect(utxos).toHaveLength(3);
        const { body } = await readiness(account).expect(200);
        const funds = fundsCheck({ utxos, kind: 'mint', gameFee: gameFeeOf(config, { tier: EPIC, fee: 0 }) });
        expect(body.wallets[0]).toMatchObject({ lovelace: '30000000', enough: funds.enough, needed: String(funds.needed), missing: String(funds.missing) });
    });

    test('a paused config: paused, everything else as it is (the game greys minting out); unpaused again on the next read', async () => {
        const env = await createChainApp();
        const { account } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        await env.setConfig({ paused: true });
        expect((await readiness(account).expect(200)).body).toMatchObject({ ready: true, paused: true });
        await env.setConfig({});
        expect((await readiness(account).expect(200)).body).toMatchObject({ ready: true, paused: false });
        // no config: not paused, not ready
        await env.removeConfig();
        expect((await readiness(account).expect(200)).body).toMatchObject({ ready: false, paused: false });
    });

    test('the matches: only verified (server-hosted) ones count, not the offline records the game reports', async () => {
        const env = await createChainApp();
        const { account, playerId } = await env.player('Ann', { matches: 9 });
        const offline = Array.from({ length: 5 }, (_, i) => ({ id: `offline-${i}`, won: true, lost: false, winners: [{ id: 'me' }], awards: ['WINNER'] }));
        await account.post('/user/trackrecords', { stats: offline }).expect(200);
        expect((await readiness(account).expect(200)).body.matches).toEqual({ have: 9, need: 10 });
        await env.matches(playerId, 1);
        expect((await readiness(account).expect(200)).body.matches).toEqual({ have: 10, need: 10 });
        // another player's matches are theirs
        const ben = await env.player('Ben', { matches: 3 });
        expect((await readiness(ben.account).expect(200)).body.matches.have).toBe(3);
    });

    test('two wallets: lovelace each, enough for the item\'s tier (itemId), else for the largest fee', async () => {
        const env = await createChainApp();
        const rareNeeded = neededFor(RARE);
        const epicNeeded = neededFor(EPIC);
        // between the two: enough for a RARE item, not for an EPIC one
        const between = rareNeeded + 500_000;
        expect(between).toBeLessThan(epicNeeded);
        const { account, playerId, subjects } = await env.player('Ann', { lovelace: [between, 50_000_000], wallets: ['lace', 'eternl'], matches: 10 });
        // a RARE item, a COMMON one
        const rareItem = await env.giveItem(playerId, 'DARK_WALLS');
        const commonItem = await env.giveItem(playerId, 'LIGHT_BARREL');
        expect([Items.DARK_WALLS.tier, Items.LIGHT_BARREL.tier]).toEqual(['RARE', 'COMMON']);

        const rare = (await readiness(account, rareItem).expect(200)).body;
        expect(rare.estimate.needed).toBe(String(rareNeeded));
        expect(rare.wallets.map(({ subject, name, lovelace, enough, missing, needed }) => ({ subject, name, lovelace, enough, missing, needed }))).toEqual([
            { subject: subjects[0], name: 'lace', lovelace: String(between), enough: true, missing: '0', needed: String(rareNeeded) },
            { subject: subjects[1], name: 'eternl', lovelace: '50000000', enough: true, missing: '0', needed: String(rareNeeded) },
        ]);
        // RARE costs 1 ADA more than COMMON, EPIC 2 more than RARE (a single receiver above its minimum)
        expect(rareNeeded - neededFor(COMMON)).toBe(1_000_000);
        expect(epicNeeded - rareNeeded).toBe(2_000_000);
        expect((await readiness(account, commonItem).expect(200)).body.estimate.needed).toBe(String(neededFor(COMMON)));

        const epic = (await readiness(account).expect(200)).body;
        expect(epic.estimate.needed).toBe(String(epicNeeded));
        expect(epic.wallets[0]).toMatchObject({ lovelace: String(between), enough: false, missing: String(epicNeeded - between), needed: String(epicNeeded), collateral: true });
        expect(epic.wallets[1]).toMatchObject({ enough: true, missing: '0' });
        // an unknown item is treated as not given
        expect((await readiness(account, 'no-such-item').expect(200)).body.estimate.needed).toBe(String(epicNeeded));
    });

    test('a wallet without funds, and one with the ADA but nothing the transaction can take as its collateral', async () => {
        const env = await createChainApp();
        const { account, keys } = await env.player('Ann', { lovelace: [0, 0], matches: 10 });
        // twenty small UTxOs: the ADA is there, but no three of them hold the collateral
        for (let i = 0; i < 20; i++) {
            env.double.fund(env.double.addressOf(keys[1]), '600000');
        }
        env.block();
        const { body } = await readiness(account).expect(200);
        const needed = neededFor(EPIC);
        expect(body.wallets[0]).toMatchObject({ lovelace: '0', enough: false, missing: String(needed), needed: String(needed), collateral: false });
        const crumbs = fundsCheck({ utxos: await env.chain.provider.utxosOf(`stake:${keys[1].stakeKeyHashHex}`), kind: 'mint', gameFee: gameFeeOf(config, { tier: EPIC, fee: 0 }) });
        expect(crumbs).toMatchObject({ missing: 0, collateral: false, enough: false });
        expect(body.wallets[1]).toMatchObject({ lovelace: '12000000', enough: false, missing: '0', needed: String(crumbs.needed), collateral: false });
        expect(body.ready).toBe(true);
    });

    test('a wallet linked under the hop wait has waitUntil', async () => {
        const env = await createChainApp();
        const ben = await env.player('Ben', { lovelace: [10_000_000, 10_000_000] });
        // Ben lets his second wallet go, Ann links it an hour later
        const { confirmToken } = (await confirmWith(env.app, ben.account, ben.keys[0])).body;
        await removeKey(env.app, ben.account, ben.subjects[1], confirmToken).expect(204);
        env.advance(HOUR);
        const ann = await env.player('Ann', { lovelace: [10_000_000] });
        await env.link(ann.account, ben.keys[1], { confirmBy: ann.keys[0] });
        const linkedAt = env.now();
        const { wallets } = (await readiness(ann.account).expect(200)).body;
        expect(wallets.map(({ subject, waitUntil }) => ({ subject, waitUntil }))).toEqual([
            { subject: ann.subjects[0], waitUntil: null },
            { subject: ben.subjects[1], waitUntil: new Date(linkedAt + rules.WALLET_HOP_WAIT_MS).toISOString() },
        ]);
        env.advance(rules.WALLET_HOP_WAIT_MS);
        env.block();
        expect((await readiness(await env.refreshed(ann.account)).expect(200)).body.wallets[1].waitUntil).toBeNull();
    });

    test('the daily limit: mints submitted since the UTC day\'s start that did not expire', async () => {
        // 12:00 UTC
        const env = await createChainApp();
        const { account, playerId, subjects } = await env.player('Ann', { matches: 10 });
        const subject = subjects[0];
        // yesterday (UTC) does not count, even a minute before midnight
        await pastMint(env, { playerId, subject, at: T0 - 12 * HOUR - 60_000 });
        await pastMint(env, { playerId, subject, at: T0 - 13 * HOUR });
        expect((await readiness(account).expect(200)).body.mintsLeftToday).toBe(3);
        await pastMint(env, { playerId, subject, at: T0 - 12 * HOUR });
        await pastMint(env, { playerId, subject, at: T0 - HOUR });
        expect((await readiness(account).expect(200)).body.mintsLeftToday).toBe(1);
        // one that expired after its submit (not in a block in time, or rejected) gives its mint back
        await pastMint(env, { playerId, subject, at: T0 - 2 * HOUR, end: 'expired' });
        expect((await readiness(account).expect(200)).body.mintsLeftToday).toBe(1);
        await pastMint(env, { playerId, subject, at: T0 - 30 * 60_000 });
        expect((await readiness(account).expect(200)).body.mintsLeftToday).toBe(0);
        // a prepared mint that was cancelled was never submitted
        const itemId = await env.giveItem(playerId, 'LIGHT_BARREL');
        await ops.cancel(env.pool, await prepared(env.pool, { playerId, itemId, subject, now: T0 }), T0);
        expect((await readiness(account).expect(200)).body.mintsLeftToday).toBe(0);
        // a new UTC day
        env.advance(12 * HOUR);
        env.block();
        expect((await readiness(await env.refreshed(account)).expect(200)).body.mintsLeftToday).toBe(3);
        // another player's mints are theirs
        const ben = await env.player('Ben');
        expect((await readiness(ben.account).expect(200)).body.mintsLeftToday).toBe(3);
    });

    test('an open operation: its view, without the transaction or the sign code', async () => {
        const env = await createChainApp();
        const { account, playerId, subjects } = await env.player('Ann', { matches: 10 });
        const itemId = await env.giveItem(playerId, 'DARK_WALLS');
        const op = await prepared(env.pool, { playerId, itemId, subject: subjects[0], now: T0 });
        env.advance(60_000);
        const response = await readiness(account).expect(200);
        const item = (await env.pool.query('SELECT item_key, serial FROM items WHERE id = $1', [itemId])).rows[0];
        expect(response.body.operation).toEqual(ops.view(await ops.byId(env.pool, op.id), { item: item.item_key, serial: item.serial }, env.now()));
        expect(response.body.operation).toMatchObject({ id: op.id, state: 'prepared', itemId, item: { item: 'DARK_WALLS' } });
        expect(response.text).not.toContain('84a400');
        expect(response.text).not.toContain('readiness-code');
        // another player sees none of it
        const ben = await env.player('Ben');
        expect((await readiness(ben.account).expect(200)).body.operation).toBeNull();
        // once its sign window is over it is expired on this read: no operation runs
        env.advance(rules.SIGN_WINDOW_MS);
        env.block();
        expect((await readiness(account).expect(200)).body.operation).toBeNull();
        expect(await ops.byId(env.pool, op.id)).toMatchObject({ state: 'expired', error: 'not-signed' });
    });

    test('an operation that ended and whose item a salvage deleted while it was read: no operation, not a fault', async () => {
        const env = await createChainApp();
        const { account, playerId, subjects } = await env.player('Ann', { matches: 10 });
        const itemId = await env.giveItem(playerId, 'DARK_WALLS');
        await prepared(env.pool, { playerId, itemId, subject: subjects[0], now: T0 });
        // between the two reads: the operation ends (a cancel in another tab), a salvage deletes it and its item
        const expireLapsed = ops.expireLapsed;
        jest.spyOn(ops, 'expireLapsed').mockImplementationOnce(async (db, op, now) => {
            const read = await expireLapsed(db, op, now);
            await env.pool.query('DELETE FROM chain_ops WHERE id = $1', [op.id]);
            await env.pool.query('DELETE FROM items WHERE id = $1', [op.item_id]);
            return read;
        });
        expect((await readiness(account).expect(200)).body.operation).toBeNull();
        jest.restoreAllMocks();
    });

    test('privacy: only the asking player\'s wallets, and another player\'s itemId is treated as not given', async () => {
        const env = await createChainApp();
        const ann = await env.player('Ann', { lovelace: [10_000_000], matches: 10 });
        const ben = await env.player('Ben', { lovelace: [20_000_000, 30_000_000] });
        const bensCommon = await env.giveItem(ben.playerId, 'LIGHT_BARREL');
        const answer = (await readiness(ann.account, bensCommon).expect(200)).body;
        expect(answer.wallets.map(wallet => wallet.subject)).toEqual(ann.subjects);
        expect(answer.estimate.needed).toBe(String(neededFor(EPIC)));
        const text = JSON.stringify(answer);
        ben.subjects.forEach(subject => expect(text).not.toContain(subject.slice('stake:'.length)));
        expect(text).not.toContain(bensCommon);
    });

    test('the index stale or unreachable: not ready, everything else still filled', async () => {
        const env = await createChainApp();
        const { account } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        const ready = (await readiness(account).expect(200)).body;
        expect(ready.ready).toBe(true);
        for (const index of ['stale', 'unavailable']) {
            env.double.fail({ index });
            const { body } = await readiness(account).expect(200);
            expect(body).toEqual({ ...ready, ready: false });
        }
        // and the index's tip may simply be old: no block for longer than the index may lag
        env.double.fail({});
        env.advance(env.chain.indexMaxLagMs + 1);
        expect((await readiness(account).expect(200)).body.ready).toBe(false);
        env.block();
        expect((await readiness(account).expect(200)).body.ready).toBe(true);
    });

    test('the provider failing: not ready, no lovelace, no fees; never a 5xx', async () => {
        const env = await createChainApp();
        const { account, subjects } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        for (const provider of ['unavailable', 'busy']) {
            env.double.fail({ provider });
            const { body } = await readiness(account).expect(200);
            expect(body).toMatchObject({
                enabled: true,
                ready: false,
                paused: false,
                matches: { have: 10, need: 10 },
                mintsLeftToday: 3,
                estimate: { networkFee: String(rules.MINT_NETWORK_FEE_ESTIMATE_LOVELACE), deposit: String(rules.MINT_DEPOSIT_ESTIMATE_LOVELACE), needed: null },
                gameFees: null,
                operation: null,
            });
            expect(body.wallets).toEqual([
                { subject: subjects[0], address: addressOfSubject(subjects[0], preprod), name: null, asked: true, lovelace: null, enough: null, missing: null, needed: null, collateral: null, waitUntil: null },
            ]);
        }
    });

    test('a config the provider read a minute ago is used while the provider fails', async () => {
        const env = await createChainApp({ configTtlMs: 60_000 });
        const { account } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        await readiness(account).expect(200);
        env.double.fail({ provider: 'unavailable' });
        // past readiness's copy of the wallet, within the config's
        env.advance(UTXO_CACHE.ttlMs);
        const { body } = await readiness(account).expect(200);
        expect(body).toMatchObject({ ready: false, gameFees: [{ fee: 0, asset: 'lovelace' }], estimate: { needed: String(neededFor(EPIC)) } });
        expect(body.wallets[0]).toMatchObject({ lovelace: null, enough: null });
    });

    test('no fee options: no fee, and the estimate without one', async () => {
        const env = await createChainApp({ fees: [] });
        const { account } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        const { body } = await readiness(account).expect(200);
        const needed = fundsCheck({ utxos: [], kind: 'mint', gameFee: null }).needed;
        expect(needed).toBe(rules.MINT_NEEDED_ESTIMATE_LOVELACE);
        expect(body).toMatchObject({ ready: true, gameFees: [], estimate: { needed: String(needed) } });
        expect(body.wallets[0]).toMatchObject({ enough: true, needed: String(needed) });
    });

    test('an admin update of the fees shows on the next read; a fee in a token this build cannot pay is left out', async () => {
        const env = await createChainApp();
        const { account } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        const choc = 'd5'.repeat(28) + Buffer.from('CHOC', 'utf8').toString('hex');
        const fees = [
            { asset: choc, amounts: [50, 100, 200], receivers: [{ address: TEAM_ADDRESS, share: 1 }] },
            { asset: 'lovelace', amounts: [1_500_000, 3_000_000, 6_000_000], receivers: [{ address: TEAM_ADDRESS, share: 1 }] },
        ];
        await env.setConfig({ fees });
        const { body } = await readiness(account).expect(200);
        expect(body.gameFees).toEqual([{ fee: 1, asset: 'lovelace', label: 'ADA', amounts: ['1500000', '3000000', '6000000'] }]);
        const updated = fixtureContracts({ fees }).config;
        expect(body.estimate.needed).toBe(String(neededFor(EPIC, 1, updated)));
        expect(() => fundsCheck({ utxos: [], kind: 'mint', gameFee: gameFeeOf(updated, { tier: EPIC, fee: 0 }) })).toThrow(expect.objectContaining({ code: 'FEE_ASSET_UNSUPPORTED' }));
        // only the token: options exist, none this build can pay. Not "no fee": not ready, and no
        // numbers without the fee (every mint would be refused)
        await env.setConfig({ fees: [fees[0]] });
        const tokenOnly = (await readiness(account).expect(200)).body;
        expect(tokenOnly).toMatchObject({ ready: false, gameFees: [], estimate: { needed: null } });
        expect(tokenOnly.wallets[0]).toMatchObject({ lovelace: '30000000', enough: null, missing: null, needed: null, collateral: true });
    });

    test('no config on the chain: not ready, no fees; the operator learns it once', async () => {
        const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const env = await createChainApp({ config: false, chainLog: log });
        const { account } = await env.player('Ann', { matches: 10 });
        for (let i = 0; i < 3; i++) {
            const { body } = await readiness(account).expect(200);
            expect(body).toMatchObject({ ready: false, gameFees: null, estimate: { needed: null } });
        }
        expect(log.error).toHaveBeenCalledTimes(1);
        expect(String(log.error.mock.calls[0][0])).toMatch(/config/);
        expect(JSON.stringify(log.error.mock.calls)).toMatch(/CONFIG_NOT_FOUND/);
    });

    test('a removed config: not ready', async () => {
        const env = await createChainApp();
        const { account } = await env.player('Ann', { matches: 10 });
        await env.removeConfig();
        expect((await readiness(account).expect(200)).body).toMatchObject({ ready: false, gameFees: null });
    });

    test('an itemId that is no text is a bad request', async () => {
        const env = await createChainApp();
        const { account } = await env.player('Ann');
        expect((await account.get('/chain/readiness?itemId=a&itemId=b').expect(400)).body).toEqual({ error: 'INVALID REQUEST PARAMETERS' });
        expect((await account.get(`/chain/readiness?itemId=${'x'.repeat(200)}`).expect(400)).body).toEqual({ error: 'INVALID REQUEST PARAMETERS' });
        await account.get('/chain/readiness?itemId=').expect(200);
    });

    test('rate-limited per player (two players behind one address do not share a bucket), with a looser limit per address in front', async () => {
        const env = await createChainApp({ chainPlayerPerMinute: 2 });
        const ann = await env.player('Ann');
        const ben = await env.player('Ben');
        await readiness(ann.account).expect(200);
        await readiness(ann.account).expect(200);
        expect((await readiness(ann.account).expect(429)).body).toEqual({ error: 'TOO MANY REQUESTS' });
        // the same bucket for the player's other /chain routes
        await ann.account.get('/chain/operations/none').expect(429);
        await readiness(ben.account).expect(200);
        await readiness(ben.account).expect(200);
        // a fixed window of a minute
        env.advance(60_001);
        env.block();
        await readiness(ann.account).expect(200);

        const crowded = await createChainApp({ chainAddressPerMinute: 3 });
        const players = [await crowded.player('Cid'), await crowded.player('Dee')];
        await readiness(players[0].account).expect(200);
        await readiness(players[1].account).expect(200);
        await readiness(players[0].account).expect(200);
        expect((await readiness(players[1].account).expect(429)).body).toEqual({ error: 'TOO MANY REQUESTS' });
    });

    test('the defaults: 30 a minute per player, 120 per address, 5 mints and 10 cancels per player; 30 per address to the sign routes, 60 to the status, 5 rebuilds per address and operation', () => {
        expect(require('../src/app').CHAIN_LIMITS).toEqual({
            perAddress: 120,
            perPlayer: 30,
            signPerAddress: 30,
            mintsPerPlayer: 5,
            cancelsPerPlayer: 10,
            statusPerAddress: 60,
            rebuildsPerAddressAndOperation: 5,
        });
    });

    test('a cancel has a bucket of its own per player: polling that used up the player\'s bucket cannot starve it; 10 a minute, a knob of its own', async () => {
        const env = await createChainApp({ chainPlayerPerMinute: 2, chainCancelsPerMinute: 2 });
        const { account, playerId, subjects } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        const ben = await env.player('Ben');
        const itemId = await env.giveItem(playerId, 'DARK_WALLS');
        const op = await prepared(env.pool, { playerId, itemId, subject: subjects[0], now: env.now() });
        // two tabs polling: the player's bucket is used up
        await account.get(`/chain/operations/${op.id}`).expect(200);
        await account.get(`/chain/operations/${op.id}`).expect(200);
        await account.get(`/chain/operations/${op.id}`).expect(429);
        expect((await account.del(`/chain/operations/${op.id}`).expect(200)).body).toMatchObject({ id: op.id, state: 'cancelled' });
        // the cancels' own limit, per player
        await account.del(`/chain/operations/${op.id}`).expect(409);
        expect((await account.del(`/chain/operations/${op.id}`).expect(429)).body).toEqual({ error: 'TOO MANY REQUESTS' });
        await ben.account.del('/chain/operations/none').expect(404);
        env.advance(60_001);
        await account.del(`/chain/operations/${op.id}`).expect(409);
    });
});

describe('how many wallets readiness asks the provider for', () => {
    test('at most 8, the most recently linked first; the others are listed as not asked and do not make it unready', async () => {
        // linking ten keys takes some forty signed challenges
        const env = await createChainApp({ cardanoPerMinute: 1000 });
        const { account, subjects } = await env.player('Ann', { lovelace: Array(10).fill(1_000_000), matches: 10 });
        const utxosOf = jest.spyOn(env.chain.provider, 'utxosOf');
        const { body } = await readiness(account).expect(200);
        expect(body.wallets.map(wallet => wallet.subject)).toEqual(subjects);
        expect(body.wallets.map(wallet => wallet.asked)).toEqual([false, false, true, true, true, true, true, true, true, true]);
        expect(utxosOf.mock.calls.map(([subject]) => subject)).toEqual(subjects.slice(2).reverse());
        expect(body.wallets[0]).toMatchObject({ asked: false, lovelace: null, enough: null, missing: null, needed: null, collateral: null });
        expect(body.wallets[9]).toMatchObject({ asked: true, lovelace: '1000000' });
        expect(body.ready).toBe(true);
        utxosOf.mockRestore();
    });

    test('at most 3 at a time', async () => {
        const env = await createChainApp({ cardanoPerMinute: 1000 });
        const { account } = await env.player('Ann', { lovelace: Array(8).fill(0), matches: 10 });
        const original = env.chain.provider.utxosOf;
        let running = 0;
        let most = 0;
        const utxosOf = jest.spyOn(env.chain.provider, 'utxosOf').mockImplementation(async subject => {
            running += 1;
            most = Math.max(most, running);
            await new Promise(resolve => setTimeout(resolve, 30));
            running -= 1;
            return original(subject);
        });
        expect((await readiness(account).expect(200)).body.ready).toBe(true);
        expect(utxosOf).toHaveBeenCalledTimes(8);
        expect(most).toBe(3);
        utxosOf.mockRestore();
    });

    test('one deadline for all of them: a wallet the provider does not answer in time is unknown, the answer comes, not ready', async () => {
        const env = await createChainApp({ chainReadinessFanOut: { deadlineMs: 300 } });
        const { account, subjects } = await env.player('Ann', { lovelace: [5_000_000, 6_000_000], matches: 10 });
        const original = env.chain.provider.utxosOf;
        const utxosOf = jest.spyOn(env.chain.provider, 'utxosOf').mockImplementation(subject => (subject === subjects[0] ? new Promise(() => {}) : original(subject)));
        const started = Date.now();
        const { body } = await readiness(account).expect(200);
        expect(Date.now() - started).toBeLessThan(3000);
        expect(body.wallets.map(({ asked, lovelace }) => ({ asked, lovelace }))).toEqual([
            { asked: true, lovelace: null },
            { asked: true, lovelace: '6000000' },
        ]);
        expect(body.ready).toBe(false);
        utxosOf.mockRestore();
    });
});

describe('readiness\'s copy of the wallets (the provider\'s quota is every player\'s)', () => {
    test('asked again within 20 s: the provider is asked once a wallet; after that, again', async () => {
        const env = await createChainApp();
        const { account, subjects } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        const utxosOf = jest.spyOn(env.chain.provider, 'utxosOf');
        const first = (await readiness(account).expect(200)).body;
        const second = (await readiness(account).expect(200)).body;
        expect(second).toEqual(first);
        expect(utxosOf.mock.calls).toEqual([[subjects[0]]]);
        env.advance(UTXO_CACHE.ttlMs - 1);
        await readiness(account).expect(200);
        expect(utxosOf).toHaveBeenCalledTimes(1);
        env.advance(1);
        await readiness(account).expect(200);
        expect(utxosOf).toHaveBeenCalledTimes(2);
        utxosOf.mockRestore();
    });

    test('a failure is not kept: the next request asks the provider again', async () => {
        const env = await createChainApp();
        const { account } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        const utxosOf = jest.spyOn(env.chain.provider, 'utxosOf').mockRejectedValueOnce(new ProviderError('busy', 'Usage is over limit.', 429));
        expect((await readiness(account).expect(200)).body.wallets[0]).toMatchObject({ lovelace: null });
        expect((await readiness(account).expect(200)).body.wallets[0]).toMatchObject({ lovelace: '30000000' });
        expect(utxosOf).toHaveBeenCalledTimes(2);
        utxosOf.mockRestore();
    });

    test('a mint built or signed: the next readiness reads that wallet afresh, never the copy from before', async () => {
        const env = await createChainApp();
        const { account, playerId, keys, subjects } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        const itemId = await env.giveItem(playerId, 'DARK_WALLS');
        const utxosOf = jest.spyOn(env.chain.provider, 'utxosOf');
        await readiness(account).expect(200);
        const minted = (await account.post('/chain/mint', { itemId, subject: subjects[0], fee: 0, addresses: [keys[0].baseAddressHex] }).expect(201)).body;
        // the build's own read, then readiness's afresh
        await readiness(account).expect(200);
        expect(utxosOf).toHaveBeenCalledTimes(3);
        await request(env.app).post(`/chain/sign/${minted.signCode}`).send({ witness: walletWitness(minted.tx, [keys[0].paymentKey]) }).expect(200);
        await readiness(account).expect(200);
        expect(utxosOf).toHaveBeenCalledTimes(4);
        utxosOf.mockRestore();
    });

    test('a call in flight is shared; at most so many wallets, the oldest dropped first; nothing kept with a ttl of 0', async () => {
        let calls = 0;
        const provider = { utxosOf: async subject => [`${subject} ${++calls}`] };
        const cache = createUtxoCache({ provider, maxEntries: 2 });
        const [a, again] = await Promise.all([cache.get('a', T0), cache.get('a', T0)]);
        expect(again).toBe(a);
        expect(calls).toBe(1);
        await cache.get('b', T0);
        await cache.get('c', T0);
        expect(cache.size()).toBe(2);
        // 'a' was the oldest: asked again; 'c' is kept
        expect(await cache.get('a', T0)).toEqual(['a 4']);
        expect(await cache.get('c', T0)).toEqual(['c 3']);
        const none = createUtxoCache({ provider, ttlMs: 0 });
        await none.get('a', T0);
        await none.get('a', T0);
        expect(calls).toBe(6);
        expect(none.size()).toBe(0);
    });
});

describe('the fee shown and the config as production reads it', () => {
    test('the fee shown is the fee charged: a share below the minimum UTxO raised as the build raises it, the same as the mint\'s costs', async () => {
        const treasury = fixtureContracts().treasuryAddress;
        const fees = [{ asset: 'lovelace', amounts: [1_000_000, 2_000_000, 4_000_000], receivers: [{ address: treasury, share: 9 }, { address: TEAM_ADDRESS, share: 1 }] }];
        const env = await createChainApp({ fees });
        const { account, playerId, subjects } = await env.player('Ann', { lovelace: [20_000_000], matches: 10 });
        const itemId = await env.giveItem(playerId, 'DARK_WALLS');
        const { gameFees } = (await readiness(account, itemId).expect(200)).body;
        const charged = gameFees[0].amounts.map(Number);
        // the team's due of 100_000, 200_000 or 400_000 is raised to the minimum UTxO at its address
        charged.forEach((amount, tier) => expect(amount).toBeGreaterThan(fees[0].amounts[tier]));
        const { costs } = (await account.post('/chain/mint', { itemId, subject: subjects[0], fee: 0 }).expect(201)).body;
        expect(costs.gameFee.amount).toBe(charged[RARE]);
    });

    test('production\'s cache of a minute: an admin pause is seen once the copy is older than that', async () => {
        const env = await createChainApp({ configTtlMs: CONFIG_TTL_MS });
        const { account } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        expect((await readiness(account).expect(200)).body.paused).toBe(false);
        await env.setConfig({ paused: true });
        expect((await readiness(account).expect(200)).body.paused).toBe(false);
        env.advance(CONFIG_TTL_MS);
        env.block();
        expect((await readiness(account).expect(200)).body.paused).toBe(true);
    });

    test('the config by CHAIN_CONFIG_REF alone: found; an admin update spends it, so it is no longer found until the reference is updated', async () => {
        const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
        const env = await createChainApp({ configByNft: false, chainLog: log });
        expect(env.chain.configPolicyId).toBeNull();
        const { account } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        expect((await readiness(account).expect(200)).body).toMatchObject({ ready: true, gameFees: [{ fee: 0 }] });
        await env.setConfig({ paused: true });
        expect((await readiness(account).expect(200)).body).toMatchObject({ ready: false, paused: false, gameFees: null });
        expect(JSON.stringify(log.error.mock.calls)).toMatch(/CONFIG_NOT_FOUND/);
    });

    test('the index failing in a way nobody expected: not ready, never a 5xx; logged', async () => {
        const env = await createChainApp();
        const { account } = await env.player('Ann', { lovelace: [30_000_000], matches: 10 });
        const tip = jest.spyOn(env.chain.index, 'tip').mockRejectedValue(new TypeError('the index broke'));
        const { body } = await readiness(account).expect(200);
        expect(body).toMatchObject({ ready: false, gameFees: [{ fee: 0 }] });
        expect(JSON.stringify(env.chainLog.error.mock.calls)).toMatch(/the index broke/);
        tip.mockRestore();
    });
});
