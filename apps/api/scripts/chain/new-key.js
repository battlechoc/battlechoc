// Makes a new key file, for the owner (keep the files outside the repository, next to the
// recipes in ../battlechoc-private/):
//
//   node apps/api/scripts/chain/new-key.js --kind key --out <file> [--network preprod]
//     a fresh ed25519 key (the admin key or the server key), one line ed25519_sk1… in <file>;
//     prints its key hash and its enterprise address (where test ADA for it goes)
//   node apps/api/scripts/chain/new-key.js --kind wallet --out <file> [--network preprod]
//     24 recovery words in <file> (a wallet for the e2e players); prints its base address
//     (payment 1852'/1815'/0'/0/0, stake 1852'/1815'/0'/2/0) and the player subject stake:<hash>
//
// The file is new (never over an existing one) with mode 600. Nothing secret is printed: no key,
// no word. Only preprod in this version.

const { Address, KeyHash, PrivateKey } = require('@evolution-sdk/evolution');
const { cardano } = require('@battlechoc/battlechoc-shared-functions');
const { writeKeyFile, writeSecretFile } = require('../../src/chain/keys');
const { ScriptError, argsOf, runScript } = require('./lib');

const OPTIONS = { kind: { type: 'string' }, out: { type: 'string' }, network: { type: 'string', default: 'preprod' } };

const keyHashOf = privateKey => KeyHash.fromVKey(PrivateKey.toPublicKey(privateKey));

/** Makes the file the command line `argv` asks for and logs its public part. */
const main = async ({ argv, log }) => {
    const { kind, out, network: name } = argsOf(argv, OPTIONS);
    if (name !== 'preprod') {
        throw new ScriptError(`--network must be preprod in this version, not ${JSON.stringify(name)}`);
    }
    const network = cardano.Networks.preprod;
    if (!out) {
        throw new ScriptError('--out <file> is missing');
    }
    if (kind === 'key') {
        const privateKey = PrivateKey.fromBytes(PrivateKey.generate());
        writeKeyFile(out, privateKey);
        const hash = keyHashOf(privateKey);
        log(`key written to ${out} (mode 600)`);
        log(`key hash: ${KeyHash.toHex(hash)}`);
        log(`address: ${Address.toBech32(new Address.Address({ networkId: network.networkId, paymentCredential: hash }))}`);
    } else if (kind === 'wallet') {
        const words = PrivateKey.generateMnemonic(256);
        writeSecretFile(out, words);
        const payment = keyHashOf(PrivateKey.fromMnemonicCardano(words));
        const stake = keyHashOf(PrivateKey.fromMnemonicCardano(words, { role: 2 }));
        // the labels are no words of the BIP39 list (test/chain.keys.test.js checks it)
        log(`wallet written to ${out} (mode 600)`);
        log(`wallet addr: ${Address.toBech32(new Address.Address({ networkId: network.networkId, paymentCredential: payment, stakingCredential: stake }))}`);
        log(`stake:${KeyHash.toHex(stake)}`);
    } else {
        throw new ScriptError('--kind must be key or wallet');
    }
};

module.exports = { OPTIONS, main };

if (require.main === module) {
    runScript(main);
}
