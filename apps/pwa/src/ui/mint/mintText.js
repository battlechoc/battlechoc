// The minting dialog's texts from the flow's keys and values (mintFlow.js): values by
// placeholder name, ADA amounts as lovelace (shownValues formats them in the player's language),
// `wallet` null as "your wallet", `time` an ISO time shown in the player's local time, `item` an
// item key shown by its name, `address` shortened. Every text goes through translate.
import {
  getCurrentLanguage,
  placeholdersOf,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { itemName } from "../lab/itemText";
import { shortAddress } from "../account/safetyState";
import { shownValues } from "./mintFlow";

// an ISO time in the player's language and time zone (as Account safety shows a wallet's wait)
const localTime = (iso) => {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) {
    return iso;
  }
  try {
    return time.toLocaleString(getCurrentLanguage(), {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return time.toLocaleString();
  }
};

/** The text of `key` with `values` (by placeholder name), in the current language. */
export const say = (key, values = {}) => {
  if (!key || !tr[key]) {
    return "";
  }
  let shown;
  try {
    shown = shownValues(values, getCurrentLanguage(), {
      wallet: t(tr.MINT_YOUR_WALLET),
    });
  } catch {
    // an amount an older API sent in another form: the text without it
    shown = { ...values };
  }
  if (typeof shown.time === "string") {
    shown.time = localTime(shown.time);
  }
  if (typeof shown.address === "string") {
    shown.address = shortAddress(shown.address);
  }
  if (typeof shown.item === "string") {
    shown.item = itemName(shown.item);
  }
  return t(tr[key], ...placeholdersOf(key).map((name) => shown[name]));
};
