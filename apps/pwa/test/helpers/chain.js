import { expect } from "@playwright/test";
import { api } from "./players.js";

// The chain of the local API (minting plans C, D and E): the API of playwright.config.js reads a
// chain double, and these call its test routes (apps/api/test/e2eServer.js, /test/chain/*). Each
// route that changes the chain runs the server's ownership sync before it answers, so the game
// sees the change on its next request. A route that refuses (a typo: 400, an unknown player or
// token: 404) fails the test right here, with the server's answer.

const post = async (request, route, data) => {
  const answer = await request.post(`${api}/test/chain/${route}`, { data });
  expect(
    answer.ok(),
    `POST /test/chain/${route}: ${answer.status()} ${await answer.text()}`
  ).toBe(true);
  return answer.status() === 204 ? undefined : answer.json();
};

// `count` blocks (1 to 100): the tip after them ({ blockNo, slot, hash, time })
export const chainBlocks = async (request, count = 1) =>
  (await post(request, "blocks", { count })).tip;

// takes the last `count` blocks away; their transactions go back to the mempool unless
// `{ drop: true }`: the tip after it
export const chainRollback = async (request, count, { drop = false } = {}) =>
  (await post(request, "rollback", { count, drop })).tip;

// marks the player's item minted and mints its token to `to` (a bech32 address or "stranger"),
// then one block: the token's asset name
export const chainMinted = async (request, { username, itemId, to }) =>
  (await post(request, "minted", { username, itemId, to })).assetName;

// moves the token to `to` (a bech32 address or "stranger": a fresh address nobody has); it lands
// with the next block: the transaction's hash
export const chainMove = async (request, { assetName, to }) =>
  (await post(request, "move", { assetName, to })).txHash;

// burns the token's pair where it is held, with the next block: the transaction's hash
export const chainBurn = async (request, { assetName }) =>
  (await post(request, "burn", { assetName })).txHash;

// sends `lovelace` to `address`, with the next block: the transaction's hash
export const chainFund = async (request, { address, lovelace }) =>
  (await post(request, "fund", { address, lovelace })).txHash;

// while `on`, blocks take no waiting transaction
export const chainHold = (request, on) => post(request, "hold", { on });

// faults until the next call: `provider` "unavailable" or "busy", `index` "unavailable" or
// "stale"; chainFail(request) clears both
export const chainFail = (request, { provider = null, index = null } = {}) =>
  post(request, "fail", { provider, index });

// { tip, mempool }: the tip and the hashes of the waiting transactions
export const chainState = async (request) => {
  const answer = await request.get(`${api}/test/chain`);
  expect(answer.ok(), `GET /test/chain: ${answer.status()}`).toBe(true);
  return answer.json();
};
