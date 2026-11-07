// The game's HTTP client (node --test): fetch with what the callers took from axios, i.e.
// `response.data`, `error.response.status` and `.data`, a timeout, and isCancel for a request the
// caller aborted (src/api/account.js, src/api/client.js, PlayerNameInput).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient, isCancel, HttpError } from "../../src/helper/http.js";

// a fetch that records its calls and answers with `respond(url, init)`
const fakeFetch = (respond) => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetch, calls };
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// a fetch that never answers and ends like the browser's when its signal aborts
const hangingFetch = (url, init) =>
  new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted.", "AbortError"))
    );
  });

test("get joins the base url, sends the headers and resolves to the parsed JSON", async () => {
  const { fetch, calls } = fakeFetch(() => json({ stats: { score: 12 } }));
  const client = createClient({ baseURL: "https://api.example/", fetch });
  const response = await client.get("/user", {
    headers: {
      Authorization: "Bearer token",
      "battlechoc-pwa-date": 1730000000000,
      "battlechoc-pwa-version": undefined,
    },
  });
  assert.deepEqual(response.data, { stats: { score: 12 } });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.example/user");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers.Authorization, "Bearer token");
  assert.equal(calls[0].init.headers["battlechoc-pwa-date"], 1730000000000);
  // a header without a value is left out, there is no body and so no content type
  assert.equal("battlechoc-pwa-version" in calls[0].init.headers, false);
  assert.equal("Content-Type" in calls[0].init.headers, false);
});

test("post sends its data as JSON; without data there is no body", async () => {
  const { fetch, calls } = fakeFetch(() => json({ ok: true }));
  const client = createClient({ baseURL: "https://api.example", fetch });
  await client.post("/accounts/token", { refreshToken: "abc" });
  await client.post("/user", undefined, { headers: { Authorization: "Bearer t" } });
  assert.equal(calls[0].url, "https://api.example/accounts/token");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.body, '{"refreshToken":"abc"}');
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[1].init.body, undefined);
  assert.equal("Content-Type" in calls[1].init.headers, false);
  assert.equal(calls[1].init.headers.Authorization, "Bearer t");
});

test("delete sends config.data as its body", async () => {
  const { fetch, calls } = fakeFetch(() => json({}));
  const client = createClient({ baseURL: "https://api.example", fetch });
  await client.delete("/push/subscription", { data: { endpoint: "x" } });
  assert.equal(calls[0].init.method, "DELETE");
  assert.equal(calls[0].init.body, '{"endpoint":"x"}');
});

test("a status outside 2xx rejects with the response on the error", async () => {
  const { fetch } = fakeFetch((url) =>
    url.endsWith("/lab/try")
      ? json({ error: "MISSING INGREDIENTS" }, 400)
      : new Response("Too Many Requests", { status: 429 })
  );
  const client = createClient({ baseURL: "https://api.example", fetch });
  await assert.rejects(client.post("/lab/try", {}), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.response.status, 400);
    assert.deepEqual(error.response.data, { error: "MISSING INGREDIENTS" });
    assert.equal(isCancel(error), false);
    return true;
  });
  await assert.rejects(client.get("/rank"), (error) => {
    assert.equal(error.response.status, 429);
    assert.equal(error.response.data, "Too Many Requests");
    return true;
  });
});

test("a body that is no JSON stays text, no body is the empty text", async () => {
  const { fetch } = fakeFetch((url) =>
    url.endsWith("/text") ? new Response("pong") : new Response(null, { status: 204 })
  );
  const client = createClient({ fetch });
  assert.equal((await client.get("/text")).data, "pong");
  const empty = await client.post("/empty");
  assert.equal(empty.data, "");
  assert.equal(empty.status, 204);
});

test("an absolute url is not joined to the base url", async () => {
  const { fetch, calls } = fakeFetch(() => json({}));
  const client = createClient({ baseURL: "https://api.example", fetch });
  await client.get("https://other.example/health");
  assert.equal(calls[0].url, "https://other.example/health");
});

test("no answer rejects without a response", async () => {
  const client = createClient({
    fetch: async () => {
      throw new TypeError("Failed to fetch");
    },
  });
  await assert.rejects(client.get("/user"), (error) => {
    assert.equal(error.response, undefined);
    assert.equal(error.code, "ERR_NETWORK");
    assert.equal(isCancel(error), false);
    return true;
  });
});

test("a request the caller aborts rejects as cancelled", async () => {
  const client = createClient({ fetch: hangingFetch });
  const controller = new AbortController();
  const pending = client.get("/check/available/Carolin", {
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(pending, (error) => {
    assert.equal(isCancel(error), true);
    assert.equal(error.response, undefined);
    return true;
  });
  // already aborted: fetch is not even asked
  await assert.rejects(
    client.get("/check/available/Carolin", { signal: controller.signal }),
    (error) => isCancel(error)
  );
});

test("the timeout ends a request that takes too long", async () => {
  const client = createClient({ fetch: hangingFetch, timeout: 20 });
  await assert.rejects(client.post("/accounts"), (error) => {
    assert.equal(error.code, "ECONNABORTED");
    assert.equal(error.response, undefined);
    assert.equal(isCancel(error), false);
    return true;
  });
});

test("isCancel is false for anything else", () => {
  assert.equal(isCancel(undefined), false);
  assert.equal(isCancel(new Error("x")), false);
});
