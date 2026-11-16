// The chain routes of the battlechoc API (plan D, apps/api/src/routes/chain.js) as calls, with
// their errors. No module state and no build settings here: src/api/chain.js wires the game's
// instance (with the player's token), and the sign page (/sign/) builds its own over the sign
// routes, which need no token, so it gets neither the game's account nor its storage.
//
// Every failure is one of three:
// - ChainApiError: the API answered with its code ({ error: "<CODE>", …details }): `code` is
//   that string, the details are properties beside it (NOT ENOUGH ADA: `missing`, `needed`);
// - ChainUnreachableError: no answer (`reason` "network"), a server error or a limit without a
//   code ("server": 5xx, "busy": 429), an answer that is not the API's ("not-json": a portal's
//   page, a proxy's);
// - an abort the caller asked for (helper/http.js isCancel), passed on as it is.
// Both errors keep `status` and `response` (helper/http.js's: `response.status`, `.data`), and
// say with `retryable` whether asking again may help (no answer, a 5xx, a 429).
import { isCancel } from "../helper/http.js";

const retryableStatus = (status) =>
  typeof status !== "number" || status >= 500 || status === 429;

// the error's own fields, which no detail of an answer may overwrite
const OWN = new Set([
  "name",
  "message",
  "stack",
  "cause",
  "code",
  "status",
  "response",
  "retryable",
  "details",
]);

/** The API answered with an error code (`code`), its details beside it (and in `details`). */
export class ChainApiError extends Error {
  constructor(code, { status, details = {}, response, cause } = {}) {
    super(
      `${status} ${code}`,
      typeof cause === "undefined" ? undefined : { cause }
    );
    this.name = "ChainApiError";
    this.code = code;
    this.status = status;
    this.retryable = retryableStatus(status);
    this.details = details;
    this.response = response;
    for (const [key, value] of Object.entries(details)) {
      if (!OWN.has(key)) {
        this[key] = value;
      }
    }
  }
}

/**
 * The API could not be reached: `reason` "network" (no answer), "server" (a 5xx without a code),
 * "busy" (a 429 without a code) or "not-json" (an answer that is not the API's); `status` when
 * something answered.
 */
export class ChainUnreachableError extends Error {
  constructor(reason, { status, response, cause } = {}) {
    super(
      typeof status === "number"
        ? `the server cannot be reached (${reason}, ${status})`
        : `the server cannot be reached (${reason})`,
      typeof cause === "undefined" ? undefined : { cause }
    );
    this.name = "ChainUnreachableError";
    this.reason = reason;
    this.status = status;
    this.retryable = reason !== "not-json";
    this.response = response;
  }
}

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// what a failed request (helper/http.js's error, api/client.js's) is for the caller
const failureOf = (failure) => {
  if (
    failure instanceof ChainApiError ||
    failure instanceof ChainUnreachableError ||
    isCancel(failure)
  ) {
    return failure;
  }
  // no answer; also api/client.js's NoHealthyInternetConnectionError without a token (the game
  // could not reach the server when it started)
  const response = failure && failure.response;
  if (!response) {
    return new ChainUnreachableError("network", { cause: failure });
  }
  const { status, data } = response;
  if (isObject(data) && typeof data.error === "string") {
    const { error: code, ...details } = data;
    return new ChainApiError(code, {
      status,
      details,
      response,
      cause: failure,
    });
  }
  const reason =
    status >= 500 ? "server" : status === 429 ? "busy" : "not-json";
  return new ChainUnreachableError(reason, {
    status,
    response,
    cause: failure,
  });
};

// the answer of `call()` (a { data, status } promise), or its failure as above; every chain
// route answers a JSON object
const answerOf = async (call) => {
  let response;
  try {
    response = await call();
  } catch (failure) {
    throw failureOf(failure);
  }
  if (!isObject(response.data)) {
    throw new ChainUnreachableError("not-json", {
      status: response.status,
      response,
    });
  }
  return response;
};

// the answer's body of `call()`
const bodyOf = async (call) => (await answerOf(call)).data;

const signPath = (code) => `/chain/sign/${encodeURIComponent(code)}`;

/**
 * The sign routes over `open` (a helper/http.js client of the API, no token: the sign code stands
 * for the operation; the game with an extension wallet and the sign page both use them).
 */
export const createSignApi = (open) => ({
  /**
   * What the code is to sign: { kind, item, tx (unsigned CBOR hex), network, costs, subject,
   * address (bech32: where the item goes), signUntil, ownerConfirmed (a wallet has vouched for
   * the address; until then `sign` answers 409 ADDRESSES NEEDED) }.
   */
  signInfo: (code) => bodyOf(() => open.get(signPath(code))),

  /** Sends the wallet's witness set (hex): { state: "submitted", operation }. */
  sign: (code, witness) => bodyOf(() => open.post(signPath(code), { witness })),

  /**
   * The text the wallet must sign (hex) to vouch for `addresses` (hex, signTx.js
   * walletAddresses) as its own; nothing changes on the server yet.
   */
  signAddressesPayload: async (code, addresses) => {
    const response = await answerOf(() =>
      open.post(`${signPath(code)}/addresses`, { addresses })
    );
    if (typeof response.data.payload !== "string") {
      throw new ChainUnreachableError("not-json", {
        status: response.status,
        response,
      });
    }
    return response.data.payload;
  },

  /**
   * Has the server build the operation again from the wallet's `addresses`, which `proof`
   * ({ signature, key }: the wallet's signData of signAddressesPayload's text) vouches for:
   * answers as signInfo, with a new `tx`, `address`, `costs` and `ownerConfirmed: true`.
   */
  signAddresses: (code, addresses, proof) =>
    bodyOf(() =>
      open.post(`${signPath(code)}/addresses`, { addresses, proof })
    ),
});

/**
 * The game's chain calls: `request` is api/client.js's (method, url, body or a GET's signal; with
 * the player's token), `open` a client without a token for the status and the sign routes. Answers are passed
 * on untouched.
 */
export const createChainApi = ({ open, request }) => ({
  /**
   * Whether the server has the chain features on: { enabled } (no token; the server answers it
   * without asking the chain).
   */
  status: () => bodyOf(() => open.get("/chain/status")),

  /**
   * What the player needs before minting (`itemId`: the item's tier counts in the fee), or
   * { enabled: false } with the chain features off.
   */
  readiness: (itemId, { signal } = {}) =>
    bodyOf(() =>
      request(
        "get",
        typeof itemId === "string" && itemId !== ""
          ? `/chain/readiness?itemId=${encodeURIComponent(itemId)}`
          : "/chain/readiness",
        signal
      )
    ),

  /**
   * Prepares a mint: { operation, tx, signCode, costs }. `fee`: the fee option's index
   * (readiness's gameFees[].fee); `addresses`: the wallet's own (walletAddresses), sent when given.
   */
  mint: ({ itemId, subject, fee, addresses }) =>
    bodyOf(() =>
      request(
        "post",
        "/chain/mint",
        typeof addresses === "undefined"
          ? { itemId, subject, fee }
          : { itemId, subject, fee, addresses }
      )
    ),

  /**
   * Prepares the burn of a minted item (plan E, its salvage): { operation, tx, signCode, costs,
   * returns }. `subject`: the wallet that holds the item; `addresses`: the wallet's own
   * (walletAddresses), sent when given. A refusal NOT YOUR WALLET names the holder (`holder`)
   * when the item is in another of the player's wallets.
   */
  burn: ({ itemId, subject, addresses }) =>
    bodyOf(() =>
      request(
        "post",
        "/chain/burn",
        typeof addresses === "undefined"
          ? { itemId, subject }
          : { itemId, subject, addresses }
      )
    ),

  /** The player's operation as it stands: an OperationView. */
  operation: (id, { signal } = {}) =>
    bodyOf(() =>
      request("get", `/chain/operations/${encodeURIComponent(id)}`, signal)
    ),

  /** Cancels a prepared operation: its OperationView, `cancelled`. */
  cancel: (id) =>
    bodyOf(() =>
      request("delete", `/chain/operations/${encodeURIComponent(id)}`)
    ),

  ...createSignApi(open),
});
