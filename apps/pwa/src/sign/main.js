// The sign page (plan D): a phone wallet opens it in its own browser through a CIP-158 deep link
// that the minting dialog made for a sign code (WalletDoor's purpose "sign"). That browser shares
// nothing with the game, so the code stands for the prepared mint: the page shows what is minted
// and what it costs, has the wallet injected here sign it, and posts the signature; the game
// polls the operation and carries on by itself. Everything the wallet does goes through one
// function, signPrepared: it checks the wallet, has it prove its addresses where the minting was
// prepared without them (the wallet then asks twice: the page says so first), and signs. The
// costs shown at the end are those of the operation it signed; before that, while the wallet has
// not vouched for its addresses, the network fee and the deposit are "≈" (the page may build the
// minting anew for them), as in the game. A minting (`kind` "mint") and the burn of a minted
// item's salvage (`kind` "burn", plan E: what the wallet pays and gets, what comes back in the
// game, and after the signature that the ingredients arrive there in a few minutes) are shown;
// anything else sends the player to battlechoc. No React; a build of its own like the link page
// (vite.link.config.js), never precached.
import "../index.css";
import "../link/link.css";
import "./sign.css";
import {
  cardano,
  getCurrentLanguage,
  Items,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { applyLanguage } from "../helper/language.js";
import { createClient } from "../helper/http.js";
import { apiUrl } from "../api/apiUrl.js";
import { createSignApi } from "../api/chainClient.js";
import { walletApiOf } from "../cardano/wallet.js";
import { signPrepared } from "../cardano/signTx.js";
import { networkLabel, walletLabel } from "../ui/account/safetyState.js";
import {
  ICON_LOOK,
  ICON_SHADOW,
  iconPartsOf,
  itemName,
} from "../ui/lab/itemText.js";
import { adaText, burnChange, walletChange } from "../ui/mint/ada.js";
import { salvageKey } from "../ui/mint/salvageTexts.js";
import { detailOf } from "../link/diagnosis.js";
import { BURN_LAST_WORDS, problemOf } from "./messages.js";

const WALLET_WAIT_MS = 3000;
const network = cardano.networkOf(import.meta.env.VITE_CARDANO_NETWORK);
const api = createSignApi(createClient({ baseURL: apiUrl, timeout: 15000 }));
// problems after which no button comes back: the page is of no more use (by the minting's key;
// a burn's page shows each as its salvage variant, and has its own besides)
const LAST_WORDS = [
  "MINT_SIGN_EXPIRED",
  "MINT_SIGN_NOT_OPEN",
  "MINT_SIGN_START_AGAIN",
  "MINT_SIGNED_UNHEARD",
  ...BURN_LAST_WORDS,
];
const lastWords = (problem) =>
  Boolean(problem) && LAST_WORDS.includes(problem.base || problem.key);
// the kinds of operation the page signs: a mint, and the burn of a minted item's salvage (plan E)
const KINDS = ["mint", "burn"];
const signable = (info) => Boolean(info) && KINDS.includes(info.kind);
const isBurn = (info) => Boolean(info) && info.kind === "burn";

const root = document.getElementById("sign");

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  return node;
};

const show = (...nodes) => root.replaceChildren(...nodes.filter(Boolean));

// the wallets this browser injected (CIP-30): { key, name }
const injected = () => {
  try {
    const wallets = window.cardano || {};
    return Object.keys(wallets)
      .filter(
        (key) => wallets[key] && typeof wallets[key].enable === "function"
      )
      .map((key) => ({
        key,
        name: walletLabel(key) || walletLabel(wallets[key].name) || key,
      }));
  } catch {
    return [];
  }
};

// a wallet's browser may inject its wallet a moment after the page loaded
const waitForWallets = async () => {
  const until = Date.now() + WALLET_WAIT_MS;
  let wallets = injected();
  while (wallets.length === 0 && Date.now() < until) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    wallets = injected();
  }
  return wallets;
};

// the brand, and the title only for a kind the page signs: without the info (its first read
// failed: a used, cancelled or expired code, or no connection) or for another kind the page
// cannot say what it is for, so it names nothing
const TITLES = { mint: tr.MINT_SIGN_TITLE, burn: tr.SALVAGE_SIGN_TITLE };
const header = (info) => {
  const title = info && TITLES[info.kind];
  return [
    element("h1", "battlechoc", "brand"),
    title ? element("h2", t(title)) : null,
  ];
};

// a picture of the item's icon, placed in it (ICON_LOOK's shares)
const picture = (src, className, place) => {
  const image = element("img", null, className);
  Object.assign(image.style, { position: "absolute" }, place);
  image.src = src;
  image.alt = "";
  return image;
};

// the item (sign info's { item, serial }): its icon as the game draws it (iconPartsOf, ICON_LOOK:
// its building on its tier's colours, its badge at the lower right), its name
const itemNodes = (item) => {
  if (!item || !Items[item.item]) {
    return [];
  }
  const parts = iconPartsOf(item.item);
  const icon = element("div", null, "item");
  icon.style.background = parts.face;
  icon.style.boxShadow = `${ICON_LOOK.ring(parts.tier)}, ${ICON_SHADOW}`;
  icon.append(
    picture(parts.building, "picture", ICON_LOOK.picture),
    picture(parts.badge, "badge", ICON_LOOK.badge)
  );
  return [
    icon,
    element(
      "div",
      `${itemName(item.item)} ${t(tr.ITEM_SERIAL, item.serial)}`,
      "name"
    ),
  ];
};

// an amount of lovelace as ADA (adaText): exact, with every decimal (what the wallet shows), or
// "≈" with two decimals while the minting may still be built anew for the wallet's addresses
// (`options`: round, given); nothing for one an older API sent in another form
const ada = (lovelace, exact = true, options = {}) => {
  try {
    return adaText(lovelace, getCurrentLanguage(), { ...options, exact });
  } catch {
    return "";
  }
};

// the three costs of the sign info `info`: exact once the wallet vouched for its addresses
// (`ownerConfirmed`), else the network fee and the deposit "≈"; the battlechoc fee is always
// the config's exact amount
const costNodes = (info) => {
  const costs = info && info.costs;
  if (!costs) {
    return null;
  }
  if (isBurn(info)) {
    return burnCostNodes(info);
  }
  const exact = info.ownerConfirmed === true;
  const box = element("div", null, "costs");
  box.setAttribute("data-testid", "mint-sign-costs");
  const row = (kind, label, amount) => {
    const line = element("div", null, "cost");
    line.setAttribute("data-kind", kind);
    line.append(element("span", label), element("span", amount));
    box.append(line);
  };
  row("network", t(tr.MINT_NETWORK_FEE), ada(costs.networkFee, exact));
  if (costs.gameFee) {
    row(
      "game",
      t(tr.MINT_GAME_FEE),
      costs.gameFee.asset === "lovelace"
        ? ada(costs.gameFee.amount)
        : t(tr.MINT_AMOUNT, String(costs.gameFee.amount), costs.gameFee.label)
    );
  }
  row("deposit", t(tr.MINT_DEPOSIT), ada(costs.deposit, exact));
  return box;
};

// what the wallet will show for `info` (as the game's wallet step): You give (the fees and the
// reference token's deposit), You get (the item, with the ADA that stays with it in the wallet);
// nothing for an answer without the deposit's two parts (an older server)
const changeNodes = (info) => {
  if (isBurn(info)) {
    return burnChangeNodes(info);
  }
  const costs = info && info.costs;
  let change;
  try {
    change = costs ? walletChange(costs) : null;
  } catch {
    change = null;
  }
  if (!change || change.stays === null || !info.item) {
    return null;
  }
  const exact = info.ownerConfirmed === true;
  const box = element("div", null, "change");
  box.setAttribute("data-testid", "mint-sign-change");
  const give = element("div", null, "cost");
  const given = element(
    "span",
    ada(change.give, exact, { given: true }),
    "give"
  );
  given.setAttribute("data-testid", "mint-sign-give");
  give.append(element("span", t(tr.MINT_YOU_GIVE)), given);
  const get = element("div", null, "cost");
  const got = element(
    "span",
    t(tr.MINT_GET_ITEM, itemName(info.item.item), info.item.serial),
    "get"
  );
  const stays = element(
    "span",
    t(tr.MINT_GET_DEPOSIT, ada(change.stays, exact, { round: "down" })),
    "stays"
  );
  stays.setAttribute("data-testid", "mint-sign-stays");
  got.append(stays);
  get.append(element("span", t(tr.MINT_YOU_GET)), got);
  box.append(give, get);
  return box;
};

// A burn (the salvage of a minted item): what the wallet pays (the network fee) and what comes
// back with the transaction (the ADA that was locked with the item), "≈" until the wallet vouched
// for its addresses; nothing of the prepared burn is named the wallet's before that (its inputs
// may hold an outsider's ADA under the player's stake key: it is never co-signed so)
const burnCostNodes = (info) => {
  const costs = info.costs;
  const parts = costs.deposits || null;
  const exact = info.ownerConfirmed === true;
  const box = element("div", null, "costs");
  box.setAttribute("data-testid", "salvage-sign-costs");
  const row = (kind, label, amount) => {
    const line = element("div", null, "cost");
    line.setAttribute("data-kind", kind);
    line.append(element("span", label), element("span", amount));
    box.append(line);
  };
  row("network", t(tr.MINT_NETWORK_FEE), ada(costs.networkFee, exact));
  if (parts && parts.reference != null) {
    row(
      "deposit",
      t(tr.SALVAGE_DEPOSIT_BACK_LABEL),
      ada(parts.reference, exact, { round: "down" })
    );
  }
  return box;
};

// what the wallet will show for a burn: You give (the item; the ADA when the fee is the larger),
// You get (the item's locked ADA less the fee); once the wallet vouched for its addresses, the
// ADA that lay with the token in it, free again
const burnChangeNodes = (info) => {
  let change;
  try {
    change = burnChange(info.costs);
  } catch {
    change = null;
  }
  if (!change || !info.item) {
    return null;
  }
  const exact = info.ownerConfirmed === true;
  const box = element("div", null, "change");
  box.setAttribute("data-testid", "salvage-sign-change");
  const give = element("div", null, "cost");
  const given = element(
    "span",
    t(tr.SALVAGE_GIVE_ITEM, itemName(info.item.item), info.item.serial),
    "give"
  );
  given.setAttribute("data-testid", "salvage-sign-give");
  if (!change.gain) {
    given.append(
      element("br"),
      document.createTextNode(ada(change.net, exact, { given: true }))
    );
  }
  give.append(element("span", t(tr.MINT_YOU_GIVE)), given);
  box.append(give);
  if (change.gain) {
    const get = element("div", null, "cost");
    const got = element(
      "span",
      // what the player keeps: an estimate rounds down, as the deposit does
      ada(change.net, exact, { gotten: true, round: "down" }),
      "get"
    );
    got.setAttribute("data-testid", "salvage-sign-get");
    got.append(
      element(
        "span",
        t(tr.SALVAGE_FEE_DEDUCTED, ada(change.fee, exact)),
        "stays"
      )
    );
    get.append(element("span", t(tr.MINT_YOU_GET)), got);
    box.append(get);
  }
  const nodes = [box];
  if (exact && change.free) {
    const free = element(
      "p",
      t(tr.SALVAGE_FREE_AGAIN, ada(change.free, true)),
      "soft"
    );
    free.setAttribute("data-testid", "salvage-sign-free");
    nodes.push(free);
  }
  const wrap = element("div");
  wrap.append(...nodes);
  return wrap;
};

// what comes back in battlechoc a few minutes later, by today's recipe (the sign info's
// `returns`, as of now); nothing without it
const returnNodes = (info) => {
  const returns = isBurn(info) && info.returns;
  const rows = Object.entries(
    returns && typeof returns === "object" ? returns : {}
  ).filter(([, amount]) => Number.isInteger(amount) && amount > 0);
  if (rows.length === 0) {
    return null;
  }
  const box = element("div", null, "costs");
  box.setAttribute("data-testid", "salvage-sign-returns");
  box.append(element("p", t(tr.SALVAGE_SIGN_RETURNS), "soft"));
  for (const [ingredient, amount] of rows) {
    const line = element("div", null, "cost");
    line.setAttribute("data-ingredient", ingredient);
    line.append(
      element("span", t(tr[`INGREDIENT_${ingredient}`]) || ingredient),
      element("span", `+ ${amount}`)
    );
    box.append(line);
  }
  return box;
};

// Try again: `again()` runs when tapped
const againButton = (again) => {
  const button = element("button", t(tr.MINT_AGAIN));
  button.setAttribute("data-testid", "mint-sign-again");
  button.addEventListener("click", () => {
    button.disabled = true;
    again();
  });
  return button;
};

// a sign info of a kind this page does not sign (a later kind, from a page kept in a cache): no
// title, costs or buttons, only the way back
const otherKind = () =>
  show(...header(), element("p", t(tr.MINT_SIGN_OTHER_KIND), "soft"));

// the page's words of a minting where a burn has its own (salvageTexts.js)
const wordsOf = (info, key) => t(tr[isBurn(info) ? salvageKey(key) : key]);

const alertOf = (text) => {
  const alert = element("p", text, "error");
  alert.setAttribute("role", "alert");
  alert.setAttribute("data-testid", "mint-sign-problem");
  return alert;
};

// the page with `info`, a problem (`problem`: { text, key, detail }) and the wallets' buttons
const offer = (code, info, wallets, problem) => {
  const confirmed = info.ownerConfirmed === true;
  const nodes = [
    ...header(info),
    ...itemNodes(info.item),
    costNodes(info),
    changeNodes(info),
    // prepared without the wallet's addresses: the wallet proves them first
    element(
      "p",
      confirmed ? t(tr.MINT_SIGN_TEXT) : wordsOf(info, "MINT_SIGN_TWICE")
    ),
    confirmed
      ? null
      : element("p", wordsOf(info, "MINT_WALLET_TEXT_UNCONFIRMED"), "soft"),
  ];
  if (problem) {
    const alert = alertOf(problem.text);
    alert.setAttribute("data-key", problem.key);
    nodes.push(alert);
    if (problem.detail) {
      nodes.push(element("p", t(tr.LINK_DETAILS, problem.detail), "detail"));
    }
  }
  if (!problem || !lastWords(problem)) {
    for (const wallet of wallets) {
      const button = element("button", t(tr.MINT_SIGN_WITH, wallet.name));
      button.setAttribute("data-testid", "mint-sign-wallet");
      button.setAttribute("data-wallet", wallet.key);
      // the player taps first: nothing is asked of the wallet before they read the costs
      button.addEventListener("click", () => sign(code, info, wallet, wallets));
      nodes.push(button);
    }
    nodes.push(element("p", t(tr.MINT_SIGN_AFTER), "soft"));
  }
  // what comes back in battlechoc (a burn): below the buttons, so what the wallet signs and the
  // button are in view first on a phone (the game's confirmation listed it already)
  nodes.push(returnNodes(info));
  show(...nodes.filter(Boolean));
};

// the problem of `failure` at `step` as the page shows it ({ key, text, detail }), or null
const shownProblem = (failure, step, wallet, info) => {
  const problem = problemOf(failure, {
    step,
    wallet,
    network: networkLabel(network.name),
    language: getCurrentLanguage(),
    kind: info ? info.kind : undefined,
  });
  return problem === null
    ? null
    : {
        key: problem.key,
        base: problem.base || problem.key,
        text: t(tr[problem.key], ...problem.values),
        detail: problem.technical ? detailOf(failure, step) : null,
      };
};

// the buttons again, with the sign info as the server has it now: a proof the wallet signed
// before it said no may have prepared the minting again (new costs, no second prompt)
const offerAgain = async (code, info, wallets, problem) => {
  let fresh = info;
  try {
    fresh = await api.signInfo(code);
  } catch (failure) {
    const gone = shownProblem(failure, "info", null, info);
    if (lastWords(gone)) {
      offer(code, info, wallets, gone);
      return;
    }
    // the page's info stays; the next tap reads the server again
  }
  offer(code, fresh, wallets, problem);
};

const sign = async (code, info, wallet, wallets) => {
  root.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  const waiting = element("p", t(tr.MINT_SIGN_WAITING), "soft");
  waiting.setAttribute("data-testid", "mint-sign-waiting");
  root.append(waiting);
  let step = "enable";
  let shown = info;
  try {
    // the wallet first, within the tap: some in-app browsers let a page ask a wallet only while
    // the tap's user activation lasts, which a round trip to battlechoc could outlast
    const walletApi = await walletApiOf(wallet.key);
    step = "info";
    // the sign info as the server has it now: a proof whose rebuilt answer was lost may have
    // prepared the minting again for this wallet, and the wallet is never asked twice for it
    const fresh = await api.signInfo(code);
    if (!signable(fresh) || fresh.kind !== info.kind) {
      otherKind();
      return;
    }
    shown = fresh;
    step = "sign";
    const signed = await signPrepared(walletApi, {
      api,
      code,
      info: fresh,
      network,
    });
    // the costs of what was signed (a minting prepared again for the wallet may differ)
    shown = signed.info;
    step = "submit";
    await api.sign(code, signed.witness);
    const done = element(
      "p",
      t(isBurn(shown) ? tr.SALVAGE_SIGN_DONE : tr.MINT_SIGN_DONE)
    );
    done.setAttribute("data-testid", "mint-sign-done");
    done.setAttribute("role", "status");
    show(
      ...header(shown),
      ...itemNodes(shown.item),
      costNodes(shown),
      changeNodes(shown),
      returnNodes(shown),
      done
    );
  } catch (failure) {
    const problem = shownProblem(failure, step, wallet.name, shown);
    if (problem !== null) {
      console.warn("the sign page could not sign", failure);
    }
    if (problem !== null && lastWords(problem)) {
      offer(code, shown, wallets, problem);
      return;
    }
    await offerAgain(code, shown, wallets, problem || undefined);
  }
};

const start = async () => {
  try {
    await applyLanguage(navigator.language);
  } catch {
    // English
  }
  const code = new URLSearchParams(location.search).get("code");
  if (!network || !code) {
    location.replace("/");
    return;
  }
  await openPage(code);
};

// the page for `code`: the sign info, then the wallets this browser injected (a failure to read
// the info that may pass, and no wallet yet, offer Try again: a wallet's own browser often has no
// reload)
const openPage = async (code) => {
  let info;
  try {
    info = await api.signInfo(code);
  } catch (failure) {
    const problem = problemOf(failure, {
      step: "info",
      wallet: null,
      network: networkLabel(network.name),
      language: getCurrentLanguage(),
    });
    const alert = alertOf(
      t(
        tr[problem ? problem.key : "MINT_FAILED"],
        ...(problem ? problem.values : [])
      )
    );
    alert.setAttribute("data-key", problem ? problem.key : "MINT_FAILED");
    show(
      ...header(),
      alert,
      problem && problem.technical
        ? element("p", t(tr.LINK_DETAILS, detailOf(failure, "info")), "detail")
        : null,
      lastWords(problem) ? null : againButton(() => openPage(code))
    );
    return;
  }
  if (!signable(info)) {
    otherKind();
    return;
  }
  const wallets = await waitForWallets();
  if (wallets.length === 0) {
    const alert = alertOf(t(tr.LINK_NO_WALLET, networkLabel(network.name)));
    alert.setAttribute("data-key", "LINK_NO_WALLET");
    show(
      ...header(info),
      ...itemNodes(info.item),
      costNodes(info),
      changeNodes(info),
      returnNodes(info),
      alert,
      againButton(() => openPage(code))
    );
    return;
  }
  offer(code, info, wallets);
};

start();
