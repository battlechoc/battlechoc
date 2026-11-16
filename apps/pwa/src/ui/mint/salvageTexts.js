// The salvage of a minted item (plan E) shares the minting's failure table (mintFlow.js
// problemOf, the sign page's messages.js), whose texts name minting where it matters ("Minting
// needs …", "the minting may still go through"). The salvage never shows a minting sentence: each
// such key has its salvage variant here, and the salvage shows `salvageKey(key)` where the minting
// would show `key`. A key not listed says nothing of minting and is shown as it is. No React, no
// other import: the dialog and the sign page both load it.

const VARIANTS = Object.freeze({
  MINT_ADDRESS_UNSUPPORTED: "SALVAGE_ADDRESS_UNSUPPORTED",
  MINT_ADDRESSES_NEEDED: "SALVAGE_ADDRESSES_NEEDED",
  MINT_ANSWER_LOST: "SALVAGE_ANSWER_LOST",
  MINT_BAD_SIGNATURE: "SALVAGE_BAD_SIGNATURE",
  MINT_CANCEL_ANSWER_LOST: "SALVAGE_CANCEL_ANSWER_LOST",
  MINT_CANCEL_TOO_LATE: "SALVAGE_CANCEL_TOO_LATE",
  MINT_CHECK_ELSEWHERE_TEXT: "SALVAGE_ELSEWHERE_TEXT",
  MINT_CHECK_ELSEWHERE_TEXT_NAMELESS: "SALVAGE_ELSEWHERE_TEXT_NAMELESS",
  MINT_CHECK_WAITING_TEXT: "SALVAGE_WALLET_WAITING",
  MINT_EXPIRED: "SALVAGE_EXPIRED",
  MINT_FAILED_TITLE: "SALVAGE_FAILED_TITLE",
  MINT_ITEM_GONE: "SALVAGE_GONE",
  MINT_NO_COLLATERAL: "SALVAGE_NO_COLLATERAL",
  MINT_NOT_OPEN: "SALVAGE_NOT_OPEN",
  MINT_NOT_TAKEN: "SALVAGE_NOT_TAKEN",
  MINT_OFF: "SALVAGE_OFF",
  MINT_OTHER_WALLET: "SALVAGE_OTHER_WALLET",
  MINT_OWNER_NOT_CONFIRMED: "SALVAGE_OWNER_NOT_CONFIRMED",
  MINT_PROOF_REFUSED: "SALVAGE_PROOF_REFUSED",
  MINT_RESUME_LOST: "SALVAGE_RESUME_LOST",
  MINT_SIGN_BAD_SIGNATURE: "SALVAGE_SIGN_BAD_SIGNATURE",
  MINT_SIGN_NOT_OPEN: "SALVAGE_SIGN_NOT_OPEN",
  MINT_SIGN_PHONE: "SALVAGE_SIGN_PHONE",
  MINT_SIGN_START_AGAIN: "SALVAGE_SIGN_START_AGAIN",
  MINT_SIGN_TWICE: "SALVAGE_SIGN_TWICE",
  MINT_SIGNED_UNHEARD: "SALVAGE_SIGNED_UNHEARD",
  MINT_STATUS_TITLE: "SALVAGE_STATUS_TITLE",
  MINT_STATUS_UNKNOWN: "SALVAGE_STATUS_UNKNOWN",
  MINT_WALLET_TEXT_UNCONFIRMED: "SALVAGE_WALLET_TEXT_UNCONFIRMED",
  MINT_WALLET_TOO_FULL: "SALVAGE_WALLET_TOO_FULL",
  MINT_WAS_CANCELLED: "SALVAGE_WAS_CANCELLED",
});

/** The keys of minting's texts that have a salvage variant, each with it. */
export const SALVAGE_VARIANTS = VARIANTS;

/** The key the salvage shows where the minting would show `key`. */
export const salvageKey = (key) =>
  Object.prototype.hasOwnProperty.call(VARIANTS, key) ? VARIANTS[key] : key;
