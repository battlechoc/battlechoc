// Signing a mint (plan D) with a CIP-30 wallet: an extension in the game, or a phone wallet's own
// browser on the sign page (/sign/). The server built the transaction from the wallet's
// addresses and signs it last; the wallet adds its witness set (signTx(tx, true): a partial
// signature, the server's key is still missing), which goes back to the server as it is. Before
// the wallet is asked, the game checks that it is on the game's network and that it is the
// account the server built for: a wallet that cannot sign the transaction is never asked.
// Every failure of a wallet call reaches the caller as one of the wallet errors below (or
// wallet.js's), never as what the wallet threw.
// The game does not inspect the transaction it hands to the wallet (it passes the server's CBOR
// on as it came): the check of what is signed is the wallet's own prompt, which shows the player
// the transaction, and the server's verifyWitness, which takes only a witness over this
// operation's own body. The address proof's text is the one thing checked here before a prompt
// (checkProofText).
// Like keys.js, nothing here loads the Evolution SDK before one of these runs.
import { cardano } from "@battlechoc/battlechoc-shared-functions";
import {
  addressBytesHex,
  addressOfSubject,
  subjectOfAddress,
  UnsupportedAddressError,
} from "./keys.js";
import {
  signingAddress,
  WalletCancelledError,
  WalletNetworkError,
  WalletWithoutAddressError,
} from "./wallet.js";

export { UnsupportedAddressError };

/** The wallet holds another account than the one the mint was built for (`expected`). */
export class WalletOtherAccountError extends Error {
  constructor(expected, actual) {
    super(`the wallet's account is ${actual}, the mint is for ${expected}`);
    this.name = "WalletOtherAccountError";
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * The account in the wallet changed since the game connected it (CIP-30 APIError -4,
 * AccountChange): the wallet answers nothing more until it is connected again (`cause`).
 */
export class WalletAccountChangedError extends Error {
  constructor(cause) {
    super("the account in the wallet changed");
    this.name = "WalletAccountChangedError";
    this.cause = cause;
  }
}

/**
 * The wallet lacks a key it was asked to sign with: CIP-30 TxSignError 1 (ProofGeneration) at
 * signTx, e.g. an address the server built from belongs to another account of the same wallet
 * app; DataSignError 1 (ProofGeneration) or 2 (AddressNotPK: the address has no key of the
 * wallet's) at signData.
 */
export class WalletCannotSignError extends Error {
  constructor(cause) {
    super("the wallet cannot sign this");
    this.name = "WalletCannotSignError";
    this.cause = cause;
  }
}

/**
 * The wallet failed in a way the game cannot name, before or at the signature: `detail` is the
 * wallet's own text (for a Details line), `cause` what it threw.
 */
export class WalletSignError extends Error {
  constructor(cause, detail) {
    super(`the wallet failed: ${detail}`);
    this.name = "WalletSignError";
    this.cause = cause;
    this.detail = detail;
  }
}

// CIP-30 codes: APIError -3 (Refused) and -4 (AccountChange), on any call; and the codes of one
// call: signTx's TxSignError (2 UserDeclined, 1 ProofGeneration), signData's DataSignError
// (3 UserDeclined, 1 ProofGeneration, 2 AddressNotPK: no key of the wallet's for the address).
// Wallets also say no in words: a plain string, or an object or Error without a code whose text
// says so, but never JavaScript's own errors (a bug in the wallet is no "no").
const REFUSED = -3;
const ACCOUNT_CHANGE = -4;
const CODES_OF_CALL = {
  signTx: { 2: "declined", 1: "cannot" },
  signData: { 3: "declined", 1: "cannot", 2: "cannot" },
};
const DECLINED_TEXT = /declin|reject|refus|cancel|denied/i;
const BUILT_IN_ERRORS = [
  TypeError,
  RangeError,
  ReferenceError,
  SyntaxError,
  EvalError,
  URIError,
];

const MAX_DETAIL = 200;

const textOf = (failure) => {
  if (typeof failure === "string") {
    return failure;
  }
  if (failure !== null && typeof failure === "object") {
    const words = [failure.info, failure.message].find(
      (text) => typeof text === "string" && text !== ""
    );
    if (failure.code !== undefined) {
      return words ? `code ${failure.code}: ${words}` : `code ${failure.code}`;
    }
    if (failure instanceof Error) {
      return `${failure.name}: ${failure.message}`;
    }
    if (words) {
      return words;
    }
    try {
      return JSON.stringify(failure).slice(0, MAX_DETAIL);
    } catch {
      return "an unreadable answer";
    }
  }
  return String(failure);
};

// a refusal in words: a plain string, or an object or Error without a code that says so
const saysNo = (failure) => {
  if (typeof failure === "string") {
    return DECLINED_TEXT.test(failure);
  }
  if (
    failure === null ||
    typeof failure !== "object" ||
    failure.code !== undefined ||
    BUILT_IN_ERRORS.some((kind) => failure instanceof kind)
  ) {
    return false;
  }
  return [failure.info, failure.message].some(
    (text) => typeof text === "string" && DECLINED_TEXT.test(text)
  );
};

const codeOf = (failure) =>
  failure !== null && typeof failure === "object" ? failure.code : undefined;

// what a failure of the wallet's `call` ("getNetworkId", "signTx", …) is for the player: a
// wallet error that names the call (`call`)
const walletFailureOf = (failure, call) => {
  const code = codeOf(failure);
  const ofCall = (CODES_OF_CALL[call] || {})[code];
  let mapped;
  if (code === REFUSED || ofCall === "declined" || saysNo(failure)) {
    mapped = new WalletCancelledError(failure);
  } else if (code === ACCOUNT_CHANGE) {
    mapped = new WalletAccountChangedError(failure);
  } else if (ofCall === "cannot") {
    mapped = new WalletCannotSignError(failure);
  } else {
    mapped = new WalletSignError(failure, textOf(failure));
  }
  mapped.call = call;
  return mapped;
};

// a wallet answer that is not what the call answers
const oddAnswer = (answer, call) =>
  Object.assign(
    new WalletSignError(answer, "the wallet answered no signature"),
    {
      call,
    }
  );

// `walletApi.name(...args)`, its failure as the wallet error it means
const ask = async (walletApi, name, ...args) => {
  try {
    return await walletApi[name](...args);
  } catch (failure) {
    throw walletFailureOf(failure, name);
  }
};

// the address-reading calls of `walletApi` with their failures mapped (a plain object, not a
// Proxy: a wallet's api may be frozen)
const guarded = (walletApi) => ({
  getNetworkId: () => ask(walletApi, "getNetworkId"),
  getRewardAddresses: () => ask(walletApi, "getRewardAddresses"),
  getUsedAddresses: (...args) => ask(walletApi, "getUsedAddresses", ...args),
  getChangeAddress: () => ask(walletApi, "getChangeAddress"),
});

/**
 * The identity subject the wallet signs for ("stake:<hash>" for its reward address, else
 * "pay:<hash>" for its first used or its change address), as signWithWallet chooses the address.
 * WalletWithoutAddressError when it has no address, UnsupportedAddressError when that address
 * has no key (a script's) or cannot be read; a failing wallet call as its wallet error.
 */
export const subjectOfWallet = async (walletApi) =>
  (await signerOf(walletApi)).subject;

const isHexBytes = (text) =>
  typeof text === "string" && /^(?:[0-9a-f]{2})+$/i.test(text);

// the address the wallet signs with (signingAddress's choice, as the wallet gave it: hex, or
// bech32 from a wallet that answers so) and its subject
const signerOf = async (walletApi) => {
  const address = await signingAddress(guarded(walletApi));
  const hex = await asHex(address);
  if (!hex) {
    throw new UnsupportedAddressError(address, "unreadable");
  }
  return { address, subject: await subjectOfAddress(hex) };
};

// the checks before any prompt: the wallet is on `network` and holds the account `subject`
const checkedSigner = async (walletApi, { network, subject }) => {
  const walletNetwork = await ask(walletApi, "getNetworkId");
  if (walletNetwork !== network.networkId) {
    throw new WalletNetworkError(network.networkId, walletNetwork);
  }
  const signer = await signerOf(walletApi);
  if (signer.subject !== subject) {
    throw new WalletOtherAccountError(subject, signer.subject);
  }
  return signer;
};

/**
 * The wallet's witness set (hex, as the wallet gives it) for the mint `tx` (the server's unsigned
 * CBOR hex, passed to the wallet exactly as it came) on `network` (shared cardano.Networks) for
 * `subject` (the wallet the server built for).
 * Without asking the wallet to sign, it throws: TypeError for a `tx` that is no hex (nothing is
 * asked of the wallet at all), WalletNetworkError, WalletOtherAccountError, and what
 * subjectOfWallet throws. At the signature: WalletCancelledError (the player said no),
 * WalletAccountChangedError, WalletCannotSignError (the wallet lacks a key the transaction
 * needs), WalletSignError for anything else.
 */
export const signMintTx = async (walletApi, { tx, network, subject }) => {
  if (!isHexBytes(tx)) {
    throw new TypeError("the transaction to sign is no CBOR hex");
  }
  await checkedSigner(walletApi, { network, subject });
  let witness;
  try {
    witness = await walletApi.signTx(tx, true);
  } catch (failure) {
    throw walletFailureOf(failure, "signTx");
  }
  if (typeof witness !== "string" || witness === "") {
    throw oddAnswer(witness, "signTx");
  }
  return witness;
};

/**
 * The text the server asked the wallet to sign is not battlechoc's address proof for this
 * operation and this list (`field`: the first that differed: "text" when it is no such text at
 * all, else one of addressProofOf's fields). Nothing was asked of the wallet, nothing was sent.
 */
export class UnexpectedProofTextError extends Error {
  constructor(field) {
    super(
      `the text to sign is not battlechoc's address proof for this mint (${field})`
    );
    this.name = "UnexpectedProofTextError";
    this.field = field;
  }
}

// the game's domain, as the sign-in's challenge names it (its "URI: https://…" line, the text
// isOurChallenge checks against)
const ourDomain = () =>
  /^URI: https:\/\/(.+)$/m.exec(
    cardano.challengeMessage({
      address: "-",
      purpose: "connect",
      network: { name: "-" },
      nonce: "-",
      issuedAt: new Date(0),
      expiresAt: new Date(0),
    })
  )[1];

// the UTF-8 text of hex bytes exactly as they are (a leading byte order mark stays, so such a
// text is no proof); null when they are no UTF-8
const textOfHex = (hex) => {
  const bytes = Uint8Array.from(hex.match(/../g), (pair) =>
    Number.parseInt(pair, 16)
  );
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes
    );
  } catch {
    return null;
  }
};

// the sign-in's rule for the address proof: sign battlechoc's text for exactly this operation
// (`info`, the sign info) and this list (`addresses`, as they are sent), nothing else
const checkProofText = async ({ payload, info, addresses, network }) => {
  const text = textOfHex(payload);
  const proof = text === null ? null : cardano.addressProofOf(text);
  if (!proof) {
    throw new UnexpectedProofTextError("text");
  }
  const subjectAddress = await addressOfSubject(info.subject, network).catch(
    () => undefined
  );
  const expires = Date.parse(proof.expires);
  const item = info.item || {};
  const failed = [
    ["domain", proof.domain === ourDomain()],
    [
      "network",
      proof.network === network.name && proof.network === info.network,
    ],
    ["operationId", proof.operationId === info.operationId],
    ["item", proof.item === item.item],
    ["serial", proof.serial === item.serial],
    [
      "subjectAddress",
      typeof subjectAddress === "string" &&
        proof.subjectAddress === subjectAddress,
    ],
    ["addressCount", proof.addressCount === addresses.length],
    ["digest", proof.digest === cardano.addressProofDigest(addresses)],
    // not after the sign window's end; no lower bound: the device's clock is no check (the
    // server refuses a proof whose time is over), and a wrong clock would only stop a signature
    ["expires", expires <= Date.parse(info.signUntil)],
  ].find(([, met]) => !met);
  if (failed) {
    throw new UnexpectedProofTextError(failed[0]);
  }
};

/**
 * The wallet's proof that `addresses` (hex, the list exactly as it is sent:
 * walletAddresses') belong to it, for the operation of `info` (the sign info: signInfo's
 * answer): CIP-30 signData of `payload` (hex: the server's text, signAddressesPayload) with the
 * address of the info's subject (its reward address for "stake:", its payment address for
 * "pay:", as signWithWallet chooses it), `{ signature, key }` as the wallet gives it.
 * Before the wallet is asked anything: TypeError for an empty list; UnexpectedProofTextError
 * (`field`) for a payload that is not battlechoc's address proof (shared cardano.addressProofOf:
 * "text" for one that is no hex, no UTF-8 or no such text at all, a leading byte order mark
 * included) for this game's domain, `network` and the info's network, the info's operation, item
 * and serial, the address of its subject, exactly `addresses` (count and digest) and an expiry
 * not after the info's `signUntil`. Then WalletNetworkError,
 * WalletOtherAccountError and what subjectOfWallet throws, still before any prompt. At the
 * signature (`call` "signData"): WalletCancelledError, WalletAccountChangedError,
 * WalletCannotSignError, WalletSignError.
 */
export const proveAddresses = async (
  walletApi,
  { info, addresses, payload, network }
) => {
  if (!isHexBytes(payload)) {
    throw new UnexpectedProofTextError("text");
  }
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new TypeError("no addresses to vouch for");
  }
  await checkProofText({ payload, info, addresses, network });
  const { address } = await checkedSigner(walletApi, {
    network,
    subject: info.subject,
  });
  let proof;
  try {
    proof = await walletApi.signData(address, payload);
  } catch (failure) {
    throw walletFailureOf(failure, "signData");
  }
  if (
    proof === null ||
    typeof proof !== "object" ||
    typeof proof.signature !== "string" ||
    typeof proof.key !== "string"
  ) {
    throw oddAnswer(proof, "signData");
  }
  return proof;
};

/**
 * The server answered the proof with no confirmed rebuild of this operation (`info`: its answer):
 * `reason` "not-confirmed" (no `ownerConfirmed: true`), "subject" or "operation" (another subject
 * or operation than the first sign info's), "tx" (no transaction to sign), "address" (the item
 * would not go to one of the wallet's addresses). A fault of the server, not of the player.
 */
export class OwnerNotConfirmedError extends Error {
  constructor(info, reason) {
    super(`the server did not confirm the mint for this wallet (${reason})`);
    this.name = "OwnerNotConfirmedError";
    this.info = info;
    this.reason = reason;
  }
}

// whether the sign info `info` is confirmed for one of `addresses` (the item goes there)
const confirmedFor = async (addresses, info) =>
  Boolean(info) &&
  info.ownerConfirmed === true &&
  (await ownsAddress(addresses, info.address));

// what is wrong with `rebuilt`, the server's answer to the proof for the operation of `first`
const rebuildProblem = async (addresses, first, rebuilt) => {
  if (
    rebuilt === null ||
    typeof rebuilt !== "object" ||
    rebuilt.ownerConfirmed !== true
  ) {
    return "not-confirmed";
  }
  if (rebuilt.subject !== first.subject) {
    return "subject";
  }
  if (rebuilt.operationId !== first.operationId) {
    return "operation";
  }
  if (!isHexBytes(rebuilt.tx)) {
    return "tx";
  }
  if (!(await ownsAddress(addresses, rebuilt.address))) {
    return "address";
  }
  return null;
};

/**
 * The sign page's whole signature of a prepared operation, `info` (signInfo's answer for `code`)
 * with `api` (createSignApi's, or the game's chainApi) on `network`: checks the wallet (network,
 * account) before anything; reads its addresses; when the operation is not confirmed for one of
 * them, has the wallet prove them (the payload, checked as proveAddresses does, signData, the
 * proof posted) and takes the rebuilt info (OwnerNotConfirmedError when that is not this
 * operation's confirmed one with a transaction for the wallet); then signs that info's
 * transaction. `{ info, witness }`: the info signed (its costs may have changed: show them) and
 * the witness set, which the caller posts (api.sign). The wallet is prompted at most twice
 * (signData, then signTx) and never for a transaction not confirmed; any failure is the wallet
 * error or the API's (e.g. 400 INVALID SIGNATURE for a refused proof), unchanged.
 */
export const signPrepared = async (walletApi, { api, code, info, network }) => {
  await checkedSigner(walletApi, { network, subject: info.subject });
  const addresses = await walletAddresses(walletApi);
  let signing = info;
  if (!(await confirmedFor(addresses, info))) {
    const payload = await api.signAddressesPayload(code, addresses);
    const proof = await proveAddresses(walletApi, {
      info,
      addresses,
      payload,
      network,
    });
    signing = await api.signAddresses(code, addresses, proof);
    const problem = await rebuildProblem(addresses, info, signing);
    if (problem) {
      throw new OwnerNotConfirmedError(signing, problem);
    }
  }
  const witness = await signMintTx(walletApi, {
    tx: signing.tx,
    network,
    subject: signing.subject,
  });
  return { info: signing, witness };
};

// how many addresses the wallet names at most, and how many used ones are asked per page
const MAX_ADDRESSES = 100;
const PAGE_SIZE = 50;

const addressList = (answer) =>
  Array.isArray(answer)
    ? answer.filter((address) => typeof address === "string" && address)
    : [];

// CIP-30 PaginateError: a page past the last one
const isPaginateError = (failure) =>
  failure !== null &&
  typeof failure === "object" &&
  typeof failure.maxSize === "number";

// the wallet's used addresses, page by page (CIP-30 Paginate) until there are `room`: until a
// page is empty or brings nothing new (a wallet that ignores the pages answers the same again; one
// whose pages are shorter than asked goes on), or one that refuses them is asked once without
const usedAddresses = async (walletApi, room) => {
  const found = [];
  for (let page = 0; found.length < room; page += 1) {
    let batch;
    try {
      batch = addressList(
        await walletApi.getUsedAddresses({ page, limit: PAGE_SIZE })
      );
    } catch (failure) {
      if (isPaginateError(failure)) {
        break;
      }
      if (page === 0) {
        return addressList(await ask(walletApi, "getUsedAddresses"));
      }
      throw walletFailureOf(failure, "getUsedAddresses");
    }
    const fresh = batch.filter((address) => !found.includes(address));
    found.push(...fresh);
    if (fresh.length === 0) {
      break;
    }
  }
  return found;
};

// an address as a wallet gave it, as the hex of its bytes: hex stays as it is, bech32 is
// converted; undefined for anything else
const asHex = async (address) => {
  if (isHexBytes(address)) {
    return address;
  }
  try {
    return await addressBytesHex(address);
  } catch {
    return undefined;
  }
};

/**
 * The addresses the wallet names as its own, as hex (as CIP-30 gives them; an address a wallet
 * gives in bech32 as the hex of its bytes; anything else is left out): its change address, then
 * its used ones (every page), then its unused ones, each once, at most 100. The server builds a
 * mint only from these (a stake key alone would also find addresses an outsider controls).
 * WalletWithoutAddressError when none is left; a failing wallet call as its wallet error.
 */
export const walletAddresses = async (walletApi) => {
  const change = addressList([await ask(walletApi, "getChangeAddress")]);
  const used = await usedAddresses(walletApi, MAX_ADDRESSES);
  const unused =
    typeof walletApi.getUnusedAddresses === "function"
      ? addressList(await ask(walletApi, "getUnusedAddresses"))
      : [];
  const seen = new Set();
  const all = [];
  for (const given of [...change, ...used, ...unused]) {
    const address = await asHex(given);
    const bytes = address && address.toLowerCase();
    if (bytes && !seen.has(bytes)) {
      seen.add(bytes);
      all.push(address);
    }
  }
  if (all.length === 0) {
    throw new WalletWithoutAddressError();
  }
  return all.slice(0, MAX_ADDRESSES);
};

/**
 * Whether `address` (bech32 as the server names it, e.g. the sign info's `address`, or hex) is
 * one of `addresses` (walletAddresses', hex or bech32): the bytes are compared, not the text.
 * False for an address that cannot be read; an entry of `addresses` that cannot be read is
 * skipped.
 */
export const ownsAddress = async (addresses, address) => {
  const bytes = await asHex(address);
  if (!bytes) {
    return false;
  }
  for (const own of addresses) {
    const ownBytes = await asHex(own);
    if (ownBytes && ownBytes.toLowerCase() === bytes.toLowerCase()) {
      return true;
    }
  }
  return false;
};

/** The sign page a phone wallet's own browser opens for a sign code. */
export const signPageUrl = (code, origin = globalThis.location.origin) =>
  `${origin}/sign/?code=${encodeURIComponent(code)}`;
