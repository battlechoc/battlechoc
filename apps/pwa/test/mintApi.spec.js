import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { blake2b } from "@noble/hashes/blake2.js";
import { nodeKeys } from "./helpers/cardano.js";
import { LAB_PLAYER_MATCHES } from "./helpers/players.js";
import { walletAddressesOf, walletSignTx } from "./helpers/wallet.js";
import { craftItem, openChoclab, statsOf } from "./helpers/lab.js";
import {
  chainBlocks,
  chainHolders,
  chainReset,
  chainState,
  mintThroughApi,
  mintingPlayer,
  operationOf,
  prepareMint,
  readiness,
  submitWitness,
} from "./helpers/chain.js";

// A mint for real, without the minting dialog (minting plan D, Task 9a): the browser tests' API
// builds the transaction from the wallet's funds on the chain double, the page's fake wallet
// (helpers/wallet.js) signs it with the wallet's payment key, the server checks that witness,
// signs last and submits onto the double, and one block makes the item minted. The calls are
// the API's (helpers/chain.js), the signature is the page's injected CIP-30 wallet, as the game's
// minting flow asks it (src/cardano/signTx.js). The dialog's own tests drive the same through the
// game (mint.spec.js).

const require = createRequire(import.meta.url);
const {
  fixtureContracts,
  preprodFees,
} = require("../../api/test/helpers/chain.js");
const { describeTx } = require("../../api/test/helpers/describeTx.js");
const { TEST_POLICY_ID } = require("../../api/test/chainDouble.js");
const { chain: rules } = require("@battlechoc/battlechoc-shared-functions");

// the double's faults, held mempool, waiting transactions and config are shared by every spec:
// none outlives a test
test.afterEach(async ({ request }) => {
  await chainReset(request);
});

// The names of the item a mint spending the output `txHash#0` makes, computed here from the rule
// (contracts/lib/battlechoc/names.ak): blake2b-224 of the output reference as Aiken's
// cbor.serialise writes it (Constr 0, indefinite: d8799f, the 32 bytes, the index 0, ff), after
// the CIP-67 labels 222 (user) and 100 (reference)
const namesOfSeed = (txHash) => {
  const seed = Buffer.from(`d8799f5820${txHash}00ff`, "hex");
  const suffix = Buffer.from(blake2b(seed, { dkLen: 28 })).toString("hex");
  return { user: `000de140${suffix}`, reference: `000643b0${suffix}` };
};

// the items script's address, where a reference token lives
const ITEMS_ADDRESS = fixtureContracts().itemsAddress;

// the preprod fee of the fixture deployment, as readiness lists it (lovelace as text, by tier)
const PREPROD_FEE = {
  fee: 0,
  asset: "lovelace",
  label: "ADA",
  amounts: preprodFees()[0].amounts.map(String),
};

test("a mint through the API, signed by the page's wallet, lands with one block and shows the stamp", async ({
  browser,
  request,
}) => {
  // linked as a player links a wallet: through the door
  const ola = await mintingPlayer(browser, request, "MintApiOla", {
    link: "door",
  });
  const { page, item, wallet } = ola;

  const ready = await readiness(request, ola, item.id);
  expect(ready).toMatchObject({
    ready: true,
    paused: false,
    gameFees: [PREPROD_FEE],
    operation: null,
  });
  expect(ready.matches.have).toBeGreaterThanOrEqual(
    rules.MINT_MIN_ONLINE_MATCHES
  );
  expect(ready.wallets).toEqual([
    expect.objectContaining({
      subject: ola.subject,
      name: "eternl",
      lovelace: "20000000",
      enough: true,
      collateral: true,
    }),
  ]);

  // the wallet's own addresses, as the game reads them, go with the mint
  const addresses = await walletAddressesOf(page);
  expect(addresses).toEqual(ola.addresses);
  const prepared = await prepareMint(request, ola, {
    itemId: item.id,
    addresses,
  });
  expect(prepared.status(), await prepared.text()).toBe(201);
  const { operation, tx, signCode, costs } = await prepared.json();
  expect(operation).toMatchObject({
    state: "prepared",
    itemId: item.id,
    subject: ola.subject,
  });
  // the battlechoc fee of a RARE item
  expect(costs.gameFee).toEqual({
    asset: "lovelace",
    label: "ADA",
    amount: Number(PREPROD_FEE.amounts[rules.TIER_ORDER.indexOf("RARE")]),
  });

  // the transaction spends the wallet's one output, whose reference names the item
  expect(describeTx(tx).inputs).toEqual([{ txHash: ola.funding, index: 0 }]);
  const names = namesOfSeed(ola.funding);
  expect(operation.assetName).toBe(names.user);

  // a whole signature is refused: the server's key is missing, as a real wallet says
  expect(await walletSignTx(page, tx, { partial: false })).toEqual({
    error: { code: 1, info: expect.any(String) },
  });
  // the wallet in the page signs exactly the server's transaction, as a partial signature
  const signed = await walletSignTx(page, tx);
  expect(signed.error).toBeUndefined();
  expect(signed.witness).toMatch(/^(?:[0-9a-f]{2})+$/);
  expect(wallet.asked("signTx")).toEqual([
    { method: "signTx", tx, partial: false },
    { method: "signTx", tx, partial: true },
  ]);

  const submitted = await submitWitness(request, signCode, signed.witness);
  expect(submitted.status(), await submitted.text()).toBe(200);
  expect(await submitted.json()).toMatchObject({
    state: "submitted",
    operation: { id: operation.id, state: "submitted" },
  });
  expect((await chainState(request)).mempool).toContain(operation.txHash);
  const minting = (await statsOf(request, ola)).items.find(
    (entry) => entry.id === item.id
  );
  expect(minting.minted).toMatchObject({
    state: "minting",
    operationId: operation.id,
  });

  // one block: the mint is in it, and the item is minted
  await chainBlocks(request, 1);
  expect((await chainState(request)).mempool).not.toContain(operation.txHash);
  expect(await operationOf(request, ola, operation.id)).toMatchObject({
    state: "included",
  });
  const minted = (await statsOf(request, ola)).items.find(
    (entry) => entry.id === item.id
  );
  expect(minted.minted).toEqual({
    assetName: operation.assetName,
    state: "minted",
  });
  // on the chain itself: the user token at the wallet's base address, the reference token at
  // the items script's address, one each
  expect(await chainHolders(request, TEST_POLICY_ID + names.user)).toEqual([
    { address: ola.keys.baseAddress, quantity: "1" },
  ]);
  const reference = await chainHolders(
    request,
    TEST_POLICY_ID + names.reference
  );
  expect(reference).toEqual([
    { address: expect.stringMatching(/^addr_test1w/), quantity: "1" },
  ]);
  expect(reference[0].address).toBe(ITEMS_ADDRESS);

  // in the game: the shelf's tile wears the stamp, the item card the serial tag
  await page.goto("/", { waitUntil: "networkidle" });
  await openChoclab(page);
  await page.getByTestId("item-shelf-tab").click();
  const tile = page.getByTestId("item-shelf").getByTestId("item-tile");
  await expect(tile.getByTestId("item-stamp")).toBeVisible();
  await expect(tile).toHaveAttribute(
    "aria-label",
    `Heavy rum barrel, minted, No.\u00a0${item.serial}`
  );
  await tile.click();
  const card = page.getByTestId("item-card");
  await expect(card.getByTestId("item-stamp")).toBeVisible();
  await expect(card.getByTestId("item-serial-tag")).toHaveText(
    `No. ${item.serial}`
  );
  await ola.context.close();
});

test("the doubles are honest: another key's witness is refused, a declined signature reaches the page, and neither changes the mint", async ({
  browser,
  request,
}) => {
  const pim = await mintingPlayer(browser, request, "MintApiPim");
  const { page, item, wallet } = pim;
  const prepared = await prepareMint(request, pim, {
    itemId: item.id,
    addresses: await walletAddressesOf(page),
  });
  expect(prepared.status(), await prepared.text()).toBe(201);
  const { operation, tx, signCode } = await prepared.json();

  // the wallet opened on another account: its witness is no signature of this wallet's key
  wallet.options.txKeys = nodeKeys();
  const foreign = await walletSignTx(page, tx);
  expect(foreign.witness).toMatch(/^(?:[0-9a-f]{2})+$/);
  const refused = await submitWitness(request, signCode, foreign.witness);
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toEqual({ error: "INVALID WITNESS" });
  expect((await chainState(request)).mempool).not.toContain(operation.txHash);

  // the player says no in the wallet: the page gets the wallet's refusal (CIP-30 TxSignError 2)
  wallet.options.txKeys = null;
  wallet.options.declineTx = true;
  expect(await walletSignTx(page, tx)).toEqual({
    error: { code: 2, info: "user declined" },
  });
  expect(await operationOf(request, pim, operation.id)).toMatchObject({
    state: "prepared",
  });

  // the same sign code still takes the wallet's own signature
  wallet.options.declineTx = false;
  const signed = await walletSignTx(page, tx);
  expect(wallet.asked("signTx").map((call) => call.tx)).toEqual([tx, tx, tx]);
  const submitted = await submitWitness(request, signCode, signed.witness);
  expect(submitted.status(), await submitted.text()).toBe(200);
  expect((await chainState(request)).mempool).toContain(operation.txHash);
  // it lands here, not in the next spec's first block
  await chainBlocks(request, 1);
  expect(await operationOf(request, pim, operation.id)).toMatchObject({
    state: "included",
  });
  await pim.context.close();
});

test("a player who can mint has played the AI: Start Game joins the queue, and the server AI comes after the fallback", async ({
  browser,
  request,
}) => {
  const ren = await mintingPlayer(browser, request, "MintApiRen", {
    funds: "none",
  });
  const { page } = ren;
  // what the game sends to the live lobby
  await page.addInitScript(() => {
    window.__sentTypes = [];
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      try {
        window.__sentTypes.push(JSON.parse(data).type);
      } catch {
        // not JSON
      }
      return send.call(this, data);
    };
  });
  await page.goto("/", { waitUntil: "networkidle" });
  const stats = await statsOf(request, ren);
  // labPlayer's reported matches and the verified ones: no prepared first match any more
  expect(stats.aiLadder.games).toBe(
    LAB_PLAYER_MATCHES + rules.MINT_MIN_ONLINE_MATCHES
  );
  await page.getByText("Start Game", { exact: true }).first().click();
  await expect
    .poll(() => page.evaluate(() => window.__sentTypes), { timeout: 15000 })
    .toContain("queue.join");
  expect(await page.evaluate(() => window.__sentTypes)).not.toContain(
    "queue.ai"
  );
  // nobody else waits: the server AI after LIVE_AI_FALLBACK_MS, a match on the server
  await page.waitForFunction(
    () =>
      window.__battlechoc &&
      window.__battlechoc.host &&
      window.__battlechoc.host.online &&
      window.__battlechoc.view &&
      window.__battlechoc.view(),
    null,
    { timeout: 30000 }
  );
  const opponent = await page.evaluate(() => {
    const view = window.__battlechoc.view();
    return view.players[1 - view.viewer].type;
  });
  expect(opponent).not.toBe("PlayerType.HUMAN");
  await ren.context.close();
});

test("the day's mint limit, reached honestly: three final mints, then readiness has none left and the next mint is refused", async ({
  browser,
  request,
}) => {
  // one wallet output pays all three mints: each mint's change is the next one's input
  const una = await mintingPlayer(browser, request, "MintApiUna", {
    lovelace: 100_000_000,
  });
  const { page } = una;
  const items = [una.item];
  for (let i = 0; i < rules.MINTS_PER_DAY; i++) {
    items.push(await craftItem(request, una, una.item.item));
  }
  // The server counts "today" from the start of the UTC day on the real clock, and the full
  // suite may run around midnight UTC: so close to it that the mints could fall on two days,
  // the test waits until the new day has begun (bounded: at most a minute more) instead of
  // skipping, and checks at the end that every mint and the refusal fell on that one day.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const utcDay = () => Math.floor(Date.now() / DAY_MS);
  const untilMidnight = (utcDay() + 1) * DAY_MS - Date.now();
  if (untilMidnight < 60000) {
    test.setTimeout(test.info().timeout + untilMidnight + 10000);
    await page.waitForTimeout(untilMidnight + 1000);
  }
  const day = utcDay();
  // a mint that is only included is still open: the next one waits for it to be final
  for (const item of items.slice(0, rules.MINTS_PER_DAY)) {
    await mintThroughApi(page, request, una, item, { final: true });
  }
  expect(utcDay(), "the mints fell on two UTC days").toBe(day);
  const after = await readiness(request, una, items.at(-1).id);
  expect(after.mintsLeftToday).toBe(0);
  expect(after.operation).toBeNull();
  const refused = await prepareMint(request, una, {
    itemId: items.at(-1).id,
    addresses: await walletAddressesOf(page),
  });
  expect(refused.status()).toBe(409);
  expect(await refused.json()).toEqual({ error: "MINT LIMIT" });
  expect(utcDay(), "the refusal fell on another UTC day").toBe(day);
  const stats = await statsOf(request, una);
  expect(
    items
      .slice(0, rules.MINTS_PER_DAY)
      .map(
        (item) => stats.items.find((entry) => entry.id === item.id).minted.state
      )
  ).toEqual(Array(rules.MINTS_PER_DAY).fill("minted"));
  await una.context.close();
});
