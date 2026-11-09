// Cardano keys for tests, and challenges signed with them exactly as the game signs them
// (apps/pwa/src/cardano/keys.js): CIP-30 signData with the stake key over the challenge text.

const request = require('supertest');
const { PrivateKey, KeyHash, RewardAccount, Address, COSE } = require('@evolution-sdk/evolution');

const hex = bytes => Buffer.from(bytes).toString('hex');

/**
 * A key of 24 words (new ones unless given): { words, stakeKey, stakeKeyHashHex, rewardAddress,
 * rewardAddressHex }, and as a wallet without a stake key would sign (plan 3): { paymentKey,
 * paymentKeyHashHex, baseAddress, baseAddressHex, enterpriseAddress, enterpriseAddressHex }.
 */
const testKeys = ({ words = PrivateKey.generateMnemonic(256), networkId = 0 } = {}) => {
    const stakeKey = PrivateKey.fromMnemonicCardano(words, { role: 2 });
    const hash = KeyHash.fromVKey(PrivateKey.toPublicKey(stakeKey));
    const account = new RewardAccount.RewardAccount({ networkId, stakeCredential: hash });
    const paymentKey = PrivateKey.fromMnemonicCardano(words, { role: 0 });
    const paymentHash = KeyHash.fromVKey(PrivateKey.toPublicKey(paymentKey));
    const base = new Address.Address({ networkId, paymentCredential: paymentHash, stakingCredential: hash });
    const enterprise = new Address.Address({ networkId, paymentCredential: paymentHash });
    return {
        words,
        stakeKey,
        stakeKeyHashHex: KeyHash.toHex(hash),
        rewardAddress: RewardAccount.toBech32(account),
        rewardAddressHex: RewardAccount.toHex(account),
        paymentKey,
        paymentKeyHashHex: KeyHash.toHex(paymentHash),
        baseAddress: Address.toBech32(base),
        baseAddressHex: Address.toHex(base),
        enterpriseAddress: Address.toBech32(enterprise),
        enterpriseAddressHex: Address.toHex(enterprise),
    };
};

/**
 * CIP-30 signData of `message` by `keys`, as hex: { signature, key }. `with` picks the address a
 * wallet signs with: 'stake' (the reward address and stake key), 'base' or 'enterprise' (the
 * payment key).
 */
const signMessage = (keys, message, { with: kind = 'stake' } = {}) => {
    const [addressHex, key] = {
        stake: [keys.rewardAddressHex, keys.stakeKey],
        base: [keys.baseAddressHex, keys.paymentKey],
        enterprise: [keys.enterpriseAddressHex, keys.paymentKey],
    }[kind];
    const signed = COSE.SignData.signData(addressHex, COSE.Utils.fromText(message), key);
    return { signature: hex(signed.signature), key: hex(signed.key) };
};

/**
 * Asks `app` for a challenge (with `account`'s token for a link) and signs it: resolves with the
 * body for POST /auth/cardano/verify and the challenge.
 */
const signedChallenge = async (app, { keys, purpose, account, address = keys.rewardAddress, with: kind = 'stake' }) => {
    const body = { purpose, address };
    const asked = account ? account.post('/auth/cardano/challenge', body) : request(app).post('/auth/cardano/challenge').send(body);
    const challenge = (await asked.expect(200)).body;
    return { challenge, verify: { nonce: challenge.nonce, ...signMessage(keys, challenge.message, { with: kind }) } };
};

/**
 * A confirm token for `account` (plan 2: key changes need a proof by an existing key), signed by
 * `keys`, which must be linked to that account. Resolves with the whole answer of /verify.
 */
const confirmWith = async (app, account, keys) => {
    const { verify } = await signedChallenge(app, { keys, purpose: 'confirm', account });
    return account.post('/auth/cardano/verify', verify);
};

/** Links `keys` to `account` with a confirm token (header X-Battlechoc-Confirm). */
const linkConfirmed = async (app, account, keys, confirmToken) => {
    const { verify } = await signedChallenge(app, { keys, purpose: 'link', account });
    return request(app).post('/auth/cardano/verify').set('Authorization', `Bearer ${account.accessToken}`)
        .set('X-Battlechoc-Confirm', confirmToken).send(verify);
};

/** Removes the key `subject` of `account`, with a confirm token when one is given. */
const removeKey = (app, account, subject, confirmToken) => {
    const sent = request(app).delete(`/user/identities/${encodeURIComponent(subject)}`).set('Authorization', `Bearer ${account.accessToken}`);
    return confirmToken ? sent.set('X-Battlechoc-Confirm', confirmToken) : sent;
};

module.exports = { testKeys, signMessage, signedChallenge, confirmWith, linkConfirmed, removeKey };
