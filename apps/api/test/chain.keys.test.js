// Key files (plan B, Task 10): src/chain/keys.js loads and writes them, scripts/chain/new-key.js
// makes new ones. A key file is one line `ed25519_sk1…` with mode 600; a wallet file holds 24
// recovery words. Nothing secret reaches stdout or an error message. Every file here lives in a
// temporary directory; the keys new-key.js makes are random and never funded.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { Address, KeyHash, PrivateKey } = require('@evolution-sdk/evolution');
const { wordlist } = require('@scure/bip39/wordlists/english.js');
const { loadKey, maskKeys, secretShapeOf, writeKeyFile } = require('../src/chain/keys');
const { fixtureKey } = require('./helpers/chain');

const NEW_KEY = path.join(__dirname, '..', 'scripts', 'chain', 'new-key.js');

const newKey = args => spawnSync(process.execPath, [NEW_KEY, ...args], { encoding: 'utf8' });
const modeOf = file => fs.statSync(file).mode & 0o777;
const keyHashOf = privateKey => KeyHash.toHex(KeyHash.fromVKey(PrivateKey.toPublicKey(privateKey)));
const enterpriseOf = privateKey => Address.toBech32(new Address.Address({ networkId: 0, paymentCredential: KeyHash.fromHex(keyHashOf(privateKey)) }));

// What an error shows anywhere: its message, its stack and whatever else it carries
const everythingOf = error => [error.message, error.stack, JSON.stringify(error), String(error.cause ?? '')].join('\n');

let dir;
beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battlechoc-keys-'));
});
afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('new-key.js', () => {
    test('a new key file is mode 600 and its content never reaches stdout', () => {
        const file = path.join(dir, 'preprod-admin.sk');
        const run = newKey(['--kind', 'key', '--out', file]);
        expect(run.status).toBe(0);
        expect(modeOf(file)).toBe(0o600);

        const content = fs.readFileSync(file, 'utf8');
        expect(content).toMatch(/^ed25519_sk1[02-9ac-hj-np-z]+\n$/);
        const privateKey = PrivateKey.fromBech32(content.trim());
        for (const secret of [content.trim(), PrivateKey.toHex(privateKey)]) {
            expect(run.stdout).not.toContain(secret);
            expect(run.stderr).not.toContain(secret);
        }
        // what it prints is the public part: the key hash and the enterprise address on preprod
        expect(run.stdout).toContain(`key hash: ${keyHashOf(privateKey)}`);
        expect(run.stdout).toContain(`address: ${enterpriseOf(privateKey)}`);
    });

    test('a wallet is 24 words in a file of mode 600, none of them on stdout; it prints the base address and the subject', () => {
        const file = path.join(dir, 'player.words');
        const run = newKey(['--kind', 'wallet', '--out', file, '--network', 'preprod']);
        expect(run.status).toBe(0);
        expect(modeOf(file)).toBe(0o600);

        const words = fs.readFileSync(file, 'utf8').trim();
        expect(words.split(' ')).toHaveLength(24);
        expect(PrivateKey.validateMnemonic(words)).toBe(true);

        // payment 1852'/1815'/0'/0/0, stake 1852'/1815'/0'/2/0
        const payment = PrivateKey.fromMnemonicCardano(words);
        const stake = PrivateKey.fromMnemonicCardano(words, { role: 2 });
        const base = Address.toBech32(
            new Address.Address({ networkId: 0, paymentCredential: KeyHash.fromHex(keyHashOf(payment)), stakingCredential: KeyHash.fromHex(keyHashOf(stake)) })
        );
        expect(run.stdout).toContain(base);
        expect(run.stdout).toContain(`stake:${keyHashOf(stake)}`);

        // without the public values and the file's name, no recovery word is left on stdout or
        // stderr, nor any other word of the list (so the labels can never give one away)
        const rest = [run.stdout, run.stderr].join('\n').split(base).join(' ').split(keyHashOf(stake)).join(' ').split(file).join(' ');
        const tokens = new Set(rest.toLowerCase().split(/[^a-z]+/));
        expect(wordlist.filter(word => tokens.has(word))).toEqual([]);
        expect(rest).not.toContain(words);
        for (const secret of [PrivateKey.toHex(payment), PrivateKey.toHex(stake)]) {
            expect(run.stdout).not.toContain(secret);
        }
    });

    test('an existing file is not overwritten', () => {
        for (const kind of ['key', 'wallet']) {
            const file = path.join(dir, `existing-${kind}`);
            fs.writeFileSync(file, 'what was there\n', { mode: 0o600 });
            const run = newKey(['--kind', kind, '--out', file]);
            expect(run.status).not.toBe(0);
            expect(run.stderr).toContain(file);
            expect(fs.readFileSync(file, 'utf8')).toBe('what was there\n');
        }
    });

    test('refuses another network than preprod, and a kind it does not know', () => {
        const mainnet = newKey(['--kind', 'key', '--out', path.join(dir, 'a.sk'), '--network', 'mainnet']);
        expect(mainnet.status).not.toBe(0);
        expect(mainnet.stderr).toMatch(/preprod/);
        const other = newKey(['--kind', 'stake', '--out', path.join(dir, 'b.sk')]);
        expect(other.status).not.toBe(0);
        expect(fs.readdirSync(dir)).toEqual([]);
    });
});

describe('the key files', () => {
    const admin = fixtureKey('admin');
    const bech32 = PrivateKey.toBech32(admin.privateKey);

    test('writeKeyFile writes one line, mode 600, and loadKey reads back the key and its hash', () => {
        const file = path.join(dir, 'admin.sk');
        writeKeyFile(file, admin.privateKey);
        expect(modeOf(file)).toBe(0o600);
        expect(fs.readFileSync(file, 'utf8')).toBe(`${bech32}\n`);
        const key = loadKey(file);
        expect(key.keyHash).toBe(admin.keyHash);
        expect(PrivateKey.toHex(key.privateKey)).toBe(PrivateKey.toHex(admin.privateKey));
    });

    test('writeKeyFile does not overwrite a file', () => {
        const file = path.join(dir, 'admin.sk');
        fs.writeFileSync(file, 'before\n', { mode: 0o600 });
        expect(() => writeKeyFile(file, admin.privateKey)).toThrow(file);
        expect(fs.readFileSync(file, 'utf8')).toBe('before\n');
    });

    test('loadKey refuses a 644 file, and one any group or other may read or write', () => {
        for (const mode of [0o644, 0o640, 0o604, 0o620, 0o602]) {
            const file = path.join(dir, `admin-${mode.toString(8)}.sk`);
            fs.writeFileSync(file, `${bech32}\n`);
            fs.chmodSync(file, mode);
            expect(() => loadKey(file)).toThrow(file);
            expect(() => loadKey(file)).toThrow(/chmod 600/);
        }
    });

    test("loadKey's errors do not contain the key", () => {
        const cases = {
            open: [`${bech32}\n`, 0o644],
            'two lines': [`${bech32}\n${bech32}\n`, 0o600],
            'trailing text': [`${bech32}x\n`, 0o600],
            'a broken checksum': [`${bech32.slice(0, -1)}${bech32.endsWith('q') ? 'p' : 'q'}\n`, 0o600],
            'an extended key': [`${PrivateKey.toBech32(PrivateKey.fromBytes(PrivateKey.generateExtended()))}\n`, 0o600],
            'a hex key': [`${PrivateKey.toHex(admin.privateKey)}\n`, 0o600],
            empty: ['', 0o600],
        };
        for (const [name, [content, mode]] of Object.entries(cases)) {
            const file = path.join(dir, `${name.replace(/ /g, '-')}.sk`);
            fs.writeFileSync(file, content);
            fs.chmodSync(file, mode);
            let error;
            try {
                loadKey(file);
            } catch (caught) {
                error = caught;
            }
            expect([name, error]).toEqual([name, expect.any(Error)]);
            expect(error.message).toContain(file);
            const shown = everythingOf(error);
            for (const secret of [content.trim(), bech32, PrivateKey.toHex(admin.privateKey)].filter(Boolean)) {
                expect([name, shown.includes(secret)]).toEqual([name, false]);
            }
        }
    });

    test('loadKey given a key, a hex key or recovery words instead of a path says so without repeating it', () => {
        const words = PrivateKey.generateMnemonic(256);
        for (const text of [bech32, `  ${bech32}\n`, PrivateKey.toHex(admin.privateKey), PrivateKey.toBech32(PrivateKey.fromBytes(PrivateKey.generateExtended())), words, path.join(dir, bech32)]) {
            let error;
            try {
                loadKey(text);
            } catch (caught) {
                error = caught;
            }
            expect(error?.message).toMatch(/that is a key, not a file|recovery words, not a file/);
            const shown = everythingOf(error);
            for (const secret of [text.trim(), bech32, PrivateKey.toHex(admin.privateKey), ...words.split(' ').slice(0, 3).map(word => ` ${word} `)]) {
                expect(shown.includes(secret)).toBe(false);
            }
        }
    });

    test('writeKeyFile creates no file under a name shaped like a secret', () => {
        for (const name of [bech32, PrivateKey.toHex(admin.privateKey), `${PrivateKey.toHex(admin.privateKey)}.sk`]) {
            const file = path.join(dir, name);
            expect(() => writeKeyFile(file, admin.privateKey)).toThrow(/not repeated/);
            expect(fs.existsSync(file)).toBe(false);
        }
        expect(fs.readdirSync(dir)).toEqual([]);
    });

    test('loadKey names a missing file', () => {
        const file = path.join(dir, 'missing.sk');
        expect(() => loadKey(file)).toThrow(file);
    });
});

describe('the shapes of a secret', () => {
    const bech32 = PrivateKey.toBech32(fixtureKey('admin').privateKey);
    const hex = PrivateKey.toHex(fixtureKey('admin').privateKey);
    const words = PrivateKey.generateMnemonic(256);

    test('secretShapeOf finds a key or recovery words in a text or in any segment of a path', () => {
        for (const text of [bech32, ` ${bech32} `, `x${bech32}`, hex, hex.toUpperCase(), hex + hex, `/a/${hex}/b`, `/a/${hex}.sk`, `a\\${hex}`, `/a/${bech32}/b`]) {
            expect([text, secretShapeOf(text)]).toEqual([text, 'key']);
        }
        for (const text of [words, `/a/${words}`, `/a/${words}.txt`, words.split(' ').slice(0, 12).join(' ')]) {
            expect([text, secretShapeOf(text)]).toEqual([text, 'words']);
        }
        // a transaction id has a 32-byte key's shape: no script takes one as an argument
        expect(secretShapeOf(`${'ab'.repeat(32)}#0`)).toBe('key');
        // a key hash (28 bytes), paths and words of a sentence are none
        for (const text of ['ab'.repeat(28), '../battlechoc-private/chain/preprod-admin.sk', 'preprod', 'key', 'wallet', '/tmp/fees.json', 'the config is already paused and nothing changes here at all today']) {
            expect([text, secretShapeOf(text)]).toEqual([text, null]);
        }
    });

    test('maskKeys masks bech32 keys, 64-byte hex keys and recovery words anywhere, and the known secrets it is given', () => {
        const hex128 = hex + hex;
        const masked = maskKeys(`a ${bech32} b ${hex128} c ${words} d ${hex} e`, [hex]);
        for (const secret of [bech32, hex128, words, hex, words.split(' ').slice(0, 4).join(' ')]) {
            expect(masked.includes(secret)).toBe(false);
        }
        expect(masked).toMatch(/^a <.*> b <.*> c <.*> d <.*> e$/);
        // a transaction id has the shape of a 32-byte key: unmasked unless given as a known secret
        const txLine = `CHAIN_CONFIG_REF=${'ab'.repeat(32)}#0`;
        expect(maskKeys(txLine)).toBe(txLine);
    });
});
