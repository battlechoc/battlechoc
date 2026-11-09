// The link page (plan 3): a phone wallet opens it in its own browser through a CIP-158 deep link
// that the game made for a link code (src/ui/account/WalletDoor.jsx). That browser shares nothing
// with the game, so the code stands for the device's player: the page signs the code's challenge
// with the wallet injected here and tells the player to go back; the game polls the code. Without
// a wallet (or a code) the page is no use and goes to the game: a game whose address was briefly
// this page's (the deep link's tap) lands in the game when it is reloaded.
import "../index.css";
import "./link.css";
import {
  cardano,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { applyLanguage } from "../helper/language.js";
import { createClient } from "../helper/http.js";
import { apiUrl } from "../api/apiUrl.js";
import {
  signWithWallet,
  walletApiOf,
  WalletCancelledError,
  WalletNetworkError,
} from "../cardano/wallet.js";

const WALLET_WAIT_MS = 3000;
const network = cardano.networkOf(import.meta.env.VITE_CARDANO_NETWORK);
const client = createClient({ baseURL: apiUrl, timeout: 15000 });

// the API calls the page needs, none with a token: the code stands for the player
const api = {
  network: async () => (await client.get("/cardano/network")).data.network,
  challengeForCode: async (code, address) =>
    (
      await client.post("/auth/cardano/challenge", {
        purpose: "connect",
        code,
        address,
      })
    ).data,
  verifyForCode: async (body) =>
    (await client.post("/auth/cardano/verify", body)).data,
};

const root = document.getElementById("link");

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

const show = (...nodes) => root.replaceChildren(...nodes);

// the wallets this browser injected (CIP-30): { key, name }
const injected = () => {
  try {
    const wallets = window.cardano || {};
    return Object.keys(wallets)
      .filter(
        (key) => wallets[key] && typeof wallets[key].enable === "function"
      )
      .map((key) => ({ key, name: wallets[key].name || key }));
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

const capitalized = (name) => name.charAt(0).toUpperCase() + name.slice(1);

const messageOf = (failure) => {
  const answer = failure && failure.response;
  const error = answer && answer.data && answer.data.error;
  if (error === "UNKNOWN LINK CODE" || error === "CHALLENGE EXPIRED") {
    return t(tr.LINK_EXPIRED);
  }
  if (error === "IDENTITY TAKEN") {
    return t(tr.WALLET_TAKEN);
  }
  if (failure instanceof WalletNetworkError) {
    return t(tr.WALLET_WRONG_NETWORK, network.name);
  }
  return t(tr.WALLET_FAILED);
};

const offer = (code, wallets, problem) => {
  const nodes = [
    element("h1", t(tr.LINK_TITLE)),
    element("p", t(tr.LINK_TEXT), "warning"),
  ];
  if (problem) {
    const alert = element("p", problem, "error");
    alert.setAttribute("role", "alert");
    nodes.push(alert);
  }
  for (const wallet of wallets) {
    const button = element(
      "button",
      t(tr.LINK_CONTINUE, capitalized(wallet.name))
    );
    // the player taps first: nothing is asked of the wallet before they read the warning
    button.addEventListener("click", () => connect(code, wallet, wallets));
    nodes.push(button);
  }
  show(...nodes);
};

const connect = async (code, wallet, wallets) => {
  root.querySelectorAll("button").forEach((button) => {
    button.disabled = true;
  });
  try {
    const walletApi = await walletApiOf(wallet.key);
    const answer = await signWithWallet(walletApi, "connect", {
      api,
      network,
      code,
    });
    show(
      element("h1", t(tr.LINK_TITLE)),
      element(
        "p",
        t(answer.outcome === "confirm" ? tr.LINK_CONFIRM : tr.LINK_DONE)
      )
    );
  } catch (failure) {
    if (failure instanceof WalletCancelledError) {
      offer(code, wallets);
      return;
    }
    console.warn("the link page could not connect the wallet", failure);
    offer(code, wallets, messageOf(failure));
  }
};

const start = async () => {
  try {
    await applyLanguage(navigator.language);
  } catch {
    // English
  }
  const code = new URLSearchParams(location.search).get("code");
  const wallets = network && code ? await waitForWallets() : [];
  if (wallets.length === 0) {
    location.replace("/");
    return;
  }
  offer(code, wallets);
};

start();
