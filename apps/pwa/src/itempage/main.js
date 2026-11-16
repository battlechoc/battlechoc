// The public item page (minting plan F): battlechoc.com/item/?a=<asset name>, the address every
// item token's metadata carries for good (chain.itemPageUrl). Whoever holds or is offered a token
// (a buyer on a marketplace, someone sent a link) sees what the item is in the game: its icon
// with the stamp, its name, serial, tier, today's effects, and how to use it. It shows no holder
// (the API answers none), needs no account, no wallet and no service worker, stores nothing (but
// the Android app's mark for the tab, as the game does), and asks no host but its own and the
// API; a footer links the privacy policy. `a` comes from a URL anyone can write: it reaches the API
// only after the API's own format check (view.js isAssetName) and is never shown; everything is
// built with createElement and textContent. No React; a build of its own like the link and sign
// pages (vite.link.config.js), never precached.
import "../index.css";
import "./itempage.css";
import {
  getCurrentLanguage,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { applyLanguage } from "../helper/language.js";
import { createClient } from "../helper/http.js";
import { apiUrl } from "../api/apiUrl.js";
import { isAndroidApp, rememberAndroidApp } from "../cardano/androidApp.js";
import { ICON_LOOK, ICON_SHADOW, STAMP } from "../ui/lab/itemText.js";
import { isAssetName, itemPageView, readAnswer } from "./view.js";

// an answer that takes longer is "could not load right now", with a retry
const TIMEOUT_MS = 10000;
// the item's icon (the owner's mockup: 132 px), and the font size its serial tag is a share of
// (STAMP.tag: 0.9em, the mockup's 18 px)
const SIZE = "132px";
const ICON_FONT = "20px";

const client = createClient({ baseURL: apiUrl, timeout: TIMEOUT_MS });
const root = document.getElementById("item");
// whether the page runs in the Android app (start() knows it): nothing of the chain there
let inAndroidApp = false;

const element = (tag, text, className, testId) => {
  const node = document.createElement(tag);
  if (text) {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  if (testId) {
    node.setAttribute("data-testid", testId);
  }
  return node;
};

// a style object of itemText.js (React's form: numbers in px but for these) on a DOM node
const UNITLESS = new Set(["lineHeight", "opacity", "zIndex", "fontWeight"]);
const styled = (node, style) => {
  for (const [name, value] of Object.entries(style)) {
    node.style[name] =
      typeof value === "number" && !UNITLESS.has(name)
        ? `${value}px`
        : String(value);
  }
  return node;
};

// The state's nodes in the page. A result's heading takes the focus, so a screen reader reads
// what arrived (and a retry's result too); the loading state says only that it is busy.
const show = (state, ...nodes) => {
  root.setAttribute("data-state", state);
  root.setAttribute("aria-busy", String(state === "loading"));
  root.replaceChildren(...nodes);
  const heading = root.querySelector("h1");
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
};

const picture = (src, className, style) => {
  const image = styled(element("img", null, className), {
    position: "absolute",
    ...style,
  });
  image.alt = "";
  image.decoding = "async";
  image.src = src;
  return image;
};

// a circle over the whole icon (the stamp's ring, the rim of an item that is gone): ItemIcon's RIM
const rim = (style, testId) =>
  styled(element("span", null, "rim", testId), {
    position: "absolute",
    inset: 0,
    boxSizing: "border-box",
    borderRadius: "50%",
    pointerEvents: "none",
    ...style,
  });

/**
 * The item's icon as the game draws it (ItemIcon.jsx), from the game's own parts (view.icon):
 * a neutral circle while loading (`view` null); for a minted item the face in its tier's fill,
 * its building, the stamp (STAMP.ring instead of the tier ring), its badge and the serial tag
 * below (STAMP.tag); for a salvaged one the look of an item that is gone (STAMP.away: a dark face,
 * a light dashed rim, a grey building, no badge). The room the tag needs stays below every icon,
 * so nothing moves when the item arrives.
 */
const iconNode = (view) => {
  const icon = styled(element("div", null, "icon"), {
    width: SIZE,
    height: SIZE,
    fontSize: ICON_FONT,
    marginBottom: STAMP.tagRoom(SIZE),
  });
  if (!view) {
    icon.classList.add("waiting");
    return icon;
  }
  const minted = view.state === "item";
  styled(icon, {
    background: minted ? view.icon.face : STAMP.away.face,
    boxShadow: minted ? "none" : ICON_SHADOW,
  });
  const building = picture(view.icon.building, "building", {
    ...ICON_LOOK.picture,
    filter: minted ? "none" : STAMP.away.picture,
  });
  building.setAttribute("data-testid", "item-building-picture");
  icon.append(building);
  if (!minted) {
    icon.append(rim({ border: STAMP.away.rim(SIZE) }, "item-away-rim"));
    return icon;
  }
  icon.append(
    rim(STAMP.ring(SIZE), "item-ring"),
    picture(view.icon.badge, "badge", ICON_LOOK.badge),
    styled(element("span", view.tag, "tag", "item-tag"), STAMP.tag(SIZE))
  );
  return icon;
};

// serial · tier · points on one line (never broken), the day it was minted on the next (it may
// wrap on a narrow screen): no line begins or ends with a separator
const lineNode = (view) => {
  const line = element("p", null, "line", "item-line");
  line.append(
    element("span", view.facts.join(" · "), "part"),
    element("span", view.mintedOn, "part")
  );
  return line;
};

const box = (heading, testId) => {
  const node = element("section", null, "box", testId);
  node.append(element("h2", heading));
  return node;
};

const playLink = (className = "button") => {
  const link = element("a", t(tr.ITEM_PAGE_PLAY), className, "item-play");
  link.href = "/";
  return link;
};

// a short neutral state: the empty circle where the item's goes, and two bars for its name and line
const showLoading = () => {
  const circle = iconNode(null);
  circle.setAttribute("data-testid", "item-loading");
  show(
    "loading",
    circle,
    element("div", null, "skeleton name-skeleton"),
    element("div", null, "skeleton line-skeleton")
  );
};

const showItem = (view) => {
  const minted = view.state === "item";
  const nodes = [
    iconNode(view),
    element("h1", view.title, "name", "item-name"),
    lineNode(view),
  ];
  if (!minted) {
    nodes.push(
      element("p", t(tr.ITEM_PAGE_SALVAGED), "notice", "item-salvaged")
    );
  }
  const effects = box(t(tr.ITEM_PAGE_EFFECTS), "item-effects");
  for (const effect of view.effects) {
    const line = element(
      "p",
      effect.text,
      `effect ${effect.good ? "good" : "bad"}`,
      "item-effect"
    );
    line.setAttribute("data-good", String(effect.good));
    effects.append(line);
  }
  effects.append(
    element("p", view.building, "note", "item-building"),
    element("p", t(tr.ITEM_PAGE_EFFECTS_CHANGE), "note", "item-effects-change")
  );
  nodes.push(effects);
  // how to use it means connecting a wallet, which the Android app does not offer
  if (minted && !inAndroidApp) {
    const how = box(t(tr.ITEM_PAGE_HOW), "item-how");
    how.append(element("p", t(tr.ITEM_PAGE_HOW_TEXT), "text"));
    nodes.push(how);
  }
  nodes.push(
    playLink(),
    element("p", t(tr.ITEM_PAGE_NO_OWNER), "note", "item-no-owner")
  );
  show(view.state, ...nodes);
  document.title = `${view.title} · battlechoc`;
};

const showUnknown = () => {
  document.title = "battlechoc";
  show(
    "unknown",
    element("h1", t(tr.ITEM_PAGE_UNKNOWN), "message", "item-unknown"),
    playLink()
  );
};

// no answer, a limit, a failure, an answer this page cannot read: nothing about the item
const showUnavailable = (retry) => {
  document.title = "battlechoc";
  const again = element("button", t(tr.MINT_AGAIN), "button", "item-retry");
  again.type = "button";
  again.addEventListener("click", retry);
  show(
    "unavailable",
    element("h1", t(tr.ITEM_PAGE_UNAVAILABLE), "message", "item-unavailable"),
    again,
    playLink("button secondary")
  );
};

// what the API says about `assetName` (readAnswer's outcome); never throws
const ask = async (assetName) => {
  try {
    const { status, data } = await client.get(`/items/${assetName}`);
    return readAnswer(status, data);
  } catch (error) {
    const { response } = error;
    return response
      ? readAnswer(response.status, response.data)
      : readAnswer(undefined, undefined);
  }
};

// the outcome on the page; anything that cannot be shown (it should not happen: readAnswer let it
// through) is "could not load right now", never a page left loading
const render = (outcome, retry) => {
  try {
    if (outcome.kind === "item") {
      showItem(
        itemPageView(outcome.answer, { language: getCurrentLanguage() })
      );
      return;
    }
    if (outcome.kind === "unknown") {
      showUnknown();
      return;
    }
  } catch {
    // falls through to "could not load"
  }
  showUnavailable(retry);
};

const load = async (assetName) => {
  showLoading();
  render(await ask(assetName), () => load(assetName));
};

// the privacy policy, in the section of the reader's language (German, else English)
const showFooter = () => {
  const foot = document.querySelector("[data-foot]");
  if (!foot) {
    return;
  }
  const link = element("a", t(tr.INFO_PRIVACY_POLICY), null, "item-privacy");
  link.href = `/privacy-policy/#${getCurrentLanguage() === "de" ? "de" : "en"}`;
  foot.replaceChildren(link);
};

const start = async () => {
  // A link to this page opened on a phone with the Android app (TWA) starts the app here, not
  // at its start address: the app's mark is remembered for the tab, so the game behind "Play
  // battlechoc" knows it too (boot.js does the same at the game's start).
  inAndroidApp =
    rememberAndroidApp({
      search: location.search,
      referrer: document.referrer,
      storage: () => window.sessionStorage,
    }) || isAndroidApp(() => window.sessionStorage);
  const where = document.querySelector("[data-where]");
  if (where) {
    where.textContent = `${window.location.host}/item`;
  }
  showLoading();
  const assetName = new URLSearchParams(window.location.search).get("a");
  // the language's texts and the item at the same time; the page shows once both are there
  const [, outcome] = await Promise.all([
    applyLanguage(navigator.language).catch(() => {
      // the language's texts did not load: English stays
    }),
    isAssetName(assetName) ? ask(assetName) : { kind: "unknown" },
  ]);
  showFooter();
  render(outcome, () => load(assetName));
};

start();
