// The addresses a wallet names as its own (minting plan D, ruling D21). For a 'stake:' subject the
// provider lists every address with that stake key, whatever its payment key, and plan B's
// ownerOf makes the richest the owner: anyone can park ADA at an address of their own payment key
// and a player's stake key, and every mint of that player would be built for them (and could
// never be signed). Only the player's wallet can say which addresses are its own: CIP-30's
// getChangeAddress, getUsedAddresses and getUnusedAddresses, hex-encoded. A mint built from them
// spends and pays to those addresses only (a burn of plan E the same, with a proof text of its
// own). Named under the player's session (POST /chain/mint, POST /chain/burn) the
// list counts as the player's; named with a sign code alone (the sign page), the subject's key must
// sign for it: CIP-30 signData of the payload below, checked as the wallet sign-in checks it.

const { Address, AddressEras } = require('@evolution-sdk/evolution');
const { holderOfAddress } = require('./addresses');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { HttpError, ErrorCode } = require('../errors');
const { verifySignedData, signedAddressOf, keyOfAddress, addressOfSubject } = require('../cardano');

// the domain the address proof names (the game's, as in the sign-in's challenge)
const PROOF_DOMAIN = 'battlechoc.com';

/** The most addresses a request may name (the game sends at most this many). */
const MAX_WALLET_ADDRESSES = 100;
// hex of one address: Shelley addresses are at most 57 bytes; Byron ones are longer, never this long
const MAX_ADDRESS_HEX = 256;
const HEX = /^(?:[0-9a-fA-F]{2})+$/;

/** A list of addresses that is not one: `code` 'INVALID' (its shape) or 'NOT_THE_SUBJECTS' (an address of another wallet). */
class WalletAddressError extends Error {
    constructor(code) {
        super(code);
        this.name = 'WalletAddressError';
        this.code = code;
    }
}

// One entry of a request's list: { hex (lower case), holder (addresses.holderOfAddress's subjects) }.
// A Byron address holds for nobody (no key subject can be read from it, and the SDK writes no
// bech32 for it): it is kept here to be left out later, on any network, as the SDK reads every
// Byron address with networkId 0.
const entryOf = (entry, network) => {
    if (typeof entry !== 'string' || entry.length > MAX_ADDRESS_HEX || !HEX.test(entry)) {
        throw new WalletAddressError('INVALID');
    }
    const address = AddressEras.fromHex(entry);
    if (address._tag === 'ByronAddress') {
        return { hex: entry.toLowerCase(), holder: { stake: null, pay: null } };
    }
    if (address.networkId !== network.networkId) {
        throw new WalletAddressError('INVALID');
    }
    return { hex: AddressEras.toHex(address).toLowerCase(), holder: holderOfAddress(address) };
};

/**
 * The addresses `addresses` names (a request's: an array of 1 to MAX_WALLET_ADDRESSES hex-encoded
 * addresses, either case): [{ hex (lower case), holder }]. WalletAddressError 'INVALID' for a list
 * that is none: not an array, empty, too long, an entry that is no address, an address of another
 * network (Byron addresses aside). No other error leaves.
 */
const walletAddressesOf = (addresses, network) => {
    if (!Array.isArray(addresses) || addresses.length === 0 || addresses.length > MAX_WALLET_ADDRESSES) {
        throw new WalletAddressError('INVALID');
    }
    return addresses.map(entry => {
        try {
            return entryOf(entry, network);
        } catch (error) {
            throw error instanceof WalletAddressError ? error : new WalletAddressError('INVALID');
        }
    });
};

/**
 * Those of `wallet` (walletAddressesOf's) that carry `subject`'s key: for 'stake:<hash>' a base
 * address whose stake part is that key, for 'pay:<hash>' an address whose payment part is that key.
 * The others are left out: a Byron address, a reward address, a script payment part, an enterprise
 * or pointer address for a stake key, another key's. WalletAddressError 'NOT_THE_SUBJECTS' when
 * none is left.
 */
const ownAddressesOf = (wallet, subject) => {
    const own = wallet.filter(({ holder }) => holder.stake === subject || holder.pay === subject);
    if (own.length === 0) {
        throw new WalletAddressError('NOT_THE_SUBJECTS');
    }
    return own;
};

/** Those of `utxos` (the SDK's UTxOs) that sit at one of `wallet`'s addresses (their bytes compared). */
const utxosAtWallet = (utxos, wallet) => {
    const own = new Set(wallet.map(({ hex }) => hex));
    return utxos.filter(utxo => own.has(Address.toHex(utxo.address).toLowerCase()));
};

/**
 * What the subject's key signs to vouch for `addresses` (the list exactly as the request sent it)
 * for the prepared operation `op` of the item `item` ({ item, serial }) on `network`: { text (shared
 * cardano.addressProofMessage's, the only way it is built, of the purpose of the operation's kind:
 * a mint's or a burn's proof), payload (its UTF-8 bytes as hex, what CIP-30 signData takes) }. Its
 * first line is no challenge's, and the sign-in's verifier refuses it. A TypeError for an
 * operation of another kind.
 */
const addressesPayloadOf = ({ op, item, addresses, network }) => {
    if (!cardano.AddressProofPurpose.includes(op.kind)) {
        throw new TypeError(`addressesPayloadOf: no address proof for an operation of kind ${op.kind}`);
    }
    const text = cardano.addressProofMessage({
        purpose: op.kind,
        domain: PROOF_DOMAIN,
        network,
        operationId: op.id,
        item: item.item,
        serial: Number(item.serial),
        subjectAddress: addressOfSubject(op.subject, network),
        addresses,
        expires: new Date(op.sign_until),
    });
    return { text, payload: Buffer.from(text, 'utf8').toString('hex') };
};

const invalidProof = () => new HttpError(400, ErrorCode.INVALID_SIGNATURE);

/**
 * Checks `proof` ({ signature, key }, hex: what CIP-30 signData answers) of `text` (the text
 * addressesPayloadOf built again: only that one, byte for byte, so a signature over a challenge or
 * over another list or operation is refused) by `subject`'s own key. The address is the one the
 * signature names in its header (the wallet chose it): for 'stake:<hash>' a reward address of that
 * stake key, for 'pay:<hash>' an address whose payment part is that key (enterprise or base, as a
 * wallet without a stake key signs: cardano.keyOfAddress, as the sign-in reads it); the signature is
 * then checked for that address and its key (cardano.verifySignedData, the sign-in's COSE check).
 * Throws the sign-in's 400 INVALID SIGNATURE for anything else (missing, malformed, another key,
 * another address, another text).
 */
const checkAddressesProof = ({ proof, text, subject, network }) => {
    if (cardano.readAddressProof(text) === null) {
        throw new TypeError('checkAddressesProof: the text is no address proof (addressesPayloadOf)');
    }
    const { signature, key } = proof !== null && typeof proof === 'object' ? proof : {};
    const address = signedAddressOf(signature);
    let signer;
    try {
        signer = address === undefined ? undefined : keyOfAddress(address, network);
    } catch {
        signer = undefined;
    }
    if (!signer || signer.subject !== subject) {
        throw invalidProof();
    }
    verifySignedData({ signature, key, message: text, address, network });
};

module.exports = { MAX_WALLET_ADDRESSES, WalletAddressError, walletAddressesOf, ownAddressesOf, utxosAtWallet, addressesPayloadOf, checkAddressesProof };
