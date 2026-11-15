// The sign page (plan D): a phone wallet opens it in its own browser through a CIP-158 deep link
// that the minting dialog made for a sign code (WalletDoor's purpose "sign"). That browser shares
// nothing with the game, so the code stands for the prepared mint: the page shows what is minted
// and what it costs, has the wallet injected here sign it, and posts the signature; the game
// polls the operation and carries on by itself. Everything the wallet does goes through one
// function, signPrepared: it checks the wallet, has it prove its addresses where the minting was
// prepared without them (the wallet then asks twice: the page says so first), and signs. The
// costs shown at the end are those of the operation it signed; before that, while the wallet has
// not vouched for its addresses, the network fee and the deposit are "≈" (the page may build the
// minting anew for them), as in the game. Only a minting is shown (`kind` "mint"); anything else
// sends the player to battlechoc. No React; a build of its own like the link page
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
import { BUILDING_ICON, iconUrl } from "../catalog.js";
import { badgeOf, itemName, TIER_COLORS } from "../ui/lab/itemText.js";
import { formatAda, walletChange } from "../ui/mint/ada.js";
import { detailOf } from "../link/diagnosis.js";
import { problemOf } from "./messages.js";

const WALLET_WAIT_MS = 3000;
const network = cardano.networkOf(import.meta.env.VITE_CARDANO_NETWORK);
const api = createSignApi(createClient({ baseURL: apiUrl, timeout: 15000 }));
// problems after which no button comes back: the page is of no more use
const LAST_WORDS = [
  "MINT_SIGN_EXPIRED",
  "MINT_SIGN_NOT_OPEN",
  "MINT_SIGN_START_AGAIN",
  "MINT_SIGNED_UNHEARD",
];

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

const header = () => [
  element("h1", "battlechoc", "brand"),
  element("h2", t(tr.MINT_SIGN_TITLE)),
];

// the item (sign info's { item, serial }): its picture on its tier's colours, its name
const itemNodes = (item) => {
  const definition = item && Items[item.item];
  if (!definition) {
    return [];
  }
  const tier = TIER_COLORS[definition.tier];
  const icon = element("div", null, "item");
  icon.style.background = `radial-gradient(circle at 35% 30%, #ffffff 0%, ${tier.fill} 70%)`;
  icon.style.boxShadow = `inset 0 0 0 0.18em ${tier.ring}, 0 0.1em 0.25em rgba(0, 0, 0, 0.35)`;
  const picture = element("img", null, "picture");
  picture.src = iconUrl(BUILDING_ICON[definition.entityType]);
  picture.alt = "";
  const badge = element("img", null, "badge");
  badge.src = badgeOf(item.item);
  badge.alt = "";
  icon.append(picture, badge);
  return [
    icon,
    element(
      "div",
      `${itemName(item.item)} ${t(tr.ITEM_SERIAL, item.serial)}`,
      "name"
    ),
  ];
};

// an amount of lovelace as ADA: exact, with every decimal (what the wallet shows), or "≈" with
// two decimals rounded up while the minting may still be built anew for the wallet's addresses;
// nothing for one an older API sent in another form
const ada = (lovelace, exact = true) => {
  try {
    const language = getCurrentLanguage();
    return exact
      ? t(tr.MINT_AMOUNT, formatAda(lovelace, language, { exact }), "ADA")
      : t(tr.MINT_ABOUT, formatAda(lovelace, language), "ADA");
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
  row("deposit", t(tr.MINT_DEPOSIT_IN_ITEM), ada(costs.deposit, exact));
  return box;
};

// what the wallet will show for `info` (as the game's wallet step): You give (the fees and the
// reference token's deposit), You get (the item, with the ADA that stays with it in the wallet);
// nothing for an answer without the deposit's two parts (an older server)
const changeNodes = (info) => {
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
  const given = element("span", `− ${ada(change.give, exact)}`, "give");
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
    t(tr.MINT_GET_DEPOSIT, ada(change.stays, exact)),
    "stays"
  );
  stays.setAttribute("data-testid", "mint-sign-stays");
  got.append(stays);
  get.append(element("span", t(tr.MINT_YOU_GET)), got);
  box.append(give, get);
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

// a sign info that is not a minting's (a later kind, from a page kept in a cache): no costs, no
// buttons, only the way back
const otherKind = () =>
  show(...header(), element("p", t(tr.MINT_SIGN_OTHER_KIND), "soft"));

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
    ...header(),
    ...itemNodes(info.item),
    costNodes(info),
    changeNodes(info),
    // a minting prepared without the wallet's addresses: the wallet proves them first
    element("p", t(confirmed ? tr.MINT_SIGN_TEXT : tr.MINT_SIGN_TWICE)),
    confirmed ? null : element("p", t(tr.MINT_WALLET_TEXT_UNCONFIRMED), "soft"),
  ];
  if (problem) {
    const alert = alertOf(problem.text);
    alert.setAttribute("data-key", problem.key);
    nodes.push(alert);
    if (problem.detail) {
      nodes.push(element("p", t(tr.LINK_DETAILS, problem.detail), "detail"));
    }
  }
  if (!problem || !LAST_WORDS.includes(problem.key)) {
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
  show(...nodes);
};

// the problem of `failure` at `step` as the page shows it ({ key, text, detail }), or null
const shownProblem = (failure, step, wallet) => {
  const problem = problemOf(failure, {
    step,
    wallet,
    network: networkLabel(network.name),
    language: getCurrentLanguage(),
  });
  return problem === null
    ? null
    : {
        key: problem.key,
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
    const gone = shownProblem(failure, "info", null);
    if (gone && LAST_WORDS.includes(gone.key)) {
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
  let step = "info";
  let shown = info;
  try {
    // the sign info as the server has it now: a proof whose rebuilt answer was lost may have
    // prepared the minting again for this wallet, and the wallet is never asked twice for it
    const fresh = await api.signInfo(code);
    if (!fresh || fresh.kind !== "mint") {
      otherKind();
      return;
    }
    shown = fresh;
    step = "enable";
    const walletApi = await walletApiOf(wallet.key);
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
    const done = element("p", t(tr.MINT_SIGN_DONE));
    done.setAttribute("data-testid", "mint-sign-done");
    done.setAttribute("role", "status");
    show(
      ...header(),
      ...itemNodes(shown.item),
      costNodes(shown),
      changeNodes(shown),
      done
    );
  } catch (failure) {
    const problem = shownProblem(failure, step, wallet.name);
    if (problem !== null) {
      console.warn("the sign page could not sign", failure);
    }
    if (problem !== null && LAST_WORDS.includes(problem.key)) {
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
      problem && LAST_WORDS.includes(problem.key)
        ? null
        : againButton(() => openPage(code))
    );
    return;
  }
  if (!info || info.kind !== "mint") {
    otherKind();
    return;
  }
  const wallets = await waitForWallets();
  if (wallets.length === 0) {
    const alert = alertOf(t(tr.LINK_NO_WALLET, networkLabel(network.name)));
    alert.setAttribute("data-key", "LINK_NO_WALLET");
    show(
      ...header(),
      ...itemNodes(info.item),
      costNodes(info),
      changeNodes(info),
      alert,
      againButton(() => openPage(code))
    );
    return;
  }
  offer(code, info, wallets);
};

start();
