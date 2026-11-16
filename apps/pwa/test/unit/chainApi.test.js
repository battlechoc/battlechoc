// The game's client of the chain routes (plan D, node --test): which route each call takes, with
// or without the player's token, answers passed on untouched, the API's error codes with their
// details, a server that cannot be reached told apart from them, and the switch that decides
// whether the game shows minting at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import shared from "@battlechoc/battlechoc-shared-functions";
import { createClient, isCancel } from "../../src/helper/http.js";
import {
  ChainApiError,
  ChainUnreachableError,
  createChainApi,
  createSignApi,
} from "../../src/api/chainClient.js";
import {
  createChainEnabled,
  createFeatures,
} from "../../src/cardano/features.js";

// spread into the package's exports, so not importable by name in node
const { NoHealthyInternetConnectionError } = shared;
const BASE = "https://api.example";

// a fetch that records its calls and answers with `respond(url, init)`
const fakeFetch = (respond) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({
      url,
      method: init.method,
      authorization: init.headers.Authorization,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return respond(url, init);
  };
  return { fetch, calls };
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// the API as the game wires it (src/api/chain.js): `open` without a token, `request` as
// api/client.js's (method, url, body or signal) with the player's token
const apiOver = (respond, { token = "t0ken" } = {}) => {
  const { fetch, calls } = fakeFetch(respond);
  const open = createClient({ baseURL: BASE, fetch });
  const request = async (method, url, body) => {
    if (token === null) {
      throw new NoHealthyInternetConnectionError();
    }
    const headers = { Authorization: `Bearer ${token}` };
    if (method === "post") {
      return open.post(url, body, { headers });
    }
    if (method === "delete") {
      return open.delete(url, { headers, data: body });
    }
    return open.get(url, { headers, signal: body });
  };
  return { api: createChainApi({ open, request }), calls };
};

const READINESS = {
  enabled: true,
  ready: true,
  matches: { have: 10, need: 10 },
  mintsLeftToday: 3,
  wallets: [
    {
      subject: "stake:ab",
      address: "stake_test1u…",
      name: "eternl",
      lovelace: null,
      enough: null,
      missing: null,
      needed: null,
      collateral: null,
      waitUntil: null,
    },
  ],
  estimate: { networkFee: "600000", deposit: "3200000", needed: null },
  gameFees: [],
  paused: false,
  operation: null,
};

test("readiness asks with the player's token, for an item when there is one, and passes the answer on untouched", async () => {
  const { api, calls } = apiOver(() => json(READINESS));
  assert.deepEqual(await api.readiness(), READINESS);
  assert.deepEqual(await api.readiness("DARK_WALLS-1 x"), READINESS);
  assert.deepEqual(
    calls.map(({ url, method, authorization }) => [url, method, authorization]),
    [
      [`${BASE}/chain/readiness`, "GET", "Bearer t0ken"],
      [
        `${BASE}/chain/readiness?itemId=DARK_WALLS-1%20x`,
        "GET",
        "Bearer t0ken",
      ],
    ]
  );
});

test("mint sends the item, the wallet and the fee option, and the wallet's addresses only when given", async () => {
  const prepared = {
    operation: { id: "op-1", state: "prepared" },
    tx: "84ab",
    signCode: "SfQzUoVazDOtPs2qxal6sA",
    costs: { networkFee: 413229, gameFee: null, deposit: 3659190 },
  };
  const { api, calls } = apiOver(() => json(prepared, 201));
  assert.deepEqual(
    await api.mint({ itemId: "i1", subject: "stake:ab", fee: 0 }),
    prepared
  );
  await api.mint({
    itemId: "i1",
    subject: "stake:ab",
    fee: 1,
    addresses: ["01aa", "01bb"],
  });
  assert.deepEqual(calls[0], {
    url: `${BASE}/chain/mint`,
    method: "POST",
    authorization: "Bearer t0ken",
    body: { itemId: "i1", subject: "stake:ab", fee: 0 },
  });
  assert.deepEqual(calls[1].body, {
    itemId: "i1",
    subject: "stake:ab",
    fee: 1,
    addresses: ["01aa", "01bb"],
  });
});

test("burn sends the item and the wallet, and the wallet's addresses only when given; a refusal keeps its holder", async () => {
  const prepared = {
    operation: { id: "op-2", kind: "burn", state: "prepared" },
    tx: "84ab",
    signCode: "SfQzUoVazDOtPs2qxal6sA",
    costs: {
      networkFee: 368106,
      gameFee: null,
      deposit: 3710910,
      deposits: { reference: 2448080, user: 1262830 },
    },
    returns: { MILK: 2, VANILLA: 2, GOLDLEAF: 1 },
  };
  const { api, calls } = apiOver((url, init) =>
    JSON.parse(init.body).subject === "stake:cd"
      ? json({ error: "NOT YOUR WALLET", holder: "stake:ab" }, 400)
      : json(prepared, 201)
  );
  assert.deepEqual(
    await api.burn({ itemId: "i1", subject: "stake:ab" }),
    prepared
  );
  await api.burn({ itemId: "i1", subject: "stake:ab", addresses: ["01aa"] });
  assert.deepEqual(calls[0], {
    url: `${BASE}/chain/burn`,
    method: "POST",
    authorization: "Bearer t0ken",
    body: { itemId: "i1", subject: "stake:ab" },
  });
  assert.deepEqual(calls[1].body, {
    itemId: "i1",
    subject: "stake:ab",
    addresses: ["01aa"],
  });
  await assert.rejects(
    api.burn({ itemId: "i1", subject: "stake:cd" }),
    (failure) =>
      failure instanceof ChainApiError &&
      failure.code === "NOT YOUR WALLET" &&
      failure.status === 400 &&
      failure.holder === "stake:ab"
  );
});

test("an operation is read and cancelled with the player's token", async () => {
  const view = { id: "op/1", state: "cancelled", error: "cancelled" };
  const { api, calls } = apiOver(() => json(view));
  assert.deepEqual(await api.operation("op/1"), view);
  assert.deepEqual(await api.cancel("op/1"), view);
  assert.deepEqual(
    calls.map(({ url, method, authorization }) => [url, method, authorization]),
    [
      [`${BASE}/chain/operations/op%2F1`, "GET", "Bearer t0ken"],
      [`${BASE}/chain/operations/op%2F1`, "DELETE", "Bearer t0ken"],
    ]
  );
});

test("the sign routes go without a token: the code stands for the operation", async () => {
  const info = { kind: "mint", tx: "84ab", address: "addr_test1q…" };
  const signed = { state: "submitted", operation: { id: "op-1" } };
  const { fetch, calls } = fakeFetch((url, init) => {
    if (init.method === "POST" && url.endsWith("/code1")) {
      return json(signed);
    }
    if (url.endsWith("/addresses") && !JSON.parse(init.body).proof) {
      return json({ payload: "6261" });
    }
    return json(info);
  });
  const signApi = createSignApi(createClient({ baseURL: BASE, fetch }));
  assert.deepEqual(await signApi.signInfo("code1"), info);
  assert.deepEqual(await signApi.sign("code1", "a100"), signed);
  assert.equal(await signApi.signAddressesPayload("code1", ["01aa"]), "6261");
  const proof = { signature: "84aa", key: "a5bb" };
  assert.deepEqual(await signApi.signAddresses("code1", ["01aa"], proof), info);
  assert.deepEqual(calls, [
    {
      url: `${BASE}/chain/sign/code1`,
      method: "GET",
      authorization: undefined,
      body: undefined,
    },
    {
      url: `${BASE}/chain/sign/code1`,
      method: "POST",
      authorization: undefined,
      body: { witness: "a100" },
    },
    {
      url: `${BASE}/chain/sign/code1/addresses`,
      method: "POST",
      authorization: undefined,
      body: { addresses: ["01aa"] },
    },
    {
      url: `${BASE}/chain/sign/code1/addresses`,
      method: "POST",
      authorization: undefined,
      body: { addresses: ["01aa"], proof },
    },
  ]);
  // a wrong proof: the API's code, like every other
  const refusing = createSignApi(
    createClient({
      baseURL: BASE,
      fetch: fakeFetch(() => json({ error: "INVALID SIGNATURE" }, 400)).fetch,
    })
  );
  await assert.rejects(
    refusing.signAddresses("code1", ["01aa"], proof),
    (error) =>
      error instanceof ChainApiError &&
      error.code === "INVALID SIGNATURE" &&
      error.status === 400
  );
  // an answer without the text to sign is not the API's (with the status it came with)
  const odd = createSignApi(
    createClient({
      baseURL: BASE,
      fetch: fakeFetch(() => json({ payload: 7 })).fetch,
    })
  );
  await assert.rejects(
    odd.signAddressesPayload("code1", ["01aa"]),
    (error) =>
      error instanceof ChainUnreachableError &&
      error.reason === "not-json" &&
      error.status === 200 &&
      error.response.data.payload === 7
  );
  // the game's chainApi carries the same sign calls, also without a token
  const game = apiOver(() => json(info));
  await game.api.signInfo("code1");
  assert.equal(typeof game.api.signAddressesPayload, "function");
  assert.equal(typeof game.api.signAddresses, "function");
  assert.equal(game.calls[0].authorization, undefined);
});

test("an error answer of the API is its code with the details beside it", async () => {
  const { api } = apiOver(() =>
    json(
      { error: "NOT ENOUGH ADA", missing: "1234567", needed: "9210000" },
      400
    )
  );
  await assert.rejects(
    api.mint({ itemId: "i1", subject: "stake:ab", fee: 0 }),
    (error) =>
      error instanceof ChainApiError &&
      error.code === "NOT ENOUGH ADA" &&
      error.status === 400 &&
      error.missing === "1234567" &&
      error.needed === "9210000" &&
      error.retryable === false &&
      error.response.status === 400 &&
      error.response.data.error === "NOT ENOUGH ADA" &&
      error.message === "400 NOT ENOUGH ADA"
  );
  // the server's 503s carry their code: the game names a pause
  const paused = apiOver(() => json({ error: "CHAIN PAUSED" }, 503)).api;
  await assert.rejects(
    paused.mint({ itemId: "i1", subject: "stake:ab", fee: 0 }),
    (error) =>
      error instanceof ChainApiError &&
      error.code === "CHAIN PAUSED" &&
      error.status === 503 &&
      error.retryable === true
  );
  // details never overwrite what the error is
  const odd = apiOver(() =>
    json({ error: "UNKNOWN SIGN CODE", code: "x", status: 1, name: "y" }, 404)
  ).api;
  await assert.rejects(
    odd.signInfo("c"),
    (error) =>
      error instanceof ChainApiError &&
      error.code === "UNKNOWN SIGN CODE" &&
      error.status === 404 &&
      error.name === "ChainApiError" &&
      error.details.code === "x"
  );
});

test("no answer, a server error, a limit or an answer that is no JSON: the server cannot be reached, not an API code", async () => {
  const cases = [
    [
      () => {
        throw new TypeError("Failed to fetch");
      },
      { reason: "network", status: undefined },
    ],
    [
      () => new Response("<html>Bad Gateway</html>", { status: 502 }),
      { reason: "server", status: 502 },
    ],
    [
      () => new Response("slow down", { status: 429 }),
      { reason: "busy", status: 429 },
    ],
    [
      () => new Response("<html>Sign in to the Wi-Fi</html>", { status: 200 }),
      { reason: "not-json", status: 200 },
    ],
    [
      () => new Response("<html>Not here</html>", { status: 404 }),
      { reason: "not-json", status: 404 },
    ],
  ];
  for (const [respond, expected] of cases) {
    const { api } = apiOver(respond);
    for (const call of [() => api.readiness(), () => api.signInfo("c")]) {
      await assert.rejects(
        call(),
        (error) =>
          error instanceof ChainUnreachableError &&
          !(error instanceof ChainApiError) &&
          error.code === undefined &&
          error.reason === expected.reason &&
          error.status === expected.status &&
          error.retryable === (expected.reason !== "not-json"),
        expected.reason
      );
    }
  }
  // without a token (no connection when the game started): no network either
  const { api } = apiOver(() => json(READINESS), { token: null });
  await assert.rejects(
    api.readiness(),
    (error) =>
      error instanceof ChainUnreachableError &&
      error.reason === "network" &&
      error.cause instanceof NoHealthyInternetConnectionError
  );
});

test("a request the caller aborted stays an abort", async () => {
  const { api } = apiOver(() => json(READINESS));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    api.readiness(undefined, { signal: controller.signal }),
    (error) => isCancel(error)
  );
  await assert.rejects(
    api.operation("op-1", { signal: controller.signal }),
    (error) => isCancel(error)
  );
});

test("showMinting: the marks are on and the server said enabled", () => {
  const on = createFeatures({ network: "preprod" });
  assert.equal(on.showMinting({ serverEnabled: true }), true);
  assert.equal(on.showMinting({ serverEnabled: false }), false);
  assert.equal(on.showMinting({ serverEnabled: "yes" }), false);
  assert.equal(on.showMinting({}), false);
  assert.equal(
    createFeatures({ network: "preprod", androidApp: true }).showMinting({
      serverEnabled: true,
    }),
    false
  );
  assert.equal(
    createFeatures({ network: undefined }).showMinting({
      serverEnabled: true,
    }),
    false
  );
});

// the switch over a status route that answers `answers` in turn (an Error is thrown); each answer
// waits for `gate` when one is given, so a request can be held in flight
const switchOver = (answers, { features, online = () => true } = {}) => {
  let asked = 0;
  let release;
  let gate;
  const status = async () => {
    const answer = answers[Math.min(asked, answers.length - 1)];
    asked += 1;
    if (gate) {
      await gate;
    }
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  };
  const chainEnabled = createChainEnabled({
    status,
    features: features || createFeatures({ network: "preprod" }),
    online,
  });
  return {
    chainEnabled,
    asked: () => asked,
    hold: () => {
      gate = new Promise((resolve) => {
        release = resolve;
      });
    },
    release: () => {
      gate = undefined;
      release();
    },
  };
};

test("status asks GET /chain/status without a token and passes the answer on", async () => {
  const { api, calls } = apiOver(() => json({ enabled: true }));
  assert.deepEqual(await api.status(), { enabled: true });
  assert.deepEqual(
    calls.map(({ url, method, authorization }) => [url, method, authorization]),
    [[`${BASE}/chain/status`, "GET", undefined]]
  );
  // an API without the route: its code, which the switch takes as off
  const old = apiOver(() => json({ error: "NOT FOUND" }, 404)).api;
  await assert.rejects(
    old.status(),
    (error) => error instanceof ChainApiError && error.status === 404
  );
});

test("the server's switch is asked once per session and remembered", async () => {
  const { chainEnabled, asked } = switchOver([{ enabled: true }]);
  let changes = 0;
  const unsubscribe = chainEnabled.subscribe(() => {
    changes += 1;
  });
  assert.equal(chainEnabled.serverEnabled(), false);
  const [first, second] = await Promise.all([
    chainEnabled.ask(),
    chainEnabled.ask(),
  ]);
  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(await chainEnabled.ask(), true);
  assert.equal(chainEnabled.serverEnabled(), true);
  assert.equal(asked(), 1);
  assert.equal(changes, 1);
  unsubscribe();

  const off = switchOver([{ enabled: false }]);
  assert.equal(await off.chainEnabled.ask(), false);
  assert.equal(await off.chainEnabled.ask(), false);
  assert.equal(off.asked(), 1);

  // an answer that is not the status route's
  const odd = switchOver([{ enabled: "true" }]);
  assert.equal(await odd.chainEnabled.ask(), false);
});

test("only a definite answer of the switch is remembered: a 404 is off for good, any other failure asks again on the next ask, once", async () => {
  // an API without the route
  const old = switchOver([
    new ChainApiError("NOT FOUND", { status: 404 }),
    { enabled: true },
  ]);
  assert.equal(await old.chainEnabled.ask(), false);
  assert.equal(await old.chainEnabled.ask(), false);
  assert.equal(old.chainEnabled.serverEnabled(), false);
  assert.equal(old.asked(), 1);
  // no answer, a timeout, a deploy's 5xx or 429, a bug: off for now, unknown, asked again
  for (const failure of [
    new ChainUnreachableError("network", {
      cause: new TypeError("Failed to fetch"),
    }),
    new ChainUnreachableError("busy", { status: 429 }),
    new ChainUnreachableError("server", { status: 502 }),
    new ChainApiError("CHAIN UNAVAILABLE", { status: 503 }),
    new ChainApiError("TOO MANY REQUESTS", { status: 429 }),
    new TypeError("a bug"),
  ]) {
    const { chainEnabled, asked } = switchOver([failure, { enabled: true }]);
    let changes = 0;
    chainEnabled.subscribe(() => {
      changes += 1;
    });
    assert.equal(await chainEnabled.ask(), false, failure.message);
    assert.equal(chainEnabled.serverEnabled(), false);
    assert.equal(asked(), 1, failure.message);
    assert.equal(changes, 0, failure.message);
    // the next mount asks again, and that answer is remembered
    assert.equal(await chainEnabled.ask(), true, failure.message);
    assert.equal(await chainEnabled.ask(), true);
    assert.equal(asked(), 2, failure.message);
    assert.equal(changes, 1);
  }
  // asks at the same time share the one request, also after a failure
  const { chainEnabled, asked, hold, release } = switchOver([
    new ChainUnreachableError("network"),
    { enabled: false },
  ]);
  assert.equal(await chainEnabled.ask(), false);
  hold();
  const both = [chainEnabled.ask(), chainEnabled.ask()];
  release();
  assert.deepEqual(await Promise.all(both), [false, false]);
  assert.equal(asked(), 2);
  assert.equal(await chainEnabled.ask(), false);
  assert.equal(asked(), 2);
});

test("retry (the device is back online) sends one request per call, none while one is in flight or once the answer was on", async () => {
  const unreachable = new ChainUnreachableError("network");
  const { chainEnabled, asked, hold, release } = switchOver([
    unreachable,
    unreachable,
    { enabled: true },
  ]);
  assert.equal(await chainEnabled.ask(), false);
  assert.equal(asked(), 1);
  // one more request per retry
  assert.equal(await chainEnabled.retry(), false);
  assert.equal(asked(), 2);
  // while that request is out, neither retry nor ask sends another
  hold();
  const pending = chainEnabled.retry();
  const again = chainEnabled.retry();
  const asking = chainEnabled.ask();
  assert.equal(asked(), 3);
  release();
  assert.deepEqual(await Promise.all([pending, again, asking]), [
    true,
    true,
    true,
  ]);
  assert.equal(asked(), 3);
  assert.equal(chainEnabled.serverEnabled(), true);
  // on: retry sends nothing any more
  assert.equal(await chainEnabled.retry(), true);
  assert.equal(await chainEnabled.ask(), true);
  assert.equal(asked(), 3);

  // retry before anything was asked is the first request
  const fresh = switchOver([{ enabled: true }]);
  assert.equal(await fresh.chainEnabled.retry(), true);
  assert.equal(fresh.asked(), 1);

  // a server that said off is asked again on retry (it may have been switched on)
  const off = switchOver([{ enabled: false }, { enabled: true }]);
  assert.equal(await off.chainEnabled.ask(), false);
  assert.equal(await off.chainEnabled.retry(), true);
  assert.equal(off.asked(), 2);
});

test("the server's switch is not asked without the marks (no network, the Android app) or offline, neither by ask nor by retry", async () => {
  for (const features of [
    createFeatures({ network: undefined }),
    createFeatures({ network: "preprod", androidApp: true }),
  ]) {
    const { chainEnabled, asked } = switchOver([{ enabled: true }], {
      features,
    });
    assert.equal(await chainEnabled.ask(), false);
    assert.equal(await chainEnabled.retry(), false);
    assert.equal(asked(), 0);
  }
  let online = false;
  const { chainEnabled, asked } = switchOver([{ enabled: true }], {
    online: () => online,
  });
  assert.equal(await chainEnabled.ask(), false);
  assert.equal(await chainEnabled.retry(), false);
  assert.equal(asked(), 0);
  online = true;
  assert.equal(await chainEnabled.ask(), true);
  assert.equal(asked(), 1);
});
