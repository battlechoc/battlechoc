// Signing a mint with a CIP-30 wallet (plan D, node --test): the checks before the wallet is
// asked (network, account), exactly the server's transaction for a partial signature, how wallets
// say no, the subject of a wallet, the addresses a wallet names as its own, and the sign page.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Address,
  KeyHash,
  PrivateKey,
  RewardAccount,
  ScriptHash,
} from "@evolution-sdk/evolution";
import { cardano } from "@battlechoc/battlechoc-shared-functions";
import {
  OwnerNotConfirmedError,
  UnexpectedProofTextError,
  ownsAddress,
  proveAddresses,
  signMintTx,
  signPrepared,
  signPageUrl,
  subjectOfWallet,
  walletAddresses,
  UnsupportedAddressError,
  WalletAccountChangedError,
  WalletCannotSignError,
  WalletOtherAccountError,
  WalletSignError,
} from "../../src/cardano/signTx.js";
import { addressOfSubject, subjectOfAddress } from "../../src/cardano/keys.js";
import {
  WalletCancelledError,
  WalletNetworkError,
  WalletWithoutAddressError,
} from "../../src/cardano/wallet.js";

const { preprod } = cardano.Networks;

// a wallet's keys and addresses: reward, base (payment + stake key) and enterprise
const walletKeys = (networkId = 0) => {
  const words = PrivateKey.generateMnemonic(256);
  const key = (role) =>
    KeyHash.fromVKey(
      PrivateKey.toPublicKey(PrivateKey.fromMnemonicCardano(words, { role }))
    );
  const payment = key(0);
  const stake = key(2);
  const reward = new RewardAccount.RewardAccount({
    networkId,
    stakeCredential: stake,
  });
  const base = new Address.Address({
    networkId,
    paymentCredential: payment,
    stakingCredential: stake,
  });
  const enterprise = new Address.Address({
    networkId,
    paymentCredential: payment,
  });
  return {
    stakeSubject: `stake:${KeyHash.toHex(stake)}`,
    paySubject: `pay:${KeyHash.toHex(payment)}`,
    rewardHex: RewardAccount.toHex(reward),
    rewardBech32: RewardAccount.toBech32(reward),
    baseHex: Address.toHex(base),
    baseBech32: Address.toBech32(base),
    enterpriseHex: Address.toHex(enterprise),
    enterpriseBech32: Address.toBech32(enterprise),
  };
};

// what the server sends to sign (the CBOR is never parsed on this side) and a wallet's answer
const TX = "84a400d90102818258201111111111111111111111111111111111111111";
const WITNESS = "a100d9010281825820aaaa5840bbbb";

// a CIP-30 api as a wallet gives it after enable(); `asked` records every signTx, `calls` every
// method asked; `fail` makes a method throw (by its name)
const fakeWallet = (
  keys,
  {
    networkId = 0,
    rewards = true,
    reward = keys.rewardHex,
    used = [keys.baseHex],
    change = keys.baseHex,
    sign = async () => WITNESS,
    prove = async () => ({ signature: "84aa", key: "a5bb" }),
    fail = {},
  } = {}
) => {
  const asked = [];
  const proved = [];
  const calls = [];
  const method =
    (name, answer) =>
    async (...args) => {
      calls.push(name);
      if (name in fail) {
        throw fail[name];
      }
      return answer(...args);
    };
  return {
    asked,
    proved,
    calls,
    getNetworkId: method("getNetworkId", () => networkId),
    getRewardAddresses: method("getRewardAddresses", () =>
      rewards ? [reward] : []
    ),
    getUsedAddresses: method("getUsedAddresses", () => used),
    getUnusedAddresses: method("getUnusedAddresses", () => []),
    getChangeAddress: method("getChangeAddress", () => change),
    signTx: method("signTx", (tx, partial) => {
      asked.push([tx, partial]);
      return sign(tx, partial);
    }),
    signData: method("signData", (address, payload) => {
      proved.push([address, payload]);
      return prove(address, payload);
    }),
  };
};

test("signMintTx asks for a partial signature of exactly the server's transaction and returns the wallet's witness set", async () => {
  const keys = walletKeys();
  const wallet = fakeWallet(keys);
  const witness = await signMintTx(wallet, {
    tx: TX,
    network: preprod,
    subject: keys.stakeSubject,
  });
  assert.equal(witness, WITNESS);
  assert.deepEqual(wallet.asked, [[TX, true]]);
});

test("a wallet on another network is never asked to sign", async () => {
  const keys = walletKeys(1);
  const wallet = fakeWallet(keys, { networkId: 1 });
  await assert.rejects(
    signMintTx(wallet, {
      tx: TX,
      network: preprod,
      subject: keys.stakeSubject,
    }),
    (error) =>
      error instanceof WalletNetworkError &&
      error.expected === 0 &&
      error.actual === 1
  );
  assert.deepEqual(wallet.asked, []);
});

test("another account in the wallet (another reward address) is never asked to sign", async () => {
  const mine = walletKeys();
  const other = walletKeys();
  const wallet = fakeWallet(other);
  await assert.rejects(
    signMintTx(wallet, {
      tx: TX,
      network: preprod,
      subject: mine.stakeSubject,
    }),
    (error) =>
      error instanceof WalletOtherAccountError &&
      error.expected === mine.stakeSubject &&
      error.actual === other.stakeSubject
  );
  assert.deepEqual(wallet.asked, []);
});

test("a wallet with only an enterprise address signs for its payment key", async () => {
  const keys = walletKeys();
  const wallet = fakeWallet(keys, {
    rewards: false,
    used: [keys.enterpriseHex],
    change: keys.enterpriseHex,
  });
  assert.equal(await subjectOfWallet(wallet), keys.paySubject);
  assert.equal(
    await signMintTx(wallet, {
      tx: TX,
      network: preprod,
      subject: keys.paySubject,
    }),
    WITNESS
  );
  // no used address yet: the change address
  const fresh = fakeWallet(keys, {
    rewards: false,
    used: [],
    change: keys.enterpriseHex,
  });
  assert.equal(await subjectOfWallet(fresh), keys.paySubject);
});

test("a wallet without any address says so", async () => {
  const keys = walletKeys();
  const empty = fakeWallet(keys, {
    rewards: false,
    used: [],
    change: null,
  });
  await assert.rejects(subjectOfWallet(empty), WalletWithoutAddressError);
  await assert.rejects(
    signMintTx(empty, { tx: TX, network: preprod, subject: keys.paySubject }),
    WalletWithoutAddressError
  );
  assert.deepEqual(empty.asked, []);
  await assert.rejects(walletAddresses(empty), WalletWithoutAddressError);
});

test("the player saying no in the wallet is a cancel, however the wallet says it", async () => {
  const keys = walletKeys();
  for (const refusal of [
    { code: 2, info: "user declined sign tx" },
    { code: -3, info: "user refused" },
    Object.assign(new Error("TxSignError"), { code: 2, info: "UserDeclined" }),
    "User declined",
    "user rejected the request",
    { info: "Signing cancelled by the user" },
    new Error("User denied the transaction"),
  ]) {
    const wallet = fakeWallet(keys, {
      sign: async () => {
        throw refusal;
      },
    });
    await assert.rejects(
      signMintTx(wallet, {
        tx: TX,
        network: preprod,
        subject: keys.stakeSubject,
      }),
      (error) =>
        error instanceof WalletCancelledError && error.cause === refusal,
      String(refusal && refusal.info ? refusal.info : refusal)
    );
  }
});

test("a wallet that lacks a key the transaction needs (ProofGeneration) cannot sign it", async () => {
  const keys = walletKeys();
  const proof = { code: 1, info: "ProofGeneration" };
  const wallet = fakeWallet(keys, {
    sign: async () => {
      throw proof;
    },
  });
  await assert.rejects(
    signMintTx(wallet, {
      tx: TX,
      network: preprod,
      subject: keys.stakeSubject,
    }),
    (error) => error instanceof WalletCannotSignError && error.cause === proof
  );
});

test("any other failure of the wallet is passed on with its text, never swallowed", async () => {
  const keys = walletKeys();
  for (const [failure, detail] of [
    [{ code: -2, info: "internal error" }, "code -2: internal error"],
    [{ code: -2 }, "code -2"],
    [Object.assign(new Error("boom"), { code: -1 }), "code -1: boom"],
    [
      new TypeError("cbor is not a function"),
      "TypeError: cbor is not a function",
    ],
    // a wallet's bug is no "no", whatever its text says
    [
      new TypeError("cannot read 'rejected' of undefined"),
      "TypeError: cannot read 'rejected' of undefined",
    ],
    [
      new RangeError("declined index out of range"),
      "RangeError: declined index out of range",
    ],
    [
      new ReferenceError("cancel is not defined"),
      "ReferenceError: cancel is not defined",
    ],
    [
      new SyntaxError("Unexpected token in 'denied'"),
      "SyntaxError: Unexpected token in 'denied'",
    ],
    ["something odd", "something odd"],
    [{}, "{}"],
  ]) {
    const wallet = fakeWallet(keys, {
      sign: async () => {
        throw failure;
      },
    });
    await assert.rejects(
      signMintTx(wallet, {
        tx: TX,
        network: preprod,
        subject: keys.stakeSubject,
      }),
      (error) =>
        error instanceof WalletSignError &&
        error.cause === failure &&
        error.detail === detail &&
        error.message.includes(detail)
    );
  }
  // a wallet that answers no witness set at all
  const silent = fakeWallet(keys, { sign: async () => undefined });
  await assert.rejects(
    signMintTx(silent, {
      tx: TX,
      network: preprod,
      subject: keys.stakeSubject,
    }),
    WalletSignError
  );
});

test("the account in the wallet changed (APIError -4): its own error, nothing signed", async () => {
  const keys = walletKeys();
  const changed = { code: -4, info: "account changed" };
  const wallet = fakeWallet(keys, {
    sign: async () => {
      throw changed;
    },
  });
  await assert.rejects(
    signMintTx(wallet, {
      tx: TX,
      network: preprod,
      subject: keys.stakeSubject,
    }),
    (error) =>
      error instanceof WalletAccountChangedError &&
      error.cause === changed &&
      error.call === "signTx"
  );
});

test("a wallet that fails before it is asked to sign: cancelled, account changed or its text, and never asked to sign", async () => {
  const keys = walletKeys();
  const shapes = [
    [{ code: -3, info: "refused" }, WalletCancelledError],
    [{ code: -4, info: "account changed" }, WalletAccountChangedError],
    [{ code: -2, info: "internal error" }, WalletSignError],
    [{ code: -1 }, WalletSignError],
    [new TypeError("the wallet broke"), WalletSignError],
  ];
  const methods = [
    "getNetworkId",
    "getRewardAddresses",
    "getUsedAddresses",
    "getChangeAddress",
  ];
  for (const [failure, kind] of shapes) {
    for (const name of methods) {
      // no reward address, no used address: every method is reached
      const options = {
        rewards: false,
        used: [],
        change: keys.enterpriseHex,
        fail: { [name]: failure },
      };
      const signing = fakeWallet(keys, options);
      await assert.rejects(
        signMintTx(signing, {
          tx: TX,
          network: preprod,
          subject: keys.paySubject,
        }),
        (error) =>
          error instanceof kind &&
          error.cause === failure &&
          error.call === name,
        `signMintTx: ${name} ${kind.name}`
      );
      assert.deepEqual(signing.asked, []);
      assert.equal(signing.calls.includes("signTx"), false);
      if (name !== "getNetworkId") {
        await assert.rejects(
          subjectOfWallet(fakeWallet(keys, options)),
          (error) =>
            error instanceof kind &&
            error.cause === failure &&
            error.call === name,
          `subjectOfWallet: ${name} ${kind.name}`
        );
      }
      if (name === "getUsedAddresses" || name === "getChangeAddress") {
        await assert.rejects(
          walletAddresses(fakeWallet(keys, options)),
          (error) =>
            error instanceof kind &&
            error.cause === failure &&
            error.call === name,
          `walletAddresses: ${name} ${kind.name}`
        );
      }
    }
  }
});

test("a wallet whose reward address is a script's is never asked to sign", async () => {
  const keys = walletKeys();
  const scriptReward = RewardAccount.toHex(
    new RewardAccount.RewardAccount({
      networkId: 0,
      stakeCredential: ScriptHash.fromHex("cd".repeat(28)),
    })
  );
  const wallet = fakeWallet(keys, { reward: scriptReward });
  await assert.rejects(
    signMintTx(wallet, {
      tx: TX,
      network: preprod,
      subject: keys.stakeSubject,
    }),
    (error) =>
      error instanceof UnsupportedAddressError &&
      error.reason === "script" &&
      error.address === scriptReward
  );
  assert.deepEqual(wallet.asked, []);
});

test("a transaction that is no CBOR hex never opens the wallet", async () => {
  const keys = walletKeys();
  for (const tx of [undefined, null, "", "84a4z0", "84a", 42, { cbor: TX }]) {
    const wallet = fakeWallet(keys);
    await assert.rejects(
      signMintTx(wallet, { tx, network: preprod, subject: keys.stakeSubject }),
      TypeError,
      String(tx)
    );
    assert.deepEqual(wallet.calls, []);
  }
});

test("subjectOfAddress follows the server's rule: a reward address is its stake key, a base or enterprise address its payment key", async () => {
  const keys = walletKeys();
  assert.equal(await subjectOfAddress(keys.rewardHex), keys.stakeSubject);
  assert.equal(await subjectOfAddress(keys.baseHex), keys.paySubject);
  assert.equal(await subjectOfAddress(keys.enterpriseHex), keys.paySubject);
  assert.equal(
    await subjectOfAddress(keys.baseHex.toUpperCase()),
    keys.paySubject
  );
  // a script's address has no key to sign with
  const script = Address.toHex(
    new Address.Address({
      networkId: 0,
      paymentCredential: ScriptHash.fromHex("ab".repeat(28)),
    })
  );
  await assert.rejects(
    subjectOfAddress(script),
    (error) =>
      error instanceof UnsupportedAddressError &&
      error.reason === "script" &&
      error.address === script
  );
  // an address it cannot read (Byron, a pointer address, nonsense)
  for (const odd of ["82d818582183581c", "zz", ""]) {
    await assert.rejects(
      subjectOfAddress(odd),
      (error) =>
        error instanceof UnsupportedAddressError &&
        error.reason === "unreadable",
      odd
    );
  }
});

// a wallet that hands out its used addresses in pages of `limit` (CIP-30 Paginate), and ends
// with a PaginateError past the last page
const pagingWallet = ({ used, unused = [], change }) => ({
  getUsedAddresses: async (paginate) => {
    if (!paginate) {
      return used;
    }
    const start = paginate.page * paginate.limit;
    if (start > 0 && start >= used.length) {
      throw { maxSize: Math.ceil(used.length / paginate.limit) };
    }
    return used.slice(start, start + paginate.limit);
  },
  getUnusedAddresses: async () => unused,
  getChangeAddress: async () => change,
});

const addresses = (count, prefix = "00") =>
  Array.from(
    { length: count },
    (unused, index) => `${prefix}${String(index).padStart(6, "0")}`
  );

test("walletAddresses: the change address first, then the used ones, then the unused ones, each once, as the wallet wrote them", async () => {
  const wallet = pagingWallet({
    used: ["01aa", "01BB", "01cc"],
    unused: ["01dd", "01bb"],
    change: "01cc",
  });
  assert.deepEqual(await walletAddresses(wallet), [
    "01cc",
    "01aa",
    "01BB",
    "01dd",
  ]);
});

test("walletAddresses reads every page of a wallet that pages, and stops at 100", async () => {
  const used = addresses(130);
  const paged = pagingWallet({ used, change: "60cafe00" });
  const found = await walletAddresses(paged);
  assert.equal(found.length, 100);
  assert.equal(found[0], "60cafe00");
  assert.deepEqual(found.slice(1), used.slice(0, 99));
  // a few used addresses on one page, then unused ones
  const small = pagingWallet({
    used: addresses(3),
    unused: addresses(2, "11"),
    change: "60cafe00",
  });
  assert.deepEqual(await walletAddresses(small), [
    "60cafe00",
    ...addresses(3),
    ...addresses(2, "11"),
  ]);
});

test("walletAddresses: a wallet that ignores the pages, or refuses them, still gives all of its addresses", async () => {
  const used = addresses(70);
  const ignoring = {
    getUsedAddresses: async () => used,
    getUnusedAddresses: async () => [],
    getChangeAddress: async () => used[0],
  };
  assert.deepEqual(await walletAddresses(ignoring), used);
  const refusing = {
    getUsedAddresses: async (paginate) => {
      if (paginate) {
        throw { code: -1, info: "paginate not supported" };
      }
      return used.slice(0, 5);
    },
    getUnusedAddresses: async () => [],
    getChangeAddress: async () => undefined,
  };
  assert.deepEqual(await walletAddresses(refusing), used.slice(0, 5));
});

test("walletAddresses: a bech32 address is sent as its hex bytes, anything else is left out", async () => {
  const keys = walletKeys();
  const wallet = pagingWallet({
    used: [keys.baseBech32, "not an address", "abc", 42, "01aa"],
    unused: [keys.enterpriseBech32, keys.enterpriseHex],
    change: keys.baseHex,
  });
  assert.deepEqual(await walletAddresses(wallet), [
    keys.baseHex,
    "01aa",
    keys.enterpriseHex,
  ]);
  const nothingUsable = pagingWallet({
    used: ["addr_test1nonsense", "xyz"],
    change: "stake_test1nonsense",
  });
  await assert.rejects(
    walletAddresses(nothingUsable),
    WalletWithoutAddressError
  );
});

test("walletAddresses: a wallet without unused addresses (undefined, or no such method) still gives its others", async () => {
  const answering = pagingWallet({ used: ["01aa"], change: "01bb" });
  answering.getUnusedAddresses = async () => undefined;
  assert.deepEqual(await walletAddresses(answering), ["01bb", "01aa"]);
  const without = pagingWallet({ used: ["01aa"], change: "01bb" });
  delete without.getUnusedAddresses;
  assert.deepEqual(await walletAddresses(without), ["01bb", "01aa"]);
});

test("walletAddresses: a failure on a later page is passed on, as the wallet's error", async () => {
  const used = addresses(80);
  for (const [failure, kind] of [
    [{ code: -4, info: "account changed" }, WalletAccountChangedError],
    [{ code: -2, info: "internal error" }, WalletSignError],
  ]) {
    const wallet = pagingWallet({ used, change: "01bb" });
    const pages = wallet.getUsedAddresses;
    wallet.getUsedAddresses = async (paginate) => {
      if (paginate && paginate.page > 0) {
        throw failure;
      }
      return pages(paginate);
    };
    await assert.rejects(
      walletAddresses(wallet),
      (error) =>
        error instanceof kind &&
        error.cause === failure &&
        error.call === "getUsedAddresses"
    );
  }
});

test("ownsAddress compares the bytes of an address the server names with the wallet's", async () => {
  const keys = walletKeys();
  const other = walletKeys();
  const mine = [keys.enterpriseHex, keys.baseHex.toUpperCase(), "garbage"];
  assert.equal(await ownsAddress(mine, keys.baseBech32), true);
  assert.equal(await ownsAddress(mine, keys.enterpriseBech32), true);
  assert.equal(await ownsAddress(mine, keys.baseHex), true);
  assert.equal(await ownsAddress(mine, other.baseBech32), false);
  assert.equal(await ownsAddress(mine, "addr_test1nonsense"), false);
  assert.equal(await ownsAddress([], keys.baseBech32), false);
  // a wallet that named its address in bech32
  assert.equal(await ownsAddress([keys.baseBech32], keys.baseHex), true);
  assert.equal(await ownsAddress([keys.baseBech32], keys.baseBech32), true);
});

test("the sign page's address for a sign code", () => {
  assert.equal(
    signPageUrl("SfQzUoVazDOtPs2qxal6sA", "https://battlechoc.com"),
    "https://battlechoc.com/sign/?code=SfQzUoVazDOtPs2qxal6sA"
  );
});

const OLD_TX = "84a4aa";
const NEW_TX = "84a4bb";
const { mainnet } = cardano.Networks;
const utf8Hex = (text) => Buffer.from(text, "utf8").toString("hex");
// the sign window's end: in ten minutes, to the millisecond as the server writes it
const inMinutes = (minutes) =>
  new Date(Date.now() + minutes * 60000).toISOString();

// a sign info as GET /chain/sign/:code answers it (task 4b)
const signInfoFor = (keys, overrides = {}) => ({
  kind: "mint",
  operationId: "d7f82642-e5c8-4876-85fe-796938dc0a50",
  ownerConfirmed: true,
  item: { item: "DARK_WALLS", serial: 12 },
  tx: OLD_TX,
  network: "preprod",
  costs: { networkFee: 400000, gameFee: null, deposit: 3600000 },
  subject: keys.stakeSubject,
  address: keys.baseBech32,
  signUntil: inMinutes(10),
  ...overrides,
});

// the server's payload for `info` and `addresses` (shared addressProofMessage, as
// apps/api/src/chain/walletAddresses.js builds it), with any field changed by `changes`
const proofPayload = (keys, info, addresses, changes = {}) =>
  utf8Hex(
    cardano.addressProofMessage({
      domain: "battlechoc.com",
      network: preprod,
      operationId: info.operationId,
      item: info.item.item,
      serial: info.item.serial,
      subjectAddress: info.subject.startsWith("stake:")
        ? keys.rewardBech32
        : keys.enterpriseBech32,
      addresses,
      expires: info.signUntil,
      ...changes,
    })
  );

test("addressOfSubject gives the address the server names for a subject (its addressOfSubject)", async () => {
  // apps/api/src/cardano.js addressOfSubject, run once for these subjects
  const server = [
    [
      "stake:" + "ab".repeat(28),
      preprod,
      "stake_test1uz46h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2cwudutw",
    ],
    [
      "stake:" + "ab".repeat(28),
      mainnet,
      "stake1ux46h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2cfk870n",
    ],
    [
      "pay:" + "ab".repeat(28),
      preprod,
      "addr_test1vz46h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2cw5nyuy",
    ],
    [
      "pay:" + "ab".repeat(28),
      mainnet,
      "addr1vx46h2at4w46h2at4w46h2at4w46h2at4w46h2at4w46h2c4u8cnp",
    ],
    [
      "stake:5c324c662685500aa2bf66546cdd58293c653505a4dbb7a1822f6e90",
      preprod,
      "stake_test1upwrynrxy6z4qz4zhan9gmxatq5ncef4qkjdhdapsghkayqjhym4f",
    ],
    [
      "stake:5c324c662685500aa2bf66546cdd58293c653505a4dbb7a1822f6e90",
      mainnet,
      "stake1u9wrynrxy6z4qz4zhan9gmxatq5ncef4qkjdhdapsghkayq4awe35",
    ],
    [
      "pay:5c324c662685500aa2bf66546cdd58293c653505a4dbb7a1822f6e90",
      preprod,
      "addr_test1vpwrynrxy6z4qz4zhan9gmxatq5ncef4qkjdhdapsghkayqjl6rzr",
    ],
    [
      "pay:5c324c662685500aa2bf66546cdd58293c653505a4dbb7a1822f6e90",
      mainnet,
      "addr1v9wrynrxy6z4qz4zhan9gmxatq5ncef4qkjdhdapsghkayqfhwldx",
    ],
  ];
  for (const [subject, network, address] of server) {
    assert.equal(await addressOfSubject(subject, network), address, subject);
  }
  const keys = walletKeys();
  assert.equal(
    await addressOfSubject(keys.stakeSubject, preprod),
    keys.rewardBech32
  );
  assert.equal(
    await addressOfSubject(keys.paySubject, preprod),
    keys.enterpriseBech32
  );
  for (const odd of ["stake:zz", "nope:" + "ab".repeat(28), "", undefined]) {
    await assert.rejects(addressOfSubject(odd, preprod), String(odd));
  }
});

test("a wallet that answers bech32 still has its subject (its addresses read as bytes)", async () => {
  const keys = walletKeys();
  const stake = fakeWallet(keys, { reward: keys.rewardBech32 });
  assert.equal(await subjectOfWallet(stake), keys.stakeSubject);
  assert.equal(
    await signMintTx(stake, {
      tx: TX,
      network: preprod,
      subject: keys.stakeSubject,
    }),
    WITNESS
  );
  const pay = fakeWallet(keys, {
    rewards: false,
    used: [keys.enterpriseBech32],
  });
  assert.equal(await subjectOfWallet(pay), keys.paySubject);
});

test("a wallet whose address is neither hex nor bech32 has no subject: UnsupportedAddressError", async () => {
  const keys = walletKeys();
  for (const reward of ["not an address", "stake_test1nonsense", "abc"]) {
    await assert.rejects(
      subjectOfWallet(fakeWallet(keys, { reward })),
      (error) =>
        error instanceof UnsupportedAddressError &&
        error.reason === "unreadable" &&
        error.address === reward,
      reward
    );
  }
});

test("proveAddresses signs the server's text with the address of the subject and returns the wallet's answer untouched", async () => {
  const keys = walletKeys();
  const answer = { signature: "84aa", key: "a5bb" };
  const stake = fakeWallet(keys, { prove: async () => answer });
  const info = signInfoFor(keys);
  const addresses = [keys.baseHex];
  const payload = proofPayload(keys, info, addresses);
  assert.equal(
    await proveAddresses(stake, { info, addresses, payload, network: preprod }),
    answer
  );
  assert.deepEqual(stake.proved, [[keys.rewardHex, payload]]);
  assert.deepEqual(stake.asked, []);
  // a wallet without a stake key signs with its payment address (a base one here); the text
  // names the enterprise address of that key, as the server's addressOfSubject does
  const pay = fakeWallet(keys, { rewards: false });
  const payInfo = signInfoFor(keys, { subject: keys.paySubject });
  const payPayload = proofPayload(keys, payInfo, addresses);
  assert.ok(
    Buffer.from(payPayload, "hex")
      .toString("utf8")
      .includes(keys.enterpriseBech32)
  );
  await proveAddresses(pay, {
    info: payInfo,
    addresses,
    payload: payPayload,
    network: preprod,
  });
  assert.deepEqual(pay.proved, [[keys.baseHex, payPayload]]);
});

test("proveAddresses: the network and the account are checked before the wallet is asked to sign", async () => {
  const keys = walletKeys();
  const other = walletKeys();
  const info = signInfoFor(keys);
  const addresses = [keys.baseHex];
  const payload = proofPayload(keys, info, addresses);
  const elsewhere = fakeWallet(keys, { networkId: 1 });
  await assert.rejects(
    proveAddresses(elsewhere, { info, addresses, payload, network: preprod }),
    WalletNetworkError
  );
  assert.deepEqual(elsewhere.proved, []);
  const otherAccount = fakeWallet(other);
  await assert.rejects(
    proveAddresses(otherAccount, {
      info,
      addresses,
      payload,
      network: preprod,
    }),
    (error) =>
      error instanceof WalletOtherAccountError &&
      error.actual === other.stakeSubject
  );
  assert.deepEqual(otherAccount.proved, []);
});

test("proveAddresses signs only battlechoc's address proof for exactly this operation and list: anything else is refused before the wallet is asked anything", async () => {
  const keys = walletKeys();
  const other = walletKeys();
  const info = signInfoFor(keys);
  const addresses = [keys.baseHex, keys.enterpriseHex];
  const challenge = cardano.challengeMessage({
    address: keys.rewardBech32,
    purpose: "sign-in",
    network: preprod,
    nonce: "n1",
    issuedAt: new Date(),
    expiresAt: new Date(Date.now() + 300000),
  });
  const cases = [
    // no hex, or no proof text at all: no proof (C-M7: never a TypeError of the page)
    [undefined, "text"],
    ["", "text"],
    ["xyz", "text"],
    ["abc", "text"],
    ["ff", "text"],
    // the proof text behind a byte order mark is not the text the server builds
    ["efbbbf" + proofPayload(keys, info, addresses), "text"],
    [utf8Hex("please sign this"), "text"],
    [utf8Hex(challenge), "text"],
    [proofPayload(keys, info, addresses) + "0a", "text"],
    // a proof text for something else
    [proofPayload(keys, info, addresses, { domain: "evil.example" }), "domain"],
    [proofPayload(keys, info, addresses, { network: mainnet }), "network"],
    [
      proofPayload(keys, info, addresses, { operationId: "other-op" }),
      "operationId",
    ],
    [proofPayload(keys, info, addresses, { item: "LIGHT_WALLS" }), "item"],
    [proofPayload(keys, info, addresses, { serial: 13 }), "serial"],
    [
      proofPayload(keys, info, addresses, {
        subjectAddress: other.rewardBech32,
      }),
      "subjectAddress",
    ],
    [
      proofPayload(keys, info, addresses, {
        subjectAddress: keys.enterpriseBech32,
      }),
      "subjectAddress",
    ],
    [proofPayload(keys, info, [keys.baseHex]), "addressCount"],
    [proofPayload(keys, info, [keys.enterpriseHex, keys.baseHex]), "digest"],
    [proofPayload(keys, info, [keys.baseHex, other.baseHex]), "digest"],
    [
      proofPayload(keys, info, addresses, { expires: inMinutes(11) }),
      "expires",
    ],
  ];
  for (const [payload, expected] of cases) {
    const wallet = fakeWallet(keys);
    await assert.rejects(
      proveAddresses(wallet, { info, addresses, payload, network: preprod }),
      (error) =>
        expected === TypeError
          ? error instanceof TypeError
          : error instanceof UnexpectedProofTextError &&
            error.field === expected,
      `${expected === TypeError ? "TypeError" : expected}: ${payload}`
    );
    assert.deepEqual(wallet.calls, [], String(expected));
  }
  // the sign info of another network than the game's
  const wallet = fakeWallet(keys);
  const mainnetInfo = signInfoFor(keys, { network: "mainnet" });
  await assert.rejects(
    proveAddresses(wallet, {
      info: mainnetInfo,
      addresses,
      payload: proofPayload(keys, mainnetInfo, addresses),
      network: preprod,
    }),
    (error) =>
      error instanceof UnexpectedProofTextError && error.field === "network"
  );
  assert.deepEqual(wallet.calls, []);
  // the case of the hex does not count, the expiry may be the window's end exactly
  const upper = addresses.map((address) => address.toUpperCase());
  const fine = fakeWallet(keys);
  await proveAddresses(fine, {
    info,
    addresses: upper,
    payload: proofPayload(keys, info, addresses),
    network: preprod,
  });
  assert.equal(fine.proved.length, 1);
});

test("proveAddresses: how a wallet fails at signData (CIP-30 DataSignError), with the call named", async () => {
  const keys = walletKeys();
  const info = signInfoFor(keys);
  const addresses = [keys.baseHex];
  const payload = proofPayload(keys, info, addresses);
  for (const [failure, kind] of [
    [{ code: 3, info: "user declined" }, WalletCancelledError],
    [{ code: -3, info: "refused" }, WalletCancelledError],
    ["User rejected", WalletCancelledError],
    [{ code: 1, info: "ProofGeneration" }, WalletCannotSignError],
    [{ code: 2, info: "AddressNotPK" }, WalletCannotSignError],
    [{ code: -4, info: "account changed" }, WalletAccountChangedError],
    [{ code: -2, info: "internal" }, WalletSignError],
  ]) {
    const wallet = fakeWallet(keys, {
      prove: async () => {
        throw failure;
      },
    });
    await assert.rejects(
      proveAddresses(wallet, { info, addresses, payload, network: preprod }),
      (error) =>
        error instanceof kind &&
        error.cause === failure &&
        error.call === "signData",
      JSON.stringify(failure)
    );
  }
  for (const odd of [undefined, "84aa", { signature: "84aa" }]) {
    const wallet = fakeWallet(keys, { prove: async () => odd });
    await assert.rejects(
      proveAddresses(wallet, { info, addresses, payload, network: preprod }),
      (error) => error instanceof WalletSignError && error.call === "signData"
    );
  }
});

// the sign page's API (createSignApi) as signPrepared uses it: the payload is the server's text
// for the info and the list it gets (`payloadFor` changes it); `rebuilt` answers the proof
const fakeSignApi = (keys, info, { rebuilt, payloadFor } = {}) => {
  const calls = [];
  return {
    calls,
    signAddressesPayload: async (code, addresses) => {
      calls.push(["payload", code, addresses]);
      return payloadFor
        ? payloadFor(addresses)
        : proofPayload(keys, info, addresses);
    },
    signAddresses: async (code, addresses, proof) => {
      calls.push(["addresses", code, addresses, proof]);
      if (rebuilt instanceof Error) {
        throw rebuilt;
      }
      return rebuilt;
    },
  };
};

// the wallet's prompts in order
const prompts = (wallet) =>
  wallet.calls.filter((name) => name === "signData" || name === "signTx");

test("signPrepared: a confirmed operation whose address is the wallet's is signed at once", async () => {
  const keys = walletKeys();
  const wallet = fakeWallet(keys);
  const info = signInfoFor(keys);
  const api = fakeSignApi(keys, info);
  const result = await signPrepared(wallet, {
    api,
    code: "c0de",
    info,
    network: preprod,
  });
  assert.deepEqual(result, { info, witness: WITNESS });
  assert.equal(result.info, info);
  assert.deepEqual(api.calls, []);
  assert.deepEqual(prompts(wallet), ["signTx"]);
  assert.deepEqual(wallet.asked, [[OLD_TX, true]]);
});

test("signPrepared: an operation not confirmed, or built for another address, is proven and rebuilt first, and only the new transaction is signed", async () => {
  const keys = walletKeys();
  const other = walletKeys();
  for (const overrides of [
    { ownerConfirmed: false },
    { ownerConfirmed: false, address: other.baseBech32 },
    { address: other.baseBech32 },
    { ownerConfirmed: undefined },
  ]) {
    const proof = { signature: "84aa", key: "a5bb" };
    const wallet = fakeWallet(keys, { prove: async () => proof });
    const info = signInfoFor(keys, overrides);
    const rebuilt = signInfoFor(keys, {
      tx: NEW_TX,
      signUntil: info.signUntil,
      costs: { networkFee: 410000, gameFee: null, deposit: 3610000 },
    });
    const api = fakeSignApi(keys, info, { rebuilt });
    const result = await signPrepared(wallet, {
      api,
      code: "c0de",
      info,
      network: preprod,
    });
    assert.equal(result.info, rebuilt, JSON.stringify(overrides));
    assert.equal(result.witness, WITNESS);
    assert.deepEqual(api.calls, [
      ["payload", "c0de", [keys.baseHex]],
      ["addresses", "c0de", [keys.baseHex], proof],
    ]);
    assert.equal(api.calls[1][3], proof);
    assert.deepEqual(prompts(wallet), ["signData", "signTx"]);
    assert.deepEqual(wallet.proved, [
      [keys.rewardHex, proofPayload(keys, info, [keys.baseHex])],
    ]);
    assert.deepEqual(wallet.asked, [[NEW_TX, true]]);
  }
});

test("signPrepared: a payload that is not the proof for this operation and list is refused before any prompt, and nothing is sent", async () => {
  const keys = walletKeys();
  const other = walletKeys();
  const info = signInfoFor(keys, { ownerConfirmed: false });
  for (const payloadFor of [
    () => utf8Hex("anything the server likes"),
    (addresses) => proofPayload(keys, info, [...addresses, other.baseHex]),
    (addresses) =>
      proofPayload(keys, info, addresses, { operationId: "other-op" }),
  ]) {
    const wallet = fakeWallet(keys);
    const api = fakeSignApi(keys, info, {
      payloadFor,
      rebuilt: signInfoFor(keys, { tx: NEW_TX }),
    });
    await assert.rejects(
      signPrepared(wallet, { api, code: "c0de", info, network: preprod }),
      UnexpectedProofTextError
    );
    assert.deepEqual(
      api.calls.map(([step]) => step),
      ["payload"]
    );
    assert.deepEqual(prompts(wallet), []);
  }
});

test("signPrepared: a refused or failed proof, or a rebuild that is not this operation's confirmed one, never reaches signTx", async () => {
  const keys = walletKeys();
  const other = walletKeys();
  const unconfirmed = signInfoFor(keys, { ownerConfirmed: false });

  const declined = { code: 3, info: "user declined" };
  const refusing = fakeWallet(keys, {
    prove: async () => {
      throw declined;
    },
  });
  const api = fakeSignApi(keys, unconfirmed, {
    rebuilt: signInfoFor(keys, { tx: NEW_TX }),
  });
  await assert.rejects(
    signPrepared(refusing, {
      api,
      code: "c0de",
      info: unconfirmed,
      network: preprod,
    }),
    (error) =>
      error instanceof WalletCancelledError &&
      error.cause === declined &&
      error.call === "signData"
  );
  assert.deepEqual(
    api.calls.map(([step]) => step),
    ["payload"]
  );
  assert.deepEqual(prompts(refusing), ["signData"]);

  // the server refuses the proof (400 INVALID SIGNATURE): its error, unchanged
  const invalid = Object.assign(new Error("400 INVALID SIGNATURE"), {
    code: "INVALID SIGNATURE",
  });
  const proving = fakeWallet(keys);
  await assert.rejects(
    signPrepared(proving, {
      api: fakeSignApi(keys, unconfirmed, { rebuilt: invalid }),
      code: "c0de",
      info: unconfirmed,
      network: preprod,
    }),
    (error) => error === invalid
  );
  assert.deepEqual(prompts(proving), ["signData"]);

  // a rebuild that is not confirmed, not for the wallet, not this operation's or without a tx
  const { tx: unusedTx, ...withoutTx } = signInfoFor(keys, { tx: NEW_TX });
  for (const [rebuilt, reason] of [
    [signInfoFor(keys, { tx: NEW_TX, ownerConfirmed: false }), "not-confirmed"],
    [signInfoFor(keys, { tx: NEW_TX, address: other.baseBech32 }), "address"],
    [signInfoFor(keys, { tx: NEW_TX, subject: keys.paySubject }), "subject"],
    [signInfoFor(keys, { tx: NEW_TX, operationId: "other-op" }), "operation"],
    [withoutTx, "tx"],
    [signInfoFor(keys, { tx: "" }), "tx"],
    [signInfoFor(keys, { tx: "not hex" }), "tx"],
    [undefined, "not-confirmed"],
  ]) {
    const wallet = fakeWallet(keys);
    await assert.rejects(
      signPrepared(wallet, {
        api: fakeSignApi(keys, unconfirmed, { rebuilt }),
        code: "c0de",
        info: unconfirmed,
        network: preprod,
      }),
      (error) =>
        error instanceof OwnerNotConfirmedError &&
        error.info === rebuilt &&
        error.reason === reason,
      reason
    );
    assert.deepEqual(prompts(wallet), ["signData"]);
    assert.deepEqual(wallet.asked, []);
  }
});

test("signPrepared: a wallet on another network or with another account is never prompted, and the server is not asked", async () => {
  const keys = walletKeys();
  const other = walletKeys();
  for (const [wallet, kind] of [
    [fakeWallet(keys, { networkId: 1 }), WalletNetworkError],
    [fakeWallet(other), WalletOtherAccountError],
  ]) {
    for (const info of [
      signInfoFor(keys),
      signInfoFor(keys, { ownerConfirmed: false }),
    ]) {
      const api = fakeSignApi(keys, info, {
        rebuilt: signInfoFor(keys, { tx: NEW_TX }),
      });
      await assert.rejects(
        signPrepared(wallet, { api, code: "c0de", info, network: preprod }),
        kind
      );
      assert.deepEqual(api.calls, []);
      assert.deepEqual(prompts(wallet), []);
    }
  }
});

test("C-M7: an expiry already past on this device's clock is no reason to refuse the proof (only after the sign window's end is)", async () => {
  const keys = walletKeys();
  // the device's clock runs ahead: the server's expiry (the window's end) looks past here
  const info = signInfoFor(keys, { signUntil: inMinutes(-1) });
  const addresses = [keys.baseHex];
  const wallet = fakeWallet(keys);
  const proof = await proveAddresses(wallet, {
    info,
    addresses,
    payload: proofPayload(keys, info, addresses),
    network: preprod,
  });
  assert.deepEqual(proof, { signature: "84aa", key: "a5bb" });
  assert.equal(wallet.proved.length, 1);
});

test("C-M8: walletAddresses reads on past a page shorter than asked, until a page is empty or brings nothing new", async () => {
  const used = addresses(70);
  // a wallet that pages by 20, whatever the game asks for
  const short = {
    getUsedAddresses: async (paginate) =>
      paginate ? used.slice(paginate.page * 20, paginate.page * 20 + 20) : used,
    getUnusedAddresses: async () => [],
    getChangeAddress: async () => "60cafe00",
  };
  assert.deepEqual(await walletAddresses(short), ["60cafe00", ...used]);
  // one that answers its first page again: done after it
  const again = {
    getUsedAddresses: async () => used.slice(0, 20),
    getUnusedAddresses: async () => [],
    getChangeAddress: async () => "60cafe00",
  };
  assert.deepEqual(await walletAddresses(again), [
    "60cafe00",
    ...used.slice(0, 20),
  ]);
});

test("signPrepared for a salvage (kind burn): the burn's proof for exactly this operation and list is signed, then the rebuilt transaction", async () => {
  const keys = walletKeys();
  const proof = { signature: "84aa", key: "a5bb" };
  const wallet = fakeWallet(keys, { prove: async () => proof });
  const info = signInfoFor(keys, {
    kind: "burn",
    ownerConfirmed: false,
    costs: {
      networkFee: 368106,
      gameFee: null,
      deposit: 3710910,
      deposits: { reference: 2448080, user: 1262830 },
    },
    returns: { MILK: 2, VANILLA: 2, GOLDLEAF: 1 },
  });
  const rebuilt = { ...info, ownerConfirmed: true, tx: NEW_TX };
  const api = fakeSignApi(keys, info, {
    rebuilt,
    payloadFor: (addresses) =>
      proofPayload(keys, info, addresses, { purpose: "burn" }),
  });
  const result = await signPrepared(wallet, {
    api,
    code: "c0de",
    info,
    network: preprod,
  });
  assert.equal(result.info, rebuilt);
  assert.deepEqual(prompts(wallet), ["signData", "signTx"]);
  assert.deepEqual(wallet.asked, [[NEW_TX, true]]);
});

test("the proof of the other purpose is refused before any prompt: a mint's text for a burn, a burn's for a mint, and any kind the game does not know", async () => {
  const keys = walletKeys();
  for (const [kind, purpose] of [
    ["burn", "mint"],
    ["mint", "burn"],
    ["swap", "mint"],
    [undefined, "mint"],
  ]) {
    const info = signInfoFor(keys, { kind, ownerConfirmed: false });
    const wallet = fakeWallet(keys);
    const api = fakeSignApi(keys, info, {
      payloadFor: (addresses) =>
        proofPayload(keys, info, addresses, { purpose }),
      rebuilt: { ...info, ownerConfirmed: true, tx: NEW_TX },
    });
    await assert.rejects(
      signPrepared(wallet, { api, code: "c0de", info, network: preprod }),
      (failure) =>
        failure instanceof UnexpectedProofTextError &&
        ["text", "kind"].includes(failure.field),
      `${kind} with a ${purpose} proof`
    );
    assert.deepEqual(prompts(wallet), [], `${kind} with a ${purpose} proof`);
    assert.deepEqual(
      api.calls.map(([step]) => step),
      ["payload"]
    );
  }
});

test("a burn's proof text is checked as a mint's: another operation, list or domain is refused before any prompt", async () => {
  const keys = walletKeys();
  const other = walletKeys();
  const info = signInfoFor(keys, { kind: "burn", ownerConfirmed: false });
  for (const [payloadFor, field] of [
    (addresses) =>
      proofPayload(keys, info, addresses, {
        purpose: "burn",
        operationId: "a1b2c3d4-e5f6-4789-8abc-def012345678",
      }),
    (addresses) =>
      proofPayload(keys, info, [...addresses, other.baseHex], {
        purpose: "burn",
      }),
    (addresses) =>
      proofPayload(keys, info, addresses, {
        purpose: "burn",
        domain: "battlech0c.com",
      }),
  ].map((make, index) => [
    make,
    ["operationId", "addressCount", "domain"][index],
  ])) {
    const wallet = fakeWallet(keys);
    const api = fakeSignApi(keys, info, {
      payloadFor,
      rebuilt: { ...info, ownerConfirmed: true, tx: NEW_TX },
    });
    await assert.rejects(
      signPrepared(wallet, { api, code: "c0de", info, network: preprod }),
      (failure) =>
        failure instanceof UnexpectedProofTextError && failure.field === field
    );
    assert.deepEqual(prompts(wallet), []);
  }
});

test("signPrepared: a rebuilt answer of another kind than the operation signed for is refused before signTx", async () => {
  const keys = walletKeys();
  for (const [kind, other] of [
    ["burn", "mint"],
    ["mint", "burn"],
  ]) {
    const proof = { signature: "84aa", key: "a5bb" };
    const wallet = fakeWallet(keys, { prove: async () => proof });
    const info = signInfoFor(keys, { kind, ownerConfirmed: false });
    const api = fakeSignApi(keys, info, {
      rebuilt: { ...info, kind: other, ownerConfirmed: true, tx: NEW_TX },
      payloadFor: (addresses) =>
        proofPayload(keys, info, addresses, { purpose: kind }),
    });
    await assert.rejects(
      signPrepared(wallet, { api, code: "c0de", info, network: preprod }),
      (failure) =>
        failure instanceof OwnerNotConfirmedError && failure.reason === "kind"
    );
    assert.deepEqual(prompts(wallet), ["signData"]);
  }
});
