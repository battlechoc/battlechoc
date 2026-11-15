import { expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { api, ok, say } from "./players.js";
import { openChoclab, statsOf } from "./lab.js";
import { formatAda } from "../../src/ui/mint/ada.js";

// The minting dialog for the browser tests (minting plan D, mint.spec.js): the dialog's steps,
// the item card, ADA as the dialog writes it, the owner's screenshots, the measures of a text's
// lines and a button's text, and the browser contexts a test opened. The players, the chain and
// the game's texts (`say`) are helpers/chain.js's and players.js's.

export const { chain: rules } = createRequire(import.meta.url)(
  "@battlechoc/battlechoc-shared-functions"
);

export { say };

/** `lovelace` as the minting dialog shows ADA in `language` (ui/mint/ada.js formatAda). */
export const adaIn = (language, lovelace, options = {}) =>
  formatAda(lovelace, language, options);

export const PHONE_VIEWPORT = { width: 390, height: 844 };
export const DESKTOP_VIEWPORT = { width: 1280, height: 720 };

// ---------------------------------------------------------------------------------------------
// The owner's screenshots, only when MINT_SHOTS_DIR names a folder (outside the repository):
// `d-<nn>-<name>-<kind>.png` in the flow's order. `kind`: "desktop" (1280×720), "narrow" (the same
// desktop page resized to 390×844: a desktop browser's layout at a phone's width) or "phone" (a
// phone's own context: an Android user agent, touch, 390×844)

const SHOTS_DIR = process.env.MINT_SHOTS_DIR || null;

// every screen in the order a player meets it; a name's place is its number
const FLOW = [
  "card-plain",
  "explain",
  "check",
  "costs",
  "wallet",
  "sign",
  "minting",
  "done",
  "card-minted",
  "shelf-minted",
  "card-minting",
  "shelf-minting",
  "toast-minted",
  "card-signing",
  "card-plain-again",
  "nothing",
  "card-after-no",
  "not-enough-ada",
  "elsewhere",
  "phone-costs",
  "phone-wallet",
  "phone-door",
  "phone-sign",
  "sign-page-before",
  "sign-page-waiting",
  "sign-page-done",
  "phone-minting",
  "phone-done",
  "sign-page-expired",
  "sign-page-no-wallet",
  "answer-lost",
  "answer-lost-minting",
  "addresses-needed",
  "late-answer",
  "second-tab",
  "wrong-network",
  "wallet-offline",
  "rolled-back",
  "paused",
  "limit",
  "chain-off",
  "android-app",
  "fr-costs",
  "fr-wallet",
];

const fileOf = (name, kind) => {
  const index = FLOW.indexOf(name);
  if (index < 0) {
    throw new Error(`shot: ${name} is not in the flow`);
  }
  return path.join(
    SHOTS_DIR,
    `d-${String(index + 1).padStart(2, "0")}-${name}-${kind}.png`
  );
};

/** Two animation frames of `page`: what React rendered is on screen. */
export const settle = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  );

/**
 * Screenshots of `page` as `name` (nothing without MINT_SHOTS_DIR): at the page's own size as
 * `kind` ("desktop" or "phone"); a desktop page also once more at 390×844 as "narrow" (the
 * viewport goes back after it). Animations are stopped (their end state).
 */
export const shot = async (page, name, { kind = "desktop" } = {}) => {
  if (!FLOW.includes(name)) {
    throw new Error(`shot: ${name} is not in the flow`);
  }
  if (!SHOTS_DIR) {
    return;
  }
  mkdirSync(SHOTS_DIR, { recursive: true });
  await settle(page);
  await page.screenshot({ path: fileOf(name, kind), animations: "disabled" });
  if (kind === "desktop") {
    const size = page.viewportSize();
    await page.setViewportSize(PHONE_VIEWPORT);
    await settle(page);
    await settle(page);
    await page.screenshot({
      path: fileOf(name, "narrow"),
      animations: "disabled",
    });
    await page.setViewportSize(size);
    await settle(page);
  }
};

// ---------------------------------------------------------------------------------------------
// The browser contexts a test opened: closed after it, also when it failed (a page left open
// would go on polling into the next test: one worker)

const opened = new Set();

/** Keeps `context` to be closed by closeContexts(); returns it. */
export const keep = (context) => {
  opened.add(context);
  return context;
};

/** Closes every context keep() kept (a spec's afterEach). */
export const closeContexts = async () => {
  const all = [...opened];
  opened.clear();
  await Promise.all(all.map((context) => context.close().catch(() => {})));
};

// ---------------------------------------------------------------------------------------------
// The dialog and the item card

export const mintDialog = (page) => page.getByTestId("mint-dialog");

/** Waits until the minting dialog shows `step` (its data-step). */
export const atStep = (page, step, timeout = 15000) =>
  expect(mintDialog(page)).toHaveAttribute("data-step", step, { timeout });

/** The checklist's line `id` (data-id: chain, matches, wallet, ada, operation, limit). */
export const line = (page, id) =>
  mintDialog(page).locator(`[data-testid=mint-line][data-id=${id}]`);

/** The Choclab from the title screen and its shelf of items. */
export const openShelf = async (page) => {
  await openChoclab(page);
  await page.getByTestId("item-shelf-tab").click();
  await expect(page.getByTestId("item-shelf")).toBeVisible();
};

/** The tile of the item type `itemKey` on the open shelf (any tile without one). */
export const shelfTile = (page, itemKey) =>
  page
    .getByTestId("item-shelf")
    .locator(
      itemKey
        ? `[data-testid=item-tile][data-item="${itemKey}"]`
        : "[data-testid=item-tile]"
    )
    .first();

/** From the title screen to the card of the item type `itemKey` (or the shelf's first). */
export const openItemCard = async (page, itemKey) => {
  await openShelf(page);
  await shelfTile(page, itemKey).click();
  await expect(page.getByTestId("item-card")).toBeVisible();
};

/**
 * From the item card to the wallet step of a first mint, as a player goes: Mint, the
 * explainer's "How it works", Continue on a checklist that is met, Mint now.
 */
export const toWalletStep = async (page) => {
  await page.getByTestId("mint-open").click();
  await atStep(page, "explain");
  await mintDialog(page).getByTestId("mint-how").click();
  await toWalletFromCheck(page);
};

/** From the checklist (met) to the wallet step: Continue, Mint now. */
export const toWalletFromCheck = async (page) => {
  await atStep(page, "check");
  await expect(mintDialog(page).getByTestId("mint-next")).toBeEnabled();
  await mintDialog(page).getByTestId("mint-next").click();
  await atStep(page, "costs");
  await mintDialog(page).getByTestId("mint-now").click();
  await atStep(page, "wallet", 30000);
};

/** Closes the minting dialog with its close button (nothing is cancelled). */
// (the game Dialog: its content holds the dialog's body, beside which sits the close button)
export const closeDialog = (page) =>
  mintDialog(page)
    .locator("xpath=../..")
    .locator("[data-icon=close]")
    .first()
    .click();

/** The item `itemId`'s minted mark in `player`'s stats (GET /user): { state, … } or null. */
export const markOf = async (request, player, itemId) => {
  const entry = (await statsOf(request, player)).items.find(
    (candidate) => candidate.id === itemId
  );
  return entry.minted || null;
};

/** DELETE /chain/operations/:id under `player`'s session (a cancel): the operation's view. */
export const cancelOperation = async (request, { headers }, id) =>
  ok(await request.delete(`${api}/chain/operations/${id}`, { headers }));

// ---------------------------------------------------------------------------------------------
// Measures. A line is the rects whose vertical ranges overlap (by more than half the lower
// one's height), so rects of one line at slightly different tops count once.

/**
 * The game buttons (role=button) inside `scope` with what their text needs: { text, width,
 * height, lines (the line boxes of its text nodes), overflows (its text wider than the button's
 * box, or an element in it scrolling wider than it is) }.
 */
export const buttonMeasures = (scope) =>
  scope.locator("[role=button]").evaluateAll((buttons) => {
    const linesIn = (rects) => {
      const lines = [];
      for (const rect of [...rects].sort((a, b) => a.top - b.top)) {
        const last = lines[lines.length - 1];
        const overlap = last
          ? Math.min(last.bottom, rect.bottom) - Math.max(last.top, rect.top)
          : 0;
        if (
          last &&
          overlap > Math.min(last.bottom - last.top, rect.height) / 2
        ) {
          last.top = Math.min(last.top, rect.top);
          last.bottom = Math.max(last.bottom, rect.bottom);
        } else {
          lines.push({ top: rect.top, bottom: rect.bottom });
        }
      }
      return lines.length;
    };
    return buttons
      .filter((button) => button.offsetParent !== null)
      .map((button) => {
        const box = button.getBoundingClientRect();
        const rects = [];
        const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.textContent.trim() === "") {
            continue;
          }
          const range = document.createRange();
          range.selectNodeContents(node);
          rects.push(
            ...[...range.getClientRects()].filter(
              (rect) => rect.width > 0 && rect.height > 0
            )
          );
        }
        const left = Math.min(...rects.map((rect) => rect.left));
        const right = Math.max(...rects.map((rect) => rect.right));
        let clipped = false;
        for (const node of button.querySelectorAll("*")) {
          if (node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0) {
            clipped = true;
          }
        }
        return {
          text: button.innerText.trim(),
          width: box.width,
          height: box.height,
          lines: linesIn(rects),
          overflows:
            clipped ||
            button.scrollWidth > button.clientWidth + 1 ||
            left < box.left - 1 ||
            right > box.right + 1,
        };
      });
  });

/**
 * How many lines the text `words` takes inside `scope` (the first text node holding it; a
 * no-break space counts as a space): 1 when it stays together, more when the layout breaks it
 * ("Du / bekommst", "10 / Min."), 0 when it is not there.
 */
export const linesOf = (scope, words) =>
  scope.evaluate((root, asked) => {
    const words = asked.replace(/\u00a0/g, " ");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent.replace(/\u00a0/g, " ").indexOf(words);
      if (at < 0) {
        continue;
      }
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + words.length);
      const lines = [];
      const rects = [...range.getClientRects()]
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .sort((a, b) => a.top - b.top);
      for (const rect of rects) {
        const last = lines[lines.length - 1];
        const overlap = last
          ? Math.min(last.bottom, rect.bottom) - Math.max(last.top, rect.top)
          : 0;
        if (
          last &&
          overlap > Math.min(last.bottom - last.top, rect.height) / 2
        ) {
          last.top = Math.min(last.top, rect.top);
          last.bottom = Math.max(last.bottom, rect.bottom);
        } else {
          lines.push({ top: rect.top, bottom: rect.bottom });
        }
      }
      return lines.length;
    }
    return 0;
  }, words);

/**
 * Whether `locator` (a button) is wholly visible without scrolling: its box inside the viewport
 * and inside every ancestor that clips its content (a scrolling area hides what lies past its
 * edge, also when that is still inside the viewport).
 */
export const wholeInView = (locator) =>
  locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const inside = (outer) =>
      box.left >= outer.left - 0.5 &&
      box.top >= outer.top - 0.5 &&
      box.right <= outer.right + 0.5 &&
      box.bottom <= outer.bottom + 0.5;
    if (
      box.width === 0 ||
      !inside({
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
      })
    ) {
      return false;
    }
    for (let up = element.parentElement; up; up = up.parentElement) {
      const style = getComputedStyle(up);
      if (
        [style.overflowX, style.overflowY].some((value) => value !== "visible")
      ) {
        if (!inside(up.getBoundingClientRect())) {
          return false;
        }
      }
    }
    return true;
  });
