import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { api, labPlayer, ok, say } from "./players.js";
import { nodeKeys, signAs } from "./cardano.js";
import { fakeWallet, walletAddressesOf, walletSignTx } from "./wallet.js";
import { TIER_ITEMS, craftItem, equipItem } from "./lab.js";

const { chain: rules } = createRequire(import.meta.url)(
  "@battlechoc/battlechoc-shared-functions"
);

// The chain of the local API (minting plans C, D and E): the API of playwright.config.js reads a
// chain double with plan B's fixture deployment on it (the config with the preprod fee, the
// server key it lists), and these call its test routes (apps/api/test/e2eServer.js,
// /test/chain/* and /test/matches). Each route that changes the chain runs the server's watcher
// (the chain operations, then the ownership sync) before it answers, so the game sees the change
// on its next request. A route that refuses (a typo: 400, an unknown player or token: 404) fails
// the test right here, with the server's answer.
//
// The specs run one after the other against one API, one database and one double for the whole
// run (playwright.config.js workers: 1; these helpers depend on it: parallel workers would share
// the faults, the mempool and the config). `fail`, `hold`, waiting transactions and the config
// are global state of that double: every spec that touches the chain has
// `test.afterEach(({ request }) => chainReset(request))`, which puts all of them back.

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

// sends `lovelace` to `address` in one output, with the next block: the transaction's hash.
// `assets` ({ unit: quantity }): tokens of another policy in the same output (an output with
// tokens is no plain ADA: it cannot be the collateral)
export const chainFund = async (request, { address, lovelace, assets }) =>
  (
    await post(request, "fund", {
      address,
      lovelace,
      ...(assets ? { assets } : {}),
    })
  ).txHash;

// while `on`, blocks take no waiting transaction
export const chainHold = (request, on) => post(request, "hold", { on });

// faults until the next call: `provider` "unavailable" or "busy", `index` "unavailable" or
// "stale"; chainFail(request) clears both
export const chainFail = (request, { provider = null, index = null } = {}) =>
  post(request, "fail", { provider, index });

// { tip, mempool, kFinal }: the tip, the hashes of the waiting transactions, and the server's
// CHAIN_K_FINAL (the blocks on top of a mint's block that make it final)
export const chainState = async (request) => {
  const answer = await request.get(`${api}/test/chain`);
  expect(answer.ok(), `GET /test/chain: ${answer.status()}`).toBe(true);
  return answer.json();
};

// The chain as the next test should find it (the afterEach of every spec that touches the
// chain): the faults cleared, the mempool let go and emptied, the deployment's config back (read
// from the double, so also after a rollback; one block when it differed, none when not).
// Waiting transactions are dropped by default: specs run one after the other, and a
// transaction a test left waiting would otherwise land in the next spec's first block, which
// that spec did not ask for (a test that wants its own transaction to land produces the block
// itself). `{ keepMempool: true }` keeps them (refused with 400 CONFIG WAITING when a waiting
// transaction moves or makes the config NFT: it would land on top of the restored one).
// A transaction it drops is annotated on the test ("chain-reset dropped") and warned on the
// console with the test's title: a game transaction that never landed shows there.
// { dropped: [hashes], config: "kept" | "restored" }
export const chainReset = async (request, { keepMempool = false } = {}) => {
  const answer = await post(request, "reset", { keepMempool });
  if (answer.dropped.length > 0) {
    const description = `${answer.dropped.length} waiting transaction(s) dropped: ${answer.dropped.join(", ")}`;
    const info = test.info();
    info.annotations.push({ type: "chain-reset dropped", description });
    console.warn(`chainReset after "${info.title}": ${description}`);
  }
  return answer;
};

// where the token `unit` (policy id and name, hex) sits in the blocks (not the waiting
// transactions): [{ address (bech32), quantity }]
export const chainHolders = async (request, unit) => {
  const answer = await request.get(`${api}/test/chain/holders/${unit}`);
  expect(
    answer.ok(),
    `GET /test/chain/holders: ${answer.status()} ${await answer.text()}`
  ).toBe(true);
  return (await answer.json()).holders;
};

// the on-chain config replaced as an admin update does (in a block): `paused`, `fees` "preprod"
// (one ADA option: 1, 2 and 4 ADA by tier), "none" (no battlechoc fee) or "two" (that option and
// a second ADA option of 1.5, 3 and 6 ADA: a choice); chainConfig(request) puts the deployment's
// back. The server reads it on its next request: { paused, fees: [{ asset, amounts, receivers }] }
export const chainConfig = (
  request,
  { paused = false, fees = "preprod" } = {}
) => post(request, "config", { paused, fees });

// `count` verified matches more for `username`, each as the live lobby plays and credits a match
// against the server AI that the AI gives up at once (apps/api/test/helpers/chainDeployment.js,
// pinned against real wins): how many count now. For a labPlayer (whose four reported matches
// moved the AI ladder already) none of them is the prepared first game: each ends before it runs,
// so no awards, no XP, not rated, one ladder step each. A minting player so has 100 XP (the
// tutorial's), rating 1500 with 0 rated matches, 10 verified records, and 14 ladder games at step
// 6: "Start Game" joins the queue, and the server AI that comes after LIVE_AI_FALLBACK_MS (3 s
// in playwright.config.js) when nobody else waits is Gustav Ganache, handicap 2, on 10×10
// (mintApi.spec.js checks the queue).
export const verifiedMatches = async (request, username, count) => {
  const answer = await request.post(`${api}/test/matches`, {
    data: { username, count },
  });
  expect(
    answer.ok(),
    `POST /test/matches: ${answer.status()} ${await answer.text()}`
  ).toBe(true);
  return (await answer.json()).matches;
};

// the wallet door of the game links the page's fakeWallet `key` to the player, as a player does
// it (the profile, "I already have an account", "Use a Cardano wallet", the wallet), in the
// game's `language` (the context's): the server learns the wallet's name
export const linkThroughDoor = async (
  page,
  { name = "Eternl", language = "en" } = {}
) => {
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("[data-icon=user]:visible").first().click();
  await page
    .getByRole("button", { name: say(language, "HAVE_ACCOUNT") })
    .click();
  await page
    .getByRole("button", { name: say(language, "WALLET_DOOR") })
    .click();
  await page
    .getByTestId("wallet-door")
    .getByText(name, { exact: false })
    .first()
    .click();
  await expect(page.getByText(say(language, "WALLET_LINKED"))).toBeVisible({
    timeout: 15000,
  });
};

// what funds a wallet gets (mintingPlayer's `funds`): plain ADA in one output, the same ADA only
// beside a token, or too little for any mint
const FUNDS = ["ada", "tokens", "short", "none"];
const SHORT_LOVELACE = 2_000_000;
// a token of a policy that is not the game's, for funds that sit only with tokens
export const OTHER_TOKEN =
  "d5".repeat(28) + Buffer.from("CHOC", "utf8").toString("hex");

/**
 * A player who can mint (minting plan D): labPlayer's (the tutorial finished, four matches, the
 * Choclab open, its intro seen) with MINT_MIN_ONLINE_MATCHES verified matches more, a crafted item
 * (`item`, or the item of `tier` in TIER_ITEMS; default RARE: the heavy rum barrel), equipped in
 * slot 0 of its building with `equip`, and a fakeWallet (`wallet`: its options, or false for none
 * in the browser: a phone whose wallet is an app; `keys`: its nodeKeys, default new ones)
 * injected into the player's context, linked to the player `link`:
 * "api" (default; as the game links a wallet, with the wallet's name "eternl"), "door" (through
 * the game's wallet door, as a player does it) or false (not linked), and its base address
 * funded on the double with one block (`funds`): "ada"
 * (default: `lovelace` in one plain output), "tokens" (the same lovelace only beside a token of
 * another policy, OTHER_TOKEN), "short" (2 ADA, too little for any mint), "none". `matches`: how
 * many verified matches (default the gate's: then "Start Game" joins the queue, see
 * verifiedMatches). `device`: options of the browser context; `language`: the game's language
 * ("de", …; the context's locale, and the door's labels). The page ends loaded anew at "/"
 * (the title screen), with the wallet in window.cardano.
 *
 * { context, page, username, accessToken, headers, keys, wallet (fakeWallet's answer, null without one), item (the
 * crafted item: { id, item, serial, … }), subject, addresses ([the base address as hex]: what the
 * wallet names as its own), funding (the hash of the funding transaction: its output 0 is the
 * wallet's one UTxO; null for "none") }.
 */
export const mintingPlayer = async (
  browser,
  request,
  name,
  {
    tier = "RARE",
    item = TIER_ITEMS[tier],
    equip = false,
    link = "api",
    keys = nodeKeys(),
    wallet: walletOptions = {},
    funds = "ada",
    lovelace = 20_000_000,
    matches = rules.MINT_MIN_ONLINE_MATCHES,
    device = {},
    language = null,
  } = {}
) => {
  if (
    !FUNDS.includes(funds) ||
    ![false, "api", "door"].includes(link) ||
    (walletOptions === false && link === "door")
  ) {
    throw new TypeError(
      "mintingPlayer: funds ada | tokens | short | none, link api | door | false, no door without a wallet"
    );
  }
  const player = await labPlayer(browser, request, name, { device, language });
  const wallet =
    walletOptions === false
      ? null
      : await fakeWallet(player.context, keys, walletOptions);
  if (matches > 0) {
    await verifiedMatches(request, player.username, matches);
  }
  const crafted = await craftItem(request, player, item);
  if (equip) {
    await equipItem(request, player, crafted);
  }
  if (link === "api") {
    expect(
      (
        await signAs(
          request,
          player.accessToken,
          keys,
          "link",
          {},
          { wallet: "eternl" }
        )
      ).status()
    ).toBe(200);
  } else if (link === "door") {
    await linkThroughDoor(player.page, { language: language || "en" });
  }
  let funding = null;
  if (funds !== "none") {
    funding = await chainFund(request, {
      address: keys.baseAddress,
      lovelace: funds === "short" ? SHORT_LOVELACE : lovelace,
      ...(funds === "tokens" ? { assets: { [OTHER_TOKEN]: 100 } } : {}),
    });
    await chainBlocks(request, 1);
  }
  // the page loaded anew: with the wallet injected, and the server's state (item, link, funds)
  await player.page.goto("/", { waitUntil: "networkidle" });
  return {
    ...player,
    keys,
    wallet,
    item: crafted,
    subject: keys.subject,
    addresses: [keys.baseAddressHex],
    funding,
  };
};

// ---------------------------------------------------------------------------------------------
// A mint through the API, as the game's minting flow runs it (the dialog's own tests drive it
// through the game instead)

// GET /chain/readiness for `player`'s item `itemId` (or none): the answer
export const readiness = async (request, { headers }, itemId) =>
  ok(
    await request.get(
      `${api}/chain/readiness${itemId ? `?itemId=${encodeURIComponent(itemId)}` : ""}`,
      { headers }
    )
  );

// POST /chain/mint under `player`'s session: the answer as it came (201 { operation, tx,
// signCode, costs }, or the refusal); `addresses` the wallet's own (hex), `fee` the option's
// index (0: the first; also with no options)
export const prepareMint = (
  request,
  { headers, subject },
  { itemId, fee = 0, addresses, ...rest }
) =>
  request.post(`${api}/chain/mint`, {
    headers,
    data: {
      itemId,
      subject,
      fee,
      ...(addresses ? { addresses } : {}),
      ...rest,
    },
  });

// POST /chain/sign/:code with the wallet's witness set (no session): the answer as it came
export const submitWitness = (request, signCode, witness) =>
  request.post(`${api}/chain/sign/${encodeURIComponent(signCode)}`, {
    data: { witness },
  });

// GET /chain/operations/:id under `player`'s session: the operation's view
export const operationOf = async (request, { headers }, id) =>
  ok(await request.get(`${api}/chain/operations/${id}`, { headers }));

/**
 * One whole mint of `item` ({ id }) for `player` (mintingPlayer's) through the API, as the game's
 * extension path runs it: the wallet's addresses read in `page`, POST /chain/mint with them, the
 * page's wallet signs, POST /chain/sign/:code, one block: the operation is `included` (still open:
 * the player's next mint is refused with 409 OPERATION RUNNING). With `{ final: true }` the
 * server's CHAIN_K_FINAL blocks more (chainState's kFinal; every block runs the watcher), and the
 * operation is `final` (ended). The operation as POST /chain/mint answered it ({ id, assetName,
 * txHash, … }); the test fails at the first step that refuses.
 *
 * The day's mint limit (MINTS_PER_DAY, 3) counts the player's own mints submitted today (their
 * chain_ops rows; no route seeds them, and none should: the real watcher reads those rows). A
 * spec reaches it honestly, as mintApi.spec.js does: one player with MINTS_PER_DAY + 1 items
 * (mintingPlayer's and craftItem's) and ADA for MINTS_PER_DAY mints in one output (100 ADA; each
 * mint's change is the next one's input), mintThroughApi(…, { final: true }) over the first
 * MINTS_PER_DAY, then readiness says mintsLeftToday 0 and the next POST /chain/mint is 409 MINT
 * LIMIT. Without `final` the second mint is already 409 OPERATION RUNNING. A day is a UTC day.
 */
export const mintThroughApi = async (
  page,
  request,
  player,
  item,
  { final = false } = {}
) => {
  const prepared = await prepareMint(request, player, {
    itemId: item.id,
    addresses: await walletAddressesOf(page),
  });
  expect(prepared.status(), await prepared.text()).toBe(201);
  const { operation, tx, signCode } = await prepared.json();
  const signed = await walletSignTx(page, tx);
  expect(signed.error, JSON.stringify(signed.error)).toBeUndefined();
  const submitted = await submitWitness(request, signCode, signed.witness);
  expect(submitted.status(), await submitted.text()).toBe(200);
  await chainBlocks(request, 1);
  expect(await operationOf(request, player, operation.id)).toMatchObject({
    state: "included",
  });
  if (final) {
    const { kFinal } = await chainState(request);
    await chainBlocks(request, kFinal);
    expect(await operationOf(request, player, operation.id)).toMatchObject({
      state: "final",
    });
  }
  return operation;
};
