// The contract of the chain index (plan C, Task 4): what every index answers after the same blocks.
// chainDouble.test.js runs it against the chain double's index (always, on pg-mem), chainIndex.test.js
// against the real one over Yaci-shaped tables written from the double's blocks (Postgres only).
// It is the one place that shows both agree, so it compares complete answers: every field of every
// row, against rows written out from the scenario, in a fixed order.
//
// The scenario: Ann holds A at her base address and D at her enterprise address; B was Ann's and
// sits at a script address with Ann's stake key (a marketplace listing: nobody holds it); C was
// Bob's and is burned. E was minted, burned and minted again (to Bob): its mint is the first one.
// G (at Ann's enterprise address) and H (at a listing under Ann's stake key) are burned together,
// by one transaction of their holders.
// Around them: an output with a policy token that is no user token, a foreign
// policy's token with a user label, and an ada-only payment that the index never sees. The index
// keeps only what holds or moves a user token of the policy (deploy/chain/application-plugins.yml):
// the reference tokens at the items contract, and their mints and burns, are not in it; an output
// with a user token is kept whole, the other tokens beside it too (F with 'beef').

const { Address, KeyHash, ScriptHash } = require('@evolution-sdk/evolution');
const { createChainDouble, jsonTx } = require('../chainDouble');
const { MAX_ASSET_NAMES } = require('../../src/chain/chainIndex');
const { holderOf } = require('../../src/chain/addresses');
const { testKeys } = require('./cardano');
const { fixtureContracts } = require('./chain');

const START = 1_700_000_000_000;
const SLOTS_PER_BLOCK = 20;
// one second per slot of the double's slot configuration (chain.network.slotConfig), so the block
// times the clock gives and the times the real index reads from the slots agree; whole seconds,
// as Yaci Store keeps block times
const BLOCK_MS = SLOTS_PER_BLOCK * 1000;

const userName = n => '000de140' + n.toString(16).padStart(56, '0');
const referenceName = n => '000643b0' + n.toString(16).padStart(56, '0');

// rows in a fixed order (the double answers in ledger order, the real index in block order)
const ordered = rows => [...rows].sort((a, b) => `${a.txHash}#${a.index}#${a.assetName}`.localeCompare(`${b.txHash}#${b.index}#${b.assetName}`));

const scenario = async () => {
    const { policyId } = fixtureContracts();
    let clock = START;
    const chain = createChainDouble({ policyId, now: () => clock, slotsPerBlock: SLOTS_PER_BLOCK });
    const block = () => {
        clock += BLOCK_MS;
        return chain.produceBlocks();
    };
    const ann = testKeys();
    const bob = testKeys();
    const annBase = chain.addressOf(ann);
    const annEnterprise = chain.addressOf(ann, 'enterprise');
    const listing = Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: ScriptHash.fromHex('5c'.repeat(28)), stakingCredential: KeyHash.fromHex(ann.stakeKeyHashHex) }));
    const names = { A: userName(1), B: userName(2), C: userName(3), D: userName(4), E: userName(5), F: userName(6), G: userName(7), H: userName(8) };

    const mint = {
        A: chain.mintToken({ assetName: names.A, to: annBase }),
        B: chain.mintToken({ assetName: names.B, to: annBase }),
        C: chain.mintToken({ assetName: names.C, to: chain.addressOf(bob) }),
        D: chain.mintToken({ assetName: names.D, to: annEnterprise }),
        E: chain.mintToken({ assetName: names.E, to: annBase }),
        G: chain.mintToken({ assetName: names.G, to: annEnterprise }),
        H: chain.mintToken({ assetName: names.H, to: listing }),
    };
    const ada = chain.fund(annBase, 5_000_000);
    const others = chain.fund(annBase, 2_000_000, { [policyId + 'cafe']: 1, ['ab'.repeat(28) + userName(9)]: 1 });
    const strangerAddress = chain.newAddress();
    const mixed = chain.fund(strangerAddress, 2_000_000, { [policyId + names.F]: 1, [policyId + 'beef']: 1 });
    const first = block();

    const moveB = chain.moveToken({ assetName: names.B, to: listing });
    const burnC = chain.burnToken({ assetName: names.C });
    const burnE = chain.burnToken({ assetName: names.E });
    // an ada-only payment that spends an ada-only output
    const payment = await chain.submit(jsonTx({ txHash: 'f0'.repeat(32), ttlSlot: null, inputs: [ada], outputs: [{ address: chain.addressOf(bob), lovelace: '4000000', assets: {} }], mint: {} }));
    // one transaction burns two user tokens (their reference tokens stay: the index does not see them)
    const burnGH = await chain.submit(
        jsonTx({ txHash: 'e1'.repeat(32), ttlSlot: null, inputs: [{ txHash: mint.G, index: 0 }, { txHash: mint.H, index: 0 }], outputs: [], mint: { [policyId + names.G]: '-1', [policyId + names.H]: '-1' } })
    );
    const second = block();

    const remintE = chain.mintToken({ assetName: names.E, to: chain.addressOf(bob) });
    const third = block();
    const last = block();
    return { chain, policyId, ann, bob, annBase, annEnterprise, listing, strangerAddress, names, mint, ada, others, mixed, moveB, burnC, burnE, burnGH, remintE, payment, blocks: { first, second, third, last } };
};

/**
 * Runs the contract against `makeIndex(chain)`: the index to check, after the scenario's blocks
 * on the double `chain` (it may write those blocks somewhere first).
 */
const indexContract = (name, makeIndex) => {
    describe(`the index contract: ${name}`, () => {
        let s;
        let index;
        const row = (assetName, address, holder, txHash, outputIndex, block) => ({ assetName, address, ...holder, txHash, index: outputIndex, blockNo: block.blockNo, slot: block.slot });

        beforeAll(async () => {
            s = await scenario();
            index = await makeIndex(s.chain);
        });

        test("tip: the last block, complete (its time is the block's, not when the index saw it)", async () => {
            expect(await index.tip()).toEqual(s.chain.tip());
            expect((await index.tip()).blockNo).toBe(s.blocks.last.blockNo);
        });

        test('holdersOf: one row per unspent output and asked name, every field; burned and unknown names, reference tokens and outputs without a user token absent', async () => {
            const { names, mint, mixed, moveB, remintE, blocks, ann, bob, annBase, annEnterprise, listing, strangerAddress, chain } = s;
            const asked = [names.A, names.B, names.C, names.D, names.E, names.F, referenceName(1), referenceName(3), 'cafe', 'beef', userName(404)];
            const annBoth = { stake: `stake:${ann.stakeKeyHashHex}`, pay: `pay:${ann.paymentKeyHashHex}` };
            const nobody = { stake: null, pay: null };
            expect(ordered(await index.holdersOf(asked))).toEqual(
                ordered([
                    row(names.A, annBase, annBoth, mint.A, 0, blocks.first),
                    row(names.B, listing, nobody, moveB, 0, blocks.second),
                    row(names.D, annEnterprise, { stake: null, pay: annBoth.pay }, mint.D, 0, blocks.first),
                    row(names.E, chain.addressOf(bob), { stake: `stake:${bob.stakeKeyHashHex}`, pay: `pay:${bob.paymentKeyHashHex}` }, remintE, 0, blocks.third),
                    // an output with a user token is kept whole: 'beef' beside F
                    row(names.F, strangerAddress, holderOf(strangerAddress), mixed.txHash, 0, blocks.first),
                    row('beef', strangerAddress, holderOf(strangerAddress), mixed.txHash, 0, blocks.first),
                ])
            );
            // the store's reference token and the lone 'cafe' are no user tokens: not in the index
            expect(await index.holdersOf([referenceName(1), 'cafe'])).toEqual([]);
            expect(chain.scriptAddress).toMatch(/^addr_test1w/);
            expect(await index.holdersOf([names.C, referenceName(3), userName(404)])).toEqual([]);
            expect(await index.holdersOf([])).toEqual([]);
        });

        test(`holdersOf: at most ${MAX_ASSET_NAMES} names per call, more is a RangeError`, async () => {
            const many = Array.from({ length: MAX_ASSET_NAMES }, (_, n) => userName(1000 + n));
            many[0] = s.names.A;
            expect((await index.holdersOf(many)).map(found => found.assetName)).toEqual([s.names.A]);
            await expect(index.holdersOf([...many, userName(1)])).rejects.toThrow(RangeError);
        });

        test('tokensHeldBy: the user tokens of the policy whose address holderOf gives one of the subjects', async () => {
            const { names, mint, remintE, blocks, ann, bob, annBase, annEnterprise, chain } = s;
            const stake = `stake:${ann.stakeKeyHashHex}`;
            const pay = `pay:${ann.paymentKeyHashHex}`;
            const a = row(names.A, annBase, { stake, pay }, mint.A, 0, blocks.first);
            const d = row(names.D, annEnterprise, { stake: null, pay }, mint.D, 0, blocks.first);
            // B's listing carries Ann's stake key, but a script holds it; Ann's E is burned
            expect(await index.tokensHeldBy([stake])).toEqual([a]);
            expect(ordered(await index.tokensHeldBy([pay]))).toEqual(ordered([a, d]));
            expect(ordered(await index.tokensHeldBy([stake, pay]))).toEqual(ordered([a, d]));
            // Bob's C is burned; E, minted again, is his
            const bobs = { stake: `stake:${bob.stakeKeyHashHex}`, pay: `pay:${bob.paymentKeyHashHex}` };
            expect(await index.tokensHeldBy([bobs.stake, bobs.pay])).toEqual([row(names.E, chain.addressOf(bob), bobs, remintE, 0, blocks.third)]);
            expect(await index.tokensHeldBy([])).toEqual([]);
        });

        test('transaction: the block of each transaction that touches the policy; null for the rest', async () => {
            const { mint, others, mixed, moveB, burnC, burnE, remintE, ada, payment, blocks } = s;
            const at = block => ({ blockNo: block.blockNo, slot: block.slot });
            for (const hash of [mint.A, mint.B, mint.C, mint.D, mint.E, mixed.txHash]) {
                expect(await index.transaction(hash)).toEqual(at(blocks.first));
            }
            // tokens of the policy, but no user token: not in the index
            expect(await index.transaction(others.txHash)).toBeNull();
            // a burn makes no output with the token, it only spends one
            expect(await index.transaction(burnC)).toEqual(at(blocks.second));
            expect(await index.transaction(moveB)).toEqual(at(blocks.second));
            expect(await index.transaction(burnE)).toEqual(at(blocks.second));
            expect(await index.transaction(remintE)).toEqual(at(blocks.third));
            expect(await index.transaction(ada.txHash)).toBeNull();
            expect(await index.transaction(payment)).toBeNull();
            expect(await index.transaction('0'.repeat(64))).toBeNull();
        });

        test('mintOf: the first mint of the user token, also once it moved, burned or was minted again; null for one never minted', async () => {
            const { names, mint, blocks } = s;
            const minted = txHash => ({ txHash, blockNo: blocks.first.blockNo, time: blocks.first.time });
            expect(await index.mintOf(names.A)).toEqual(minted(mint.A));
            expect(await index.mintOf(names.B)).toEqual(minted(mint.B));
            expect(await index.mintOf(names.C)).toEqual(minted(mint.C));
            // minted, burned and minted again: the first mint, not the later one
            expect(await index.mintOf(names.E)).toEqual(minted(mint.E));
            expect(await index.mintOf(userName(404))).toBeNull();
            // the reference token's mint is not in the index
            expect(await index.mintOf(referenceName(1))).toBeNull();
        });

        test('eventsAmong: the asked names the policy has minted and those it has burned, also once moved or minted again; held but never minted, or unknown: in neither', async () => {
            const { names } = s;
            const asked = [names.A, names.B, names.C, names.D, names.E, names.F, referenceName(1), referenceName(3), 'cafe', userName(404), names.A];
            // 'cafe' and F sit in outputs, but no mint of the policy made them; the reference tokens'
            // mints and burns (C's burn burns its reference token too) are not in the index
            expect(await index.eventsAmong(asked)).toEqual({
                minted: new Set([names.A, names.B, names.C, names.D, names.E]),
                burned: new Set([names.C, names.E]),
            });
            expect(await index.eventsAmong([userName(404), 'cafe'])).toEqual({ minted: new Set(), burned: new Set() });
            expect(await index.eventsAmong([])).toEqual({ minted: new Set(), burned: new Set() });
        });

        test('burnsOf: one entry per burn and asked user token, with the keys of the address that held it; unburned, unknown and reference names absent', async () => {
            const { names, ann, bob, burnC, burnE, burnGH, blocks } = s;
            const asked = [names.A, names.B, names.C, names.D, names.E, names.F, names.G, names.H, referenceName(3), referenceName(7), 'cafe', userName(404)];
            const burn = (assetName, txHash, holder) => ({ assetName, txHash, block: blocks.second.blockNo, holder });
            const byKey = rows => [...rows].sort((a, b) => `${a.block}#${a.txHash}#${a.assetName}`.localeCompare(`${b.block}#${b.txHash}#${b.assetName}`));
            expect(byKey(await index.burnsOf(asked))).toEqual(
                byKey([
                    burn(names.C, burnC, { stake: bob.stakeKeyHashHex, payment: bob.paymentKeyHashHex, script: false }),
                    // burned at Ann's base address, then minted again (to Bob): the burn stays
                    burn(names.E, burnE, { stake: ann.stakeKeyHashHex, payment: ann.paymentKeyHashHex, script: false }),
                    // one transaction, two tokens: an entry each; an enterprise address has no stake part
                    burn(names.G, burnGH, { stake: null, payment: ann.paymentKeyHashHex, script: false }),
                    // a script held it: its payment credential is the script's hash, its stake part Ann's key
                    burn(names.H, burnGH, { stake: ann.stakeKeyHashHex, payment: '5c'.repeat(28), script: true }),
                ])
            );
            expect(await index.burnsOf([names.A, names.B, referenceName(3), userName(404)])).toEqual([]);
            expect(await index.burnsOf([])).toEqual([]);
        });

        test(`burnsOf: at most ${MAX_ASSET_NAMES} names per call, more is a RangeError`, async () => {
            const many = Array.from({ length: MAX_ASSET_NAMES }, (_, n) => userName(1000 + n));
            many[3] = s.names.C;
            expect((await index.burnsOf(many)).map(found => found.assetName)).toEqual([s.names.C]);
            await expect(index.burnsOf([...many, userName(1)])).rejects.toThrow(RangeError);
        });

        test(`eventsAmong: at most ${MAX_ASSET_NAMES} names per call, more is a RangeError`, async () => {
            const many = Array.from({ length: MAX_ASSET_NAMES }, (_, n) => userName(1000 + n));
            many[7] = s.names.C;
            many[9] = s.names.A;
            expect(await index.eventsAmong(many)).toEqual({ minted: new Set([s.names.A, s.names.C]), burned: new Set([s.names.C]) });
            await expect(index.eventsAmong([...many, userName(1)])).rejects.toThrow(RangeError);
        });
    });
};

module.exports = { indexContract };
