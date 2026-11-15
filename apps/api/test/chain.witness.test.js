// The two-party signing (plan B, Task 8): the player's wallet answers CIP-30 signTx(tx, true) with
// a witness set, verifyWitness checks it against the transaction the server stored and splices
// it in, and addServerWitness adds the server's signature last. On a built mint and a built burn.

const { CBOR, Effect, KeyHash, PrivateKey, Transaction, TransactionBody, TransactionHash, TransactionWitnessSet, VKey, preprod: preprodChain } = require('@evolution-sdk/evolution');
const { createAikenEvaluator } = require('@evolution-sdk/aiken-uplc');
const { ED25519_TORSION_SUBGROUP, ed25519 } = require('@noble/curves/ed25519.js');
const { bytesToNumberLE, concatBytes, numberToBytesLE } = require('@noble/curves/utils.js');
const { sha256, sha512 } = require('@noble/hashes/sha2.js');
const { ChainTxError, addServerWitness, buildBurn, buildMint, verifyWitness } = require('../src/chain/tx');
const { assetNamesOf, itemDatum } = require('../src/chain/names');
const { TIP, loadParams, fixtureKey, fixtureContracts, scriptDataOf, costModelsOf, ledgerMinimumFeeOf, utxo, walletWitness } = require('./helpers/chain');

const params = loadParams();
const owner = fixtureKey('owner');
const second = fixtureKey('owner-2');
const server = fixtureKey('server');
const stranger = fixtureKey('stranger');
const ownerAddress = owner.baseAddress('owner-stake');
const ownerOfWallet = { keyHash: owner.keyHash, address: ownerAddress };
const contracts = fixtureContracts();
const { policyId } = contracts;
const evaluator = createAikenEvaluator;

// The mint's wallet
const seed = utxo({ address: ownerAddress, lovelace: 20_000_000n, txId: 'a1'.repeat(32), index: 1 });
const spare = utxo({ address: ownerAddress, lovelace: 8_000_000n, txId: 'a2'.repeat(32), index: 0 });
// The item a burn salvages: its store and its user token
const names = assetNamesOf(`${'a1'.repeat(32)}#1`);
const store = utxo({
    address: contracts.itemsAddress,
    lovelace: 2_396_360n,
    tokens: { [policyId + names.reference]: 1n },
    txId: '5e'.repeat(32),
    index: 0,
    datum: itemDatum({ item: { key: 'DARK_WALLS', name: 'Dark chocolate walls', serial: 7 }, userAssetName: names.user }),
});
const held = utxo({ address: ownerAddress, lovelace: 1_200_000n, tokens: { [policyId + names.user]: 1n }, txId: 'b7'.repeat(32), index: 2 });

const mintOf = utxos => buildMint({ item: { key: 'DARK_WALLS', serial: 7 }, fee: 0, owner: ownerOfWallet, utxos, params, tip: TIP, contracts, serverKeyHash: server.keyHash });
const burnOf = utxos => buildBurn({ assetName: names.user, holder: ownerOfWallet, utxos, reference: store, params, tip: TIP, contracts, serverKeyHash: server.keyHash });

// each transaction with the UTxOs its inputs and reference inputs spend or read
const TRANSACTIONS = {
    mint: { build: () => mintOf([spare, seed]), resolved: [seed, spare, contracts.configUtxo] },
    burn: { build: () => burnOf([spare, held]), resolved: [spare, held, store] },
};

const thrown = fn => {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return undefined;
};
const codeOf = error => (error instanceof ChainTxError ? error.code : error);
const bodyBytesOf = cbor => Buffer.from(Transaction.extractBodyBytes(Buffer.from(cbor, 'hex'))).toString('hex');
const vkeysOf = cbor => Transaction.fromCBORHex(cbor).witnessSet.vkeyWitnesses ?? [];
const signersOf = cbor => vkeysOf(cbor).map(witness => KeyHash.toHex(KeyHash.fromVKey(witness.vkey)));

// A witness set written by hand: the vkey witnesses of `keys` over `cbor`'s body as a plain
// array, with `entries` ([key, value]) after them
const rawWitnessSet = (cbor, keys, entries = []) => {
    const bodyHash = TransactionHash.toBytes(TransactionBody.toHashFromBytes(Transaction.extractBodyBytes(Buffer.from(cbor, 'hex'))));
    const vkeys = keys.map(key => [VKey.toBytes(PrivateKey.toPublicKey(key.privateKey)), PrivateKey.sign(key.privateKey, bodyHash).bytes]);
    return CBOR.toCBORHex(new Map([...(keys.length > 0 ? [[0n, vkeys]] : []), ...entries]), CBOR.CANONICAL_OPTIONS);
};

// The ledger's minimum fee of a signed transaction, with the fixture's parameters
const minimumFeeOf = cbor => ledgerMinimumFeeOf(cbor, params);

// A witness set of vkey witnesses given as bytes ({ vkey, signature }), in either form of a set
const witnessSetOf = (witnesses, { tagged }) => {
    const vkeys = witnesses.map(({ vkey, signature }) => [vkey, signature]);
    return CBOR.toCBORHex(new Map([[0n, tagged ? CBOR.Tag.make({ tag: 258, value: vkeys }) : vkeys]]), CBOR.CANONICAL_OPTIONS);
};

// Signatures that a cofactored check (ZIP-215, and noble's strict mode as well) accepts and the
// node (libsodium: cofactorless, R and the key not of small order) refuses, made by someone who
// holds the key: the owner's (the fixture's seed sha256('owner')). [s]B = R + [k]A is the
// node's equation, k = sha512(R ‖ A ‖ message) mod ℓ; the cofactored one is [8][s]B = [8]R + [8][k]A.
const { Point } = ed25519;
const ORDER = Point.Fn.ORDER;
const scalarOf = bytes => bytesToNumberLE(bytes) % ORDER;
const challengeOf = (r, a, message) => scalarOf(sha512(concatBytes(r, a, message)));
const sBytes = s => numberToBytesLE(s % ORDER, 32);
const NONCE = scalarOf(sha512(Buffer.from('a fixed nonce', 'utf8')));
const ownerSecret = () => ed25519.utils.getExtendedPublicKey(sha256(Buffer.from('owner', 'utf8')));
// a point of order 8, and the identity (order 1)
const EIGHT = Point.fromHex(ED25519_TORSION_SUBGROUP[1]);
const IDENTITY = Point.ZERO.toBytes();
const SMALL_ORDER = {
    // R = [r]B + T, T of order 8: [s]B − [k]A = R − T ≠ R
    'R with a small-order component': message => {
        const { scalar, pointBytes } = ownerSecret();
        const r = Point.BASE.multiply(NONCE).add(EIGHT).toBytes();
        return { vkey: pointBytes, signature: concatBytes(r, sBytes(NONCE + challengeOf(r, pointBytes, message) * scalar)) };
    },
    // R = the identity and s = k·a: [s]B − [k]A is the identity, so even the node's equation holds
    'R of small order': message => {
        const { scalar, pointBytes } = ownerSecret();
        return { vkey: pointBytes, signature: concatBytes(IDENTITY, sBytes(challengeOf(IDENTITY, pointBytes, message) * scalar)) };
    },
    // the key is the identity: [k]A vanishes, any R = [s]B verifies (a key nobody owns, beside the owner's witness)
    'a key of small order': () => ({ vkey: IDENTITY, signature: concatBytes(Point.BASE.multiply(NONCE).toBytes(), sBytes(NONCE)) }),
};

describe.each(Object.keys(TRANSACTIONS))('the signing of a %s', kind => {
    let built;
    let other;
    beforeAll(async () => {
        built = await TRANSACTIONS[kind].build();
        // the other kind: another body
        other = await TRANSACTIONS[kind === 'mint' ? 'burn' : 'mint'].build();
    });
    const verify = (witness, overrides = {}) => verifyWitness({ cbor: built.cbor, bodyHash: built.bodyHash, witness, requiredWitnesses: built.requiredWitnesses, ...overrides });
    const refusal = (witness, overrides) => codeOf(thrown(() => verify(witness, overrides)));

    test('the wallet signs for the owner alone', () => {
        expect(built.requiredWitnesses).toEqual([owner.keyHash]);
    });

    describe.each([
        ['tagged (tag 258)', true],
        ['untagged', false],
    ])('a wallet that writes its vkey witnesses %s', (_, tagged) => {
        let witness;
        let walletSigned;
        let fullySigned;
        beforeAll(() => {
            witness = walletWitness(built.cbor, [owner.privateKey], { tagged });
            walletSigned = verify(witness);
            fullySigned = addServerWitness({ cbor: walletSigned.cbor, bodyHash: built.bodyHash, key: server }).cbor;
        });

        test('the wallet answers in this form', () => {
            expect(witness.startsWith(tagged ? 'a100d90102' : 'a10081')).toBe(true);
        });

        test('wallet, then server: two witnesses and the body bytes unchanged at each step', () => {
            expect(walletSigned.signers).toEqual([owner.keyHash]);
            expect(signersOf(walletSigned.cbor)).toEqual([owner.keyHash]);
            expect(bodyBytesOf(walletSigned.cbor)).toBe(bodyBytesOf(built.cbor));
            // the server last
            expect(signersOf(fullySigned)).toEqual([owner.keyHash, server.keyHash]);
            expect(bodyBytesOf(fullySigned)).toBe(bodyBytesOf(built.cbor));
            // both signatures verify over the stored body hash
            for (const { vkey, signature } of vkeysOf(fullySigned)) {
                expect(VKey.verify(vkey, Buffer.from(built.bodyHash, 'hex'), signature.bytes)).toBe(true);
            }
        });

        test('the same transaction whichever form the wallet wrote', () => {
            expect(walletSigned.cbor).toBe(verify(walletWitness(built.cbor, [owner.privateKey], { tagged: !tagged })).cbor);
        });

        test('after both merges the redeemers are the same bytes and still match the script data hash', () => {
            const before = scriptDataOf(built.cbor, params);
            const after = scriptDataOf(fullySigned, params);
            expect(after.written).toBe(true);
            expect(after.redeemerBytes).toBe(before.redeemerBytes);
            expect(after.witnessDatums).toEqual([]);
            expect(after.declared).toBe(after.computed);
        });

        test('the signed transaction passes the scripts again', async () => {
            const context = { costModels: costModelsOf(params), maxTxExSteps: params.maxTxExSteps, maxTxExMem: params.maxTxExMem, slotConfig: preprodChain.slotConfig };
            const tx = Transaction.fromCBORHex(fullySigned);
            const evaluated = await Effect.runPromise(evaluator.evaluate(tx, TRANSACTIONS[kind].resolved, context));
            const redeemers = tx.witnessSet.redeemers.toArray();
            expect(evaluated).toHaveLength(redeemers.length);
            // the same budgets the builder put into the redeemers
            for (const result of evaluated) {
                const redeemer = redeemers.find(candidate => candidate.tag === result.redeemer_tag && Number(candidate.index) === Number(result.redeemer_index));
                expect(result.ex_units.mem).toBe(redeemer.exUnits.mem);
                expect(result.ex_units.steps).toBe(redeemer.exUnits.steps);
            }
        });

        test('the network fee covers the signed size', () => {
            expect(minimumFeeOf(fullySigned)).toBeLessThanOrEqual(BigInt(built.networkFee));
        });
    });

    test('a witness over another body → BAD_WITNESS', () => {
        // the owner's key, its signature over the other transaction
        expect(refusal(walletWitness(other.cbor, [owner.privateKey]))).toBe('BAD_WITNESS');
    });

    test('a forged signature → BAD_WITNESS, also on a key the transaction does not need', () => {
        const forged = witness => {
            const set = TransactionWitnessSet.fromCBORHex(witness);
            const [first, ...rest] = set.vkeyWitnesses;
            const bytes = Uint8Array.from(first.signature.bytes);
            bytes[0] ^= 1;
            const vkeys = [first, ...rest].map((entry, i) => [VKey.toBytes(entry.vkey), i === 0 ? bytes : entry.signature.bytes]);
            return CBOR.toCBORHex(new Map([[0n, vkeys]]), CBOR.CANONICAL_OPTIONS);
        };
        expect(refusal(forged(walletWitness(built.cbor, [owner.privateKey])))).toBe('BAD_WITNESS');
        // the owner's signature is good, the stranger's is not: every signature must verify
        expect(refusal(forged(walletWitness(built.cbor, [stranger.privateKey, owner.privateKey])))).toBe('BAD_WITNESS');
        // the stranger's vkey with the owner's signature
        const [ownerWitness] = TransactionWitnessSet.fromCBORHex(walletWitness(built.cbor, [owner.privateKey])).vkeyWitnesses;
        const swapped = CBOR.toCBORHex(new Map([[0n, [[VKey.toBytes(PrivateKey.toPublicKey(stranger.privateKey)), ownerWitness.signature.bytes], [VKey.toBytes(ownerWitness.vkey), ownerWitness.signature.bytes]]]]), CBOR.CANONICAL_OPTIONS);
        expect(refusal(swapped)).toBe('BAD_WITNESS');
    });

    describe('a witness set with more than vkey witnesses → BAD_WITNESS', () => {
        const vkeyBytes = () => VKey.toBytes(PrivateKey.toPublicKey(owner.privateKey));
        const EXTRAS = {
            'a native script': () => [1n, [[0n, Buffer.from(owner.keyHash, 'hex')]]],
            'a bootstrap witness': () => [2n, [[vkeyBytes(), new Uint8Array(64), new Uint8Array(32), new Uint8Array([0xa0])]]],
            'a Plutus V1 script': () => [3n, [new Uint8Array([0x4e, 0x4d, 0x01, 0x00, 0x00])]],
            'a datum': () => [4n, [42n]],
            'a redeemer': () => [5n, [[0n, 0n, 42n, [1n, 1n]]]],
            'a Plutus V2 script': () => [6n, [new Uint8Array([0x4e, 0x4d, 0x01, 0x00, 0x00])]],
            'a Plutus V3 script': () => [7n, [Uint8Array.from(contracts.items.script.bytes)]],
            'a key the ledger does not know': () => [8n, 0n],
        };
        test.each(Object.keys(EXTRAS))('%s', name => {
            const witness = rawWitnessSet(built.cbor, [owner], [EXTRAS[name]()]);
            // the SDK reads it, the owner's signature is good: only the vkey-only rule refuses it
            expect(() => TransactionWitnessSet.fromCBORHex(witness)).not.toThrow();
            expect(signersOf(Transaction.addVKeyWitnessesHex(built.cbor, witness))).toEqual([owner.keyHash]);
            expect(refusal(witness)).toBe('BAD_WITNESS');
        });
    });

    test('garbage hex → BAD_WITNESS', () => {
        const valid = walletWitness(built.cbor, [owner.privateKey]);
        for (const witness of [
            'zz',
            '',
            'abc',
            'a1',
            '00',
            valid + '00',
            valid.slice(0, -2),
            valid.toUpperCase().replace(/^A1/, 'XX'),
            // a whole transaction instead of a witness set
            built.cbor,
            // no vkey witness at all, or the set under another tag
            'a0',
            CBOR.toCBORHex(new Map([[0n, []]]), CBOR.CANONICAL_OPTIONS),
            CBOR.toCBORHex(new Map([[0n, CBOR.Tag.make({ tag: 259, value: TransactionWitnessSet.fromCBORHex(valid).vkeyWitnesses.map(entry => [VKey.toBytes(entry.vkey), entry.signature.bytes]) })]]), CBOR.CANONICAL_OPTIONS),
            null,
            undefined,
            42,
            Buffer.from(valid, 'hex'),
        ]) {
            expect(refusal(witness)).toBe('BAD_WITNESS');
        }
    });

    test('missing the owner → MISSING_SIGNATURE', () => {
        expect(refusal(walletWitness(built.cbor, [stranger.privateKey]))).toBe('MISSING_SIGNATURE');
        expect(refusal(walletWitness(built.cbor, [stranger.privateKey], { tagged: false }))).toBe('MISSING_SIGNATURE');
        // the server's own key is no wallet key
        expect(refusal(walletWitness(built.cbor, [server.privateKey]))).toBe('MISSING_SIGNATURE');
    });

    test("an extra key's witness is left out", () => {
        const result = verify(walletWitness(built.cbor, [stranger.privateKey, owner.privateKey, server.privateKey]));
        expect(result.signers).toEqual([owner.keyHash]);
        expect(signersOf(result.cbor)).toEqual([owner.keyHash]);
        // and the same witness twice counts once
        const twice = verify(rawWitnessSet(built.cbor, [owner, owner]));
        expect(signersOf(twice.cbor)).toEqual([owner.keyHash]);
        expect(twice.cbor).toBe(verify(walletWitness(built.cbor, [owner.privateKey])).cbor);
    });

    test('a changed cbor → BODY_CHANGED', () => {
        const witness = walletWitness(built.cbor, [owner.privateKey]);
        // another body under the stored body hash
        expect(refusal(witness, { cbor: other.cbor })).toBe('BODY_CHANGED');
        expect(refusal(witness, { cbor: 'zz' })).toBe('BODY_CHANGED');
        // the server does not sign it either
        expect(codeOf(thrown(() => addServerWitness({ cbor: other.cbor, bodyHash: built.bodyHash, key: server })))).toBe('BODY_CHANGED');
    });

    test('a refusal names its code only', () => {
        const error = thrown(() => verify(walletWitness(other.cbor, [owner.privateKey])));
        expect(error.message).toBe('BAD_WITNESS');
        expect(error.cause).toBeUndefined();
    });

    test('required witnesses that are not a non-empty list of key hashes → BAD_REQUIRED_WITNESSES, whatever the witness', () => {
        // with nothing required, a stranger's good witness would leave the player's out: a body
        // the server signs and the player completes alone
        const witnesses = [walletWitness(built.cbor, [stranger.privateKey]), walletWitness(built.cbor, [owner.privateKey])];
        const malformed = [
            undefined,
            null,
            [],
            owner.keyHash,
            new Set([owner.keyHash]),
            { 0: owner.keyHash, length: 1 },
            [owner.keyHash, 'zz'],
            [owner.keyHash, 42],
            [owner.keyHash, owner.keyHash.toUpperCase()],
            [owner.keyHash.slice(2)],
            [`${owner.keyHash}00`],
        ];
        for (const requiredWitnesses of malformed) {
            for (const witness of witnesses) {
                expect([requiredWitnesses, refusal(witness, { requiredWitnesses })]).toEqual([requiredWitnesses, 'BAD_REQUIRED_WITNESSES']);
            }
        }
    });

    describe.each([
        ['tagged (tag 258)', true],
        ['untagged', false],
    ])('a signature a cofactored check takes and the node refuses, %s → BAD_WITNESS', (_, tagged) => {
        const message = () => Buffer.from(built.bodyHash, 'hex');
        const ordinary = () => {
            const [entry] = TransactionWitnessSet.fromCBORHex(walletWitness(built.cbor, [owner.privateKey])).vkeyWitnesses;
            return { vkey: VKey.toBytes(entry.vkey), signature: entry.signature.bytes };
        };

        test('an ordinary signature in this form passes', () => {
            expect(verify(witnessSetOf([ordinary()], { tagged })).signers).toEqual([owner.keyHash]);
        });

        test.each(Object.keys(SMALL_ORDER))('%s', name => {
            const odd = SMALL_ORDER[name](message());
            // what the SDK's VKey.verify (ZIP-215) answers for it
            expect(VKey.verify(VKey.fromBytes(odd.vkey), message(), odd.signature)).toBe(true);
            // the owner's ordinary witness beside a key nobody owns; else the owner's key itself
            const witnesses = odd.vkey === IDENTITY ? [ordinary(), odd] : [odd];
            expect(refusal(witnessSetOf(witnesses, { tagged }))).toBe('BAD_WITNESS');
        });
    });

    describe('the server signs last, once, and only where the body requires it', () => {
        const walletSigned = () => verify(walletWitness(built.cbor, [owner.privateKey])).cbor;
        const serverSigns = (cbor, key = server) => codeOf(thrown(() => addServerWitness({ cbor, bodyHash: built.bodyHash, key })));

        test('a second witness of its key → SERVER_ALREADY_SIGNED', () => {
            const { cbor } = addServerWitness({ cbor: walletSigned(), bodyHash: built.bodyHash, key: server });
            expect(serverSigns(cbor)).toBe('SERVER_ALREADY_SIGNED');
            expect(signersOf(cbor)).toEqual([owner.keyHash, server.keyHash]);
        });

        test('a key that is not a required signer of the body → SERVER_KEY_NOT_REQUIRED', () => {
            expect(serverSigns(walletSigned(), stranger)).toBe('SERVER_KEY_NOT_REQUIRED');
            expect(serverSigns(built.cbor, stranger)).toBe('SERVER_KEY_NOT_REQUIRED');
        });
    });
});

describe("a holder's burn, without the server", () => {
    test('requires no server witness: the server key → SERVER_KEY_NOT_REQUIRED', async () => {
        const built = await buildBurn({ assetName: names.user, holder: ownerOfWallet, utxos: [spare, held], reference: store, params, tip: TIP, contracts, serverKeyHash: null });
        const { cbor } = verifyWitness({ cbor: built.cbor, bodyHash: built.bodyHash, witness: walletWitness(built.cbor, [owner.privateKey]), requiredWitnesses: built.requiredWitnesses });
        expect(codeOf(thrown(() => addServerWitness({ cbor, bodyHash: built.bodyHash, key: server })))).toBe('SERVER_KEY_NOT_REQUIRED');
    });
});

describe("noble's strict mode (zip215: false) alone", () => {
    // why verifyWitness checks more than ed25519.verify(…, { zip215: false }): noble's check is
    // cofactored in both of its modes; its strict mode refuses only a key of small order
    const message = sha256(Buffer.from('a message', 'utf8'));
    test.each([
        ['R with a small-order component', true],
        ['R of small order', true],
        ['a key of small order', false],
    ])('%s: %s', (name, taken) => {
        const { vkey, signature } = SMALL_ORDER[name](message);
        expect(ed25519.verify(signature, message, vkey, { zip215: false })).toBe(taken);
    });
});

describe('a multi-address wallet', () => {
    // two payment keys of the same wallet (same stake key), neither holding enough alone
    const secondAddress = second.baseAddress('owner-stake');
    const own = utxo({ address: ownerAddress, lovelace: 4_000_000n, txId: 'c1'.repeat(32), index: 0 });
    const others = utxo({ address: secondAddress, lovelace: 4_000_000n, txId: 'c2'.repeat(32), index: 0 });
    const heldElsewhere = utxo({ address: secondAddress, lovelace: 1_200_000n, tokens: { [policyId + names.user]: 1n }, txId: 'c3'.repeat(32), index: 0 });

    test.each([
        ['mint', () => mintOf([own, others])],
        ['burn', () => burnOf([own, heldElsewhere])],
    ])('a %s must be signed for every input key', async (_, build) => {
        const built = await build();
        expect(built.requiredWitnesses).toEqual([owner.keyHash, second.keyHash].sort());
        const verify = keys => verifyWitness({ cbor: built.cbor, bodyHash: built.bodyHash, witness: walletWitness(built.cbor, keys), requiredWitnesses: built.requiredWitnesses });
        expect(codeOf(thrown(() => verify([owner.privateKey])))).toBe('MISSING_SIGNATURE');
        expect(codeOf(thrown(() => verify([second.privateKey])))).toBe('MISSING_SIGNATURE');
        const signed = verify([second.privateKey, owner.privateKey]);
        expect(signed.signers).toEqual([owner.keyHash, second.keyHash].sort());
        const { cbor } = addServerWitness({ cbor: signed.cbor, bodyHash: built.bodyHash, key: server });
        expect(signersOf(cbor).sort()).toEqual([owner.keyHash, second.keyHash, server.keyHash].sort());
        expect(minimumFeeOf(cbor)).toBeLessThanOrEqual(BigInt(built.networkFee));
    });
});
