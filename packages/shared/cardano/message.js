// The text a player signs to sign in or to link a key (CIP-30 signData, CIP-8). The server builds
// it when it issues a challenge and compares the signed payload with it byte for byte; the game
// shows the same text in a wallet. SIWE-style, with the fields of CIP-93.

const { sha256Hex } = require('./sha256');

// the first line: what the wallet or the game asks the player to do
const HEADLINES = Object.freeze({
    'sign-in': 'battlechoc.com wants you to sign in with your Cardano account:',
    link: 'battlechoc.com wants you to sign in with your Cardano account:',
    confirm: 'battlechoc.com wants you to confirm a change with your Cardano account:',
    connect: 'battlechoc.com wants you to connect your Cardano wallet:',
});

// the link page (plan 3) signs in or links the device that opened it, which may be someone else's:
// the text says so (a phishing guard: a link sent by a stranger signs the stranger in)
const ANOTHER_DEVICE = Object.freeze({
    connect: 'Connect this wallet to battlechoc on the device that opened this page. Only go on if that device is yours.',
    link: 'Link this wallet to the battlechoc player on the device that opened this page. Only go on if that device is yours.',
});

const STATEMENTS = Object.freeze({
    'sign-in': 'Sign in to battlechoc.',
    link: 'Link this key to your battlechoc player.',
    confirm: 'Confirm a change to your battlechoc player.',
    connect: 'Connect this wallet to battlechoc.',
});

/**
 * @param {object} challenge
 * @param {string} challenge.address the bech32 address that signs (a reward address, or a
 *   wallet's payment address when it has no stake key)
 * @param {'sign-in'|'link'|'confirm'|'connect'} challenge.purpose
 * @param {{name: string}} challenge.network see network.js
 * @param {string} challenge.nonce issued by the server, used once
 * @param {Date} challenge.issuedAt
 * @param {Date} challenge.expiresAt
 * @param {boolean} [challenge.onAnotherDevice] signed on the link page for a link code (connect, link)
 */
const challengeMessage = ({ address, purpose, network, nonce, issuedAt, expiresAt, onAnotherDevice = false }) => {
    if (!Object.prototype.hasOwnProperty.call(STATEMENTS, purpose)
        || (onAnotherDevice && !Object.prototype.hasOwnProperty.call(ANOTHER_DEVICE, purpose))) {
        throw new Error(`unknown purpose of a challenge: ${purpose}`);
    }
    return [
        HEADLINES[purpose],
        address,
        '',
        onAnotherDevice ? ANOTHER_DEVICE[purpose] : STATEMENTS[purpose],
        '',
        'URI: https://battlechoc.com',
        `Action: ${purpose}`,
        `Network: ${network.name}`,
        `Nonce: ${nonce}`,
        `Issued At: ${issuedAt.toISOString()}`,
        `Expiration Time: ${expiresAt.toISOString()}`,
    ].join('\n');
};

// ---------------------------------------------------------------------------------------------
// The address proofs of a mint (minting plan D) and of a burn (salvaging a minted item, plan E):
// with a sign code alone, the wallet vouches for its own addresses by signing this text with the
// key of the operation's subject (CIP-30 signData). Each purpose has a first line, a statement and
// an action of its own, so a text of one is never read as the other's. It is never a challenge:
// its first lines are no challenge's, the sign-in refuses them, and the proof's verifier takes only
// the text it built itself. The server builds it only with addressProofMessage; the game reads it
// with addressProofOf (the purpose it expects) before it asks the wallet.

const ADDRESS_PROOFS = Object.freeze({
    // plan D's text, released: its bytes never change
    mint: Object.freeze({
        headline: 'battlechoc.com asks your wallet to vouch for its own addresses for a mint (this is not a sign-in):',
        statement: "These addresses are this wallet's own; the item is minted to one of them. Signing this moves no funds.",
        action: 'mint-addresses',
    }),
    burn: Object.freeze({
        headline: 'battlechoc.com asks your wallet to vouch for its own addresses for salvaging an item (this is not a sign-in and not a minting):',
        statement: "These addresses are this wallet's own; the item's token is burned from one of them and its deposit comes back to one of them. Signing this moves no funds.",
        action: 'burn-addresses',
    }),
});
/** The purposes of an address proof: 'mint' (plan D) and 'burn' (salvaging a minted item). */
const AddressProofPurpose = Object.freeze(Object.keys(ADDRESS_PROOFS));
/** The first line of a mint's address proof (plan D's name). */
const ADDRESS_PROOF_HEADLINE = ADDRESS_PROOFS.mint.headline;
/** The first line of a burn's address proof. */
const BURN_ADDRESS_PROOF_HEADLINE = ADDRESS_PROOFS.burn.headline;
/** The first lines of every address proof (the sign-in refuses a text that begins with one). */
const ADDRESS_PROOF_HEADLINES = Object.freeze(AddressProofPurpose.map(purpose => ADDRESS_PROOFS[purpose].headline));
const ADDRESS_PROOF_LINES = 12;
const isPurpose = purpose => typeof purpose === 'string' && Object.prototype.hasOwnProperty.call(ADDRESS_PROOFS, purpose);


const DOMAIN = /^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/;
const TOKEN = /^[^\s]+$/;
const ITEM = /^[A-Z0-9_]+$/;
const HEX_ADDRESS = /^(?:[0-9a-fA-F]{2})+$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const isoOf = value => {
    const date = value instanceof Date ? value : typeof value === 'string' && ISO.test(value) ? new Date(value) : null;
    return date !== null && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
};

/**
 * The digest of an address list in the proof: SHA-256 (lower-case hex) of the addresses as
 * lower-case hex, in the order sent, joined by a newline.
 */
const addressProofDigest = addresses => sha256Hex(addresses.map(address => address.toLowerCase()).join('\n'));

// the text of `purpose` with checked fields, `digest` and `addressCount` given
const proofText = (purpose, { domain, network, operationId, item, serial, subjectAddress, addressCount, digest, expires }) =>
    [
        ADDRESS_PROOFS[purpose].headline,
        subjectAddress,
        '',
        ADDRESS_PROOFS[purpose].statement,
        '',
        `URI: https://${domain}`,
        `Action: ${ADDRESS_PROOFS[purpose].action}`,
        `Network: ${network}`,
        `Item: ${item} #${serial}`,
        `Operation: ${operationId}`,
        `Addresses: ${addressCount}, SHA-256 ${digest}`,
        `Expiration Time: ${expires}`,
    ].join('\n');

/**
 * The text a wallet signs to vouch for `addresses` (hex, as CIP-30 gives them, the list exactly as
 * it is sent) for the operation `operationId` of `purpose` ('mint', the default, or 'burn') of
 * `item` (its key) #`serial`, by the key of `subjectAddress` (bech32: the reward address of a
 * stake key, the address of a payment key), on `network` (network.js) and `domain` (e.g.
 * 'battlechoc.com'), until `expires` (the operation's sign window end: a Date or its ISO text).
 * The list goes in as its digest (addressProofDigest). A field that cannot be written into the
 * text, or another purpose, is a TypeError.
 */
const addressProofMessage = ({ domain, network, operationId, item, serial, subjectAddress, addresses, expires, purpose = 'mint' }) => {
    const iso = isoOf(expires);
    const valid =
        isPurpose(purpose) &&
        typeof domain === 'string' && DOMAIN.test(domain) &&
        network !== null && typeof network === 'object' && typeof network.name === 'string' && TOKEN.test(network.name) &&
        typeof operationId === 'string' && TOKEN.test(operationId) &&
        typeof item === 'string' && ITEM.test(item) &&
        Number.isSafeInteger(serial) && serial >= 0 &&
        typeof subjectAddress === 'string' && TOKEN.test(subjectAddress) &&
        Array.isArray(addresses) && addresses.length > 0 && addresses.every(address => typeof address === 'string' && HEX_ADDRESS.test(address)) &&
        iso !== null;
    if (!valid) {
        throw new TypeError('addressProofMessage: a field that cannot be written into the text');
    }
    return proofText(purpose, { domain, network: network.name, operationId, item, serial, subjectAddress, addressCount: addresses.length, digest: addressProofDigest(addresses), expires: iso });
};

const PROOF_PATTERNS = [
    [5, /^URI: https:\/\/([A-Za-z0-9.-]+(?::[0-9]{1,5})?)$/, 'domain'],
    [7, /^Network: ([^\s]+)$/, 'network'],
    [9, /^Operation: ([^\s]+)$/, 'operationId'],
    [11, /^Expiration Time: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)$/, 'expires'],
];

/**
 * Which address proof `text` is, and its fields: { purpose ('mint' | 'burn'), domain, network (its
 * name), operationId, item, serial, subjectAddress, addressCount, digest, expires (ISO) } for a
 * text exactly as addressProofMessage writes it for that purpose (byte for byte, the fixed lines
 * included); null for any other text. The one parser of both proofs.
 */
const readAddressProof = text => {
    if (typeof text !== 'string') {
        return null;
    }
    const lines = text.split('\n');
    const purpose = AddressProofPurpose.find(each => ADDRESS_PROOFS[each].headline === lines[0]);
    if (purpose === undefined || lines.length !== ADDRESS_PROOF_LINES || !TOKEN.test(lines[1])) {
        return null;
    }
    const fields = { subjectAddress: lines[1] };
    for (const [index, pattern, name] of PROOF_PATTERNS) {
        const match = pattern.exec(lines[index]);
        if (!match) {
            return null;
        }
        fields[name] = match[1];
    }
    const item = /^Item: ([A-Z0-9_]+) #(0|[1-9][0-9]*)$/.exec(lines[8]);
    const list = /^Addresses: ([1-9][0-9]*), SHA-256 ([0-9a-f]{64})$/.exec(lines[10]);
    if (!item || !list || isoOf(fields.expires) !== fields.expires || !Number.isSafeInteger(Number(item[2])) || !Number.isSafeInteger(Number(list[1]))) {
        return null;
    }
    const parsed = {
        domain: fields.domain,
        network: fields.network,
        operationId: fields.operationId,
        item: item[1],
        serial: Number(item[2]),
        subjectAddress: fields.subjectAddress,
        addressCount: Number(list[1]),
        digest: list[2],
        expires: fields.expires,
    };
    // every line as addressProofMessage writes it for that purpose, byte for byte (the fixed ones included)
    return proofText(purpose, parsed) === text ? { purpose, ...parsed } : null;
};

/**
 * The fields of an address proof text of `purpose` ('mint', the default, or 'burn'):
 * readAddressProof's without the purpose; null for any other text, a proof of the other purpose
 * included. The game checks them before it asks the wallet: this purpose, this network, this
 * operation, this subject's address, the digest of exactly the list it sends, not expired.
 */
const addressProofOf = (text, purpose = 'mint') => {
    const read = readAddressProof(text);
    if (read === null || read.purpose !== purpose) {
        return null;
    }
    const fields = { ...read };
    delete fields.purpose;
    return fields;
};

module.exports = {
    challengeMessage,
    ChallengePurpose: Object.freeze(Object.keys(STATEMENTS)),
    AddressProofPurpose,
    ADDRESS_PROOF_HEADLINE,
    BURN_ADDRESS_PROOF_HEADLINE,
    ADDRESS_PROOF_HEADLINES,
    addressProofDigest,
    addressProofMessage,
    addressProofOf,
    readAddressProof,
};
