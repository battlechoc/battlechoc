// Key files: an ed25519 signing key as one line of bech32 (`ed25519_sk1…`, as cardano-cli and CML
// write it), mode 600. The admin key signs the config updates, the server key co-signs the mints
// (tx.addServerWitness takes what loadKey answers). Nothing here prints, logs or puts a key into
// an error: a refusal names the file and what is wrong with it, never what is in it.

const fs = require('fs');
const path = require('path');
const { KeyHash, PrivateKey } = require('@evolution-sdk/evolution');

// one bech32 line of a 32-byte key (an extended key is `ed25519e_sk1…`), with one newline or none
const KEY_LINE = /^ed25519_sk1[02-9ac-hj-np-z]+\n?$/;
// the mode bits of group and others
const OPEN_TO_OTHERS = 0o077;

/** A key file the API cannot use; the message names the file, never its content. */
class KeyFileError extends Error {
    constructor(message) {
        super(message);
        this.name = 'KeyFileError';
    }
}

// The shapes of a secret. A bech32 signing key, wherever it stands. A key in hex: 32 or 64 bytes
// (64 or 128 hex digits) between non-hex characters. Recovery words: a run of 12 or more words of
// 3 to 8 letters (the lengths of the BIP39 words) with only blanks between them; a sentence of the
// scripts' own has shorter or longer words in any such run.
const BECH32_SECRET = /(?:ed25519e?_sk|xprv|root_x?sk|acct_x?sk|addr_x?sk)1[02-9ac-hj-np-z]+/gi;
const HEX_KEY = /(?<![0-9a-f])(?:[0-9a-f]{64}){1,2}(?![0-9a-f])/i;
const HEX_KEY_64_BYTES = /(?<![0-9a-f])[0-9a-f]{128}(?![0-9a-f])/gi;
const WORD_RUN = /(?<![a-z])(?:[a-z]{3,8}[ \t]+){11,}[a-z]{3,8}(?![a-z])/gi;
const KEY_MASK = '<a key, not repeated>';
const WORDS_MASK = '<recovery words, not repeated>';

/**
 * Whether `text` (an argument, a path) is or holds a secret: 'key' for a private key in bech32
 * or hex anywhere in it (so in any segment of a path), 'words' for a run of recovery words,
 * null otherwise. A key hash (28 bytes) is no key.
 */
const secretShapeOf = text => {
    const value = String(text);
    if (new RegExp(BECH32_SECRET.source, 'i').test(value) || HEX_KEY.test(value)) {
        return 'key';
    }
    return new RegExp(WORD_RUN.source, 'i').test(value) ? 'words' : null;
};

/**
 * `text` with the `known` secrets (the arguments of the command line that have a secret's shape),
 * every bech32 private key, every 64-byte hex key and every run of recovery words replaced by a
 * mask. A 32-byte hex key has the shape of a transaction id, which the scripts print: it is masked
 * only as a known secret, and the scripts refuse such an argument before they use it.
 */
const maskKeys = (text, known = []) =>
    [...known]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length)
        .reduce((result, secret) => result.split(secret).join(KEY_MASK), String(text))
        .replace(BECH32_SECRET, KEY_MASK)
        .replace(HEX_KEY_64_BYTES, KEY_MASK)
        .replace(WORD_RUN, WORDS_MASK);

/**
 * The key in `file`: { privateKey (the SDK's PrivateKey), keyHash (hex, of its public key) }.
 * Refuses a missing file, one that group or others may read or write (mode & 077), and one that
 * is not exactly one `ed25519_sk1…` line; and, without repeating it, a `file` that is itself a
 * key or recovery words (given instead of the path).
 */
const loadKey = file => {
    const shape = secretShapeOf(file);
    if (shape) {
        throw new KeyFileError(
            shape === 'key'
                ? 'that is a key, not a file: give the path of the key file (the key is not repeated here)'
                : 'those are recovery words, not a file: give the path of a key file (the words are not repeated here)'
        );
    }
    let stat;
    try {
        stat = fs.statSync(file);
    } catch {
        throw new KeyFileError(`no key file at ${file}`);
    }
    if (!stat.isFile()) {
        throw new KeyFileError(`${file} is not a file`);
    }
    if ((stat.mode & OPEN_TO_OTHERS) !== 0) {
        throw new KeyFileError(`${file} is open to others (mode ${(stat.mode & 0o777).toString(8)}): chmod 600 it`);
    }
    const content = fs.readFileSync(file, 'utf8');
    let privateKey;
    try {
        privateKey = KEY_LINE.test(content) ? PrivateKey.fromBech32(content.trim()) : undefined;
    } catch {
        // the SDK's error may quote what it parsed: it is dropped
        privateKey = undefined;
    }
    if (privateKey === undefined || PrivateKey.toBytes(privateKey).length !== 32) {
        throw new KeyFileError(`${file} is not a key file (one line ed25519_sk1…)`);
    }
    return { privateKey, keyHash: KeyHash.toHex(KeyHash.fromVKey(PrivateKey.toPublicKey(privateKey))) };
};

/**
 * Writes `line` and a newline to `file`, a new file of mode 600 (flag wx: never over an existing
 * one), creating its directory (mode 700) if it is missing. Never under a name that has the shape
 * of a secret.
 */
const writeSecretFile = (file, line) => {
    if (secretShapeOf(file) !== null) {
        throw new KeyFileError('that file name has the shape of a key or recovery words: choose another one (it is not repeated here)');
    }
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try {
        fs.writeFileSync(file, `${line}\n`, { flag: 'wx', mode: 0o600 });
    } catch (error) {
        throw new KeyFileError(error.code === 'EEXIST' ? `${file} exists: it is not overwritten` : `cannot write ${file} (${error.code})`);
    }
};

/** Writes `privateKey` (the SDK's PrivateKey) to the new file `file` as loadKey reads it. */
const writeKeyFile = (file, privateKey) => writeSecretFile(file, PrivateKey.toBech32(privateKey));

module.exports = { KeyFileError, secretShapeOf, maskKeys, loadKey, writeKeyFile, writeSecretFile };
