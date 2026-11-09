// Signing battlechoc's challenge with a Cardano wallet (plan 3, node --test): the CIP-30 api a
// wallet gives (an extension, a phone wallet over CIP-45, a wallet's own browser), which address
// signs, the network check, refusals, and which ways in a device offers.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Address,
  COSE,
  KeyHash,
  PrivateKey,
  RewardAccount,
} from "@evolution-sdk/evolution";
import { cardano } from "@battlechoc/battlechoc-shared-functions";
import {
  createAttempts,
  signWithWallet,
  walletApiOf,
  waitForLinkCode,
  WalletCancelledError,
  WalletNetworkError,
} from "../../src/cardano/wallet.js";
import { addressToBech32 } from "../../src/cardano/keys.js";
import { UnexpectedChallengeError } from "../../src/cardano/signIn.js";
import { createFeatures } from "../../src/cardano/features.js";

const { preprod } = cardano.Networks;
const hex = (bytes) => Buffer.from(bytes).toString("hex");

// a wallet's keys: its reward address and its enterprise address (a wallet without a stake key)
const walletKeys = (networkId = 0) => {
  const words = PrivateKey.generateMnemonic(256);
  const stakeKey = PrivateKey.fromMnemonicCardano(words, { role: 2 });
  const paymentKey = PrivateKey.fromMnemonicCardano(words, { role: 0 });
  const stakeHash = KeyHash.fromVKey(PrivateKey.toPublicKey(stakeKey));
  const paymentHash = KeyHash.fromVKey(PrivateKey.toPublicKey(paymentKey));
  const reward = new RewardAccount.RewardAccount({
    networkId,
    stakeCredential: stakeHash,
  });
  const enterprise = new Address.Address({
    networkId,
    paymentCredential: paymentHash,
  });
  return {
    stakeKey,
    paymentKey,
    rewardHex: RewardAccount.toHex(reward),
    rewardBech32: RewardAccount.toBech32(reward),
    enterpriseHex: Address.toHex(enterprise),
    enterpriseBech32: Address.toBech32(enterprise),
  };
};

// a CIP-30 api as a wallet gives it after enable(); `signed` records what it was asked to sign
const fakeWallet = (
  keys,
  { networkId = 0, rewards = true, decline = false } = {}
) => {
  const signed = [];
  return {
    signed,
    getNetworkId: async () => networkId,
    getRewardAddresses: async () => (rewards ? [keys.rewardHex] : []),
    getUsedAddresses: async () => [keys.enterpriseHex],
    getChangeAddress: async () => keys.enterpriseHex,
    signData: async (address, payloadHex) => {
      if (decline) {
        throw { code: 3, info: "user declined" };
      }
      signed.push({ address, payloadHex });
      const key = address === keys.rewardHex ? keys.stakeKey : keys.paymentKey;
      const data = COSE.SignData.signData(
        address,
        Uint8Array.from(Buffer.from(payloadHex, "hex")),
        key
      );
      return { signature: hex(data.signature), key: hex(data.key) };
    },
  };
};

// the battlechoc API as the game sees it (src/api/cardano.js): the server writes the bech32 form
const fakeApi = ({
  server = "preprod",
  tamper = (text) => text,
  codePurpose = "connect",
} = {}) => {
  const calls = [];
  const issued = [];
  const challengeFor = async (purpose, address, onAnotherDevice = false) => {
    const message = cardano.challengeMessage({
      address: await addressToBech32(address),
      purpose,
      onAnotherDevice,
      network: preprod,
      nonce: "n1",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 300000),
    });
    issued.push(tamper(message));
    return { nonce: "n1", message: tamper(message), expiresAt: "" };
  };
  return {
    calls,
    issued,
    network: async () => server,
    challenge: async (purpose, address) => {
      calls.push(["challenge", purpose, address]);
      return challengeFor(purpose, address);
    },
    verify: async (body, purpose, options) => {
      calls.push(["verify", body, purpose, options]);
      return { outcome: "linked" };
    },
    challengeForCode: async (code, address) => {
      calls.push(["challengeForCode", code, address]);
      return challengeFor(codePurpose, address, true);
    },
    verifyForCode: async (body) => {
      calls.push(["verifyForCode", body]);
      return { outcome: "linked" };
    },
  };
};

test("addressToBech32 gives the usual form of a reward or a payment address", async () => {
  const keys = walletKeys();
  assert.equal(await addressToBech32(keys.rewardHex), keys.rewardBech32);
  assert.equal(
    await addressToBech32(keys.enterpriseHex),
    keys.enterpriseBech32
  );
});

test("a wallet signs exactly battlechoc's challenge text with its reward address", async () => {
  const keys = walletKeys();
  const wallet = fakeWallet(keys);
  const api = fakeApi();
  const answer = await signWithWallet(wallet, "connect", {
    api,
    network: preprod,
    confirmToken: "t",
  });
  assert.deepEqual(answer, { outcome: "linked" });
  assert.deepEqual(api.calls[0], ["challenge", "connect", keys.rewardHex]);
  const [message] = api.issued;
  assert.equal(wallet.signed.length, 1);
  assert.equal(wallet.signed[0].address, keys.rewardHex);
  assert.equal(
    Buffer.from(wallet.signed[0].payloadHex, "hex").toString("utf8"),
    message
  );
  const [, body, purpose, options] = api.calls[1];
  assert.equal(body.nonce, "n1");
  assert.equal(purpose, "connect");
  assert.deepEqual(options, { confirmToken: "t" });
  assert.ok(
    COSE.SignData.verifyData(
      keys.rewardHex,
      KeyHash.toHex(KeyHash.fromVKey(PrivateKey.toPublicKey(keys.stakeKey))),
      COSE.Utils.fromText(message),
      {
        signature: Uint8Array.from(Buffer.from(body.signature, "hex")),
        key: Uint8Array.from(Buffer.from(body.key, "hex")),
      }
    )
  );
});

test("a wallet without a reward address signs with its payment address", async () => {
  const keys = walletKeys();
  const wallet = fakeWallet(keys, { rewards: false });
  const api = fakeApi();
  await signWithWallet(wallet, "connect", { api, network: preprod });
  assert.deepEqual(api.calls[0], ["challenge", "connect", keys.enterpriseHex]);
  assert.equal(wallet.signed[0].address, keys.enterpriseHex);
});

test("a wallet on another network: nothing asked, nothing signed", async () => {
  const keys = walletKeys(1);
  const wallet = fakeWallet(keys, { networkId: 1 });
  const api = fakeApi();
  await assert.rejects(
    signWithWallet(wallet, "connect", { api, network: preprod }),
    WalletNetworkError
  );
  assert.deepEqual(api.calls, []);
  assert.deepEqual(wallet.signed, []);
});

test("the server on another network than the game: nothing signed", async () => {
  const wallet = fakeWallet(walletKeys());
  await assert.rejects(
    signWithWallet(wallet, "connect", {
      api: fakeApi({ server: "mainnet" }),
      network: preprod,
    }),
    (error) => error.name === "NetworkMismatchError"
  );
  assert.deepEqual(wallet.signed, []);
});

test("a declined signature or a refused enable is a cancel, not a failure", async () => {
  const keys = walletKeys();
  const api = fakeApi();
  await assert.rejects(
    signWithWallet(fakeWallet(keys, { decline: true }), "connect", {
      api,
      network: preprod,
    }),
    WalletCancelledError
  );
  assert.equal(
    api.calls.some((call) => call[0] === "verify"),
    false
  );
  const refusing = {
    testwallet: {
      enable: async () => {
        throw { code: -3, info: "user refused" };
      },
    },
  };
  await assert.rejects(
    walletApiOf("testwallet", refusing),
    WalletCancelledError
  );
  const api2 = await walletApiOf("other", {
    other: { enable: async () => "the api" },
  });
  assert.equal(api2, "the api");
});

test("a text that is not battlechoc's challenge is never signed", async () => {
  for (const tamper of [
    (text) => text.replace("battlechoc.com wants", "evil.example wants"),
    (text) => text.replace("Action: connect", "Action: sign-in"),
    (text) => `${text}\nAlso: send everything`,
  ]) {
    const wallet = fakeWallet(walletKeys());
    await assert.rejects(
      signWithWallet(wallet, "connect", {
        api: fakeApi({ tamper }),
        network: preprod,
      }),
      UnexpectedChallengeError
    );
    assert.deepEqual(wallet.signed, []);
  }
});

test("with a link code the link page asks and answers for the code, without a token", async () => {
  const keys = walletKeys();
  const wallet = fakeWallet(keys);
  const api = fakeApi();
  const answer = await signWithWallet(wallet, "connect", {
    api,
    network: preprod,
    code: "c0de",
  });
  assert.deepEqual(answer, { outcome: "linked" });
  assert.deepEqual(api.calls[0], ["challengeForCode", "c0de", keys.rewardHex]);
  assert.equal(api.calls[1][0], "verifyForCode");
});

test("the link page signs a code's challenge for its purpose, with the warning for another device", async () => {
  const keys = walletKeys();
  const wallet = fakeWallet(keys);
  const api = fakeApi({ codePurpose: "link" });
  await signWithWallet(wallet, "link", { api, network: preprod, code: "c0de" });
  assert.match(
    Buffer.from(wallet.signed[0].payloadHex, "hex").toString("utf8"),
    /Only go on if that device is yours\./
  );
  // the plain text for a code would be someone else's challenge: never signed
  const plain = fakeWallet(keys);
  const forged = fakeApi({ codePurpose: "link" });
  forged.challengeForCode = async (code, address) => {
    const message = cardano.challengeMessage({
      address: await addressToBech32(address),
      purpose: "link",
      network: preprod,
      nonce: "n1",
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 300000),
    });
    return { nonce: "n1", message };
  };
  await assert.rejects(
    signWithWallet(plain, "link", {
      api: forged,
      network: preprod,
      code: "c0de",
    }),
    UnexpectedChallengeError
  );
});

test("waitForLinkCode polls until the code has an outcome", async () => {
  const answers = [{ state: "open" }, { state: "open" }, { state: "linked" }];
  let polls = 0;
  const outcome = await waitForLinkCode(async () => answers[polls++], {
    every: 5,
  });
  assert.deepEqual(outcome, { state: "linked" });
  assert.equal(polls, 3);
});

test("waitForLinkCode stops when it is aborted, and polls at once when the page is visible again", async () => {
  const controller = new AbortController();
  const page = new EventTarget();
  let polls = 0;
  const waiting = waitForLinkCode(
    async () => {
      polls += 1;
      return { state: "open" };
    },
    { every: 60000, signal: controller.signal, page }
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(polls, 1);
  page.dispatchEvent(new Event("visibilitychange"));
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(polls, 2);
  controller.abort();
  await assert.rejects(waiting, (error) => error.name === "AbortError");
});

test("the wallet door: hidden in the Android app; which ways in a device offers", () => {
  const paths = (options, injected) =>
    [
      ...createFeatures({ network: "preprod", ...options }).walletPaths({
        injected,
      }),
    ].sort();
  // a desktop browser: extensions when there are any, the QR code for a phone wallet
  assert.deepEqual(paths({}, true), ["extension", "qr"]);
  assert.deepEqual(paths({}, false), ["qr"]);
  // a phone: deep links only once the owner confirmed them on real phones
  assert.deepEqual(paths({ android: true }, false), []);
  assert.deepEqual(paths({ android: true, confirmed: "cip158" }, false), [
    "deeplink",
  ]);
  assert.deepEqual(paths({ ios: true, confirmed: "cip158" }, false), [
    "deeplink",
  ]);
  // a wallet's own browser on a phone: its wallet is injected
  assert.deepEqual(paths({ android: true, confirmed: "cip158" }, true), [
    "extension",
  ]);
  // the Android app: nothing until the Play Store's declaration
  assert.deepEqual(
    paths(
      { android: true, androidApp: true, confirmed: "cip158,cip45-app" },
      true
    ),
    []
  );
  assert.equal(
    createFeatures({ network: "preprod", androidApp: true }).showWalletDoor(),
    false
  );
  assert.equal(createFeatures({ network: "preprod" }).showWalletDoor(), true);
  assert.equal(createFeatures({ network: undefined }).showWalletDoor(), false);
});

test("after review: a door's attempts: a closed door or a newer attempt makes a late answer stale", () => {
  const attempts = createAttempts();
  const first = attempts.start();
  assert.equal(attempts.isCurrent(first), true);
  const second = attempts.start();
  assert.equal(attempts.isCurrent(first), false);
  assert.equal(attempts.isCurrent(second), true);
  // the door closes: nothing that was running counts any more, nor can anything start
  attempts.close();
  assert.equal(attempts.isCurrent(second), false);
  assert.equal(attempts.isCurrent(attempts.start()), false);
});
