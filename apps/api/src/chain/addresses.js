// Who holds what an address holds, and where a subject's funds are looked up.
//
// The subjects of an address (spec 6.2): its payment key as 'pay:<hash>' and, when its stake part
// is a key, its stake key as 'stake:<hash>'. An address whose payment credential is a script (a
// marketplace listing, the reference-token store) is held by nobody, whatever its stake part. The
// kind of an address is read from its header, as cardano.keyOfAddress does: a reward address and
// an enterprise address are both 29 bytes, and only the header tells them apart.

const { AddressEras, KeyHash, ScriptHash } = require('@evolution-sdk/evolution');
const { addressOfSubject } = require('../cardano');

const SUBJECT = /^(stake|pay):[0-9a-f]{56}$/;
// the kinds of address that can hold a UTxO for a key (Byron addresses are left out: no player
// links one)
const PAYMENT_ADDRESSES = ['BaseAddress', 'EnterpriseAddress', 'PointerAddress'];

const nobody = () => ({ stake: null, pay: null });

/**
 * The subjects of the address `bech32`: { stake: 'stake:<hash>' | null, pay: 'pay:<hash>' | null }.
 * A key payment credential gives `pay`; `stake` only comes with it, from a base address whose
 * stake part is a key (a script stake part, a pointer or none: null). A script payment
 * credential, a reward address, a Byron address and anything that is no address: nobody, both
 * null. The network does not change the subjects.
 */
const holderOf = bech32 => {
    let address;
    try {
        address = AddressEras.fromBech32(bech32);
    } catch {
        return nobody();
    }
    return holderOfAddress(address);
};

/**
 * The keys of an address the SDK has read (AddressEras's: any era, Byron included): { stake,
 * payment, script }. `payment` is the hash (hex) of its payment credential, a key's or a script's
 * (`script` says which); `stake` the hash of a base address's stake KEY (a script stake part, a
 * pointer or none: null). Anything that is no payment address (reward, Byron, nothing): both null,
 * `script` false. The one reader of an address's keys: holderOfAddress and the chain index's burns
 * (chainIndex.holderKeysOf) both start from it.
 */
const keysOfAddress = address => {
    const credential = PAYMENT_ADDRESSES.includes(address?._tag) ? address.paymentCredential : null;
    const script = credential instanceof ScriptHash.ScriptHash;
    if (!script && !(credential instanceof KeyHash.KeyHash)) {
        return { stake: null, payment: null, script: false };
    }
    const stake = address._tag === 'BaseAddress' && address.stakeCredential instanceof KeyHash.KeyHash ? KeyHash.toHex(address.stakeCredential) : null;
    return { stake, payment: script ? ScriptHash.toHex(credential) : KeyHash.toHex(credential), script };
};

/** The subjects of keysOfAddress's `keys`: { stake: 'stake:<hash>' | null, pay: 'pay:<hash>' | null }; nobody for a script or no payment key. */
const subjectsOfKeys = keys =>
    keys.script || keys.payment === null ? nobody() : { stake: keys.stake === null ? null : `stake:${keys.stake}`, pay: `pay:${keys.payment}` };

/** holderOf for an address the SDK has read already (AddressEras's: any era, Byron included). */
const holderOfAddress = address => subjectsOfKeys(keysOfAddress(address));

/**
 * The address (bech32) on `network` whose funds are the funds of `subject`: for 'stake:<hash>' its
 * reward address (the provider lists the UTxOs of every address of that account), for
 * 'pay:<hash>' its enterprise address. A TypeError for anything that is not a subject.
 */
const addressOfSubjectForFunds = (subject, network) => {
    if (typeof subject !== 'string' || !SUBJECT.test(subject)) {
        throw new TypeError('not a subject (stake:<key hash> or pay:<key hash>)');
    }
    return addressOfSubject(subject, network);
};

module.exports = { holderOf, holderOfAddress, keysOfAddress, subjectsOfKeys, addressOfSubjectForFunds };
