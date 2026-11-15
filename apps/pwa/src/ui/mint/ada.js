// ADA amounts as the minting flow shows them. The server sends lovelace (a millionth of an ADA)
// as whole numbers: strings in the readiness answer, Numbers in an operation's costs. They are
// summed exactly as BigInt and shown in the player's number format:
// - an estimate (before "Mint now", shown with "about") with at most two decimals, a cost
//   rounded up to the next hundredth, so it never looks smaller than it is (1 lovelace shows as
//   0.01), a balance the player holds rounded down, so it never looks larger;
// - an exact amount (the prepared operation's costs, what the wallet will show) with every
//   decimal it has (up to six, trailing zeros dropped), never rounded.

const LOVELACE_PER_HUNDREDTH = 10000n;
const ROUNDINGS = ["up", "down"];

// an amount of lovelace (a whole, non-negative number, string or BigInt) as a BigInt
const lovelaceOf = (amount) => {
  if (typeof amount === "bigint" && amount >= 0n) {
    return amount;
  }
  if (
    typeof amount === "number" &&
    Number.isSafeInteger(amount) &&
    amount >= 0
  ) {
    return BigInt(amount);
  }
  if (typeof amount === "string" && /^\d+$/.test(amount)) {
    return BigInt(amount);
  }
  throw new TypeError(`not an amount of lovelace: ${String(amount)}`);
};

/** The sum of the lovelace `amounts` (strings, Numbers or BigInts), exact, as a string. */
export const sumLovelace = (...amounts) =>
  amounts.reduce((sum, amount) => sum + lovelaceOf(amount), 0n).toString();

/** `lovelace` rounded up to the next hundredth of an ADA, as a lovelace string ('171234' → '180000'). */
export const roundUpLovelace = (lovelace) => {
  const hundredths =
    (lovelaceOf(lovelace) + LOVELACE_PER_HUNDREDTH - 1n) /
    LOVELACE_PER_HUNDREDTH;
  return (hundredths * LOVELACE_PER_HUNDREDTH).toString();
};

const numberFormat = (language, digits) => {
  const options = { minimumFractionDigits: 0, maximumFractionDigits: digits };
  try {
    return new Intl.NumberFormat(language, options);
  } catch {
    return new Intl.NumberFormat("en", options);
  }
};

// a decimal string of `units` with `digits` decimals ('123', 2 → '1.23'), which Intl formats
// exactly (a Number could not hold every amount)
const decimal = (units, digits) => {
  const scale = 10n ** BigInt(digits);
  return `${units / scale}.${String(units % scale).padStart(digits, "0")}`;
};

/**
 * `lovelace` as ADA in `language`'s number format.
 * - `exact: true`: every decimal it has, up to six, never rounded ('431234' → "0.431234";
 *   '2000000' → "2").
 * - otherwise at most two decimals ('520000' → "0.52", German "0,52"; '1000000' → "1"), with
 *   `round` "up" (the default: costs, what is needed or missing) or "down" (what a wallet holds).
 * A TypeError for anything that is not a whole, non-negative amount, or an unknown rounding.
 */
export const formatAda = (
  lovelace,
  language,
  { round = "up", exact = false } = {}
) => {
  if (!ROUNDINGS.includes(round)) {
    throw new TypeError(`no such rounding: ${round}`);
  }
  const amount = lovelaceOf(lovelace);
  if (exact) {
    return numberFormat(language, 6).format(decimal(amount, 6));
  }
  const hundredths =
    round === "up"
      ? (amount + LOVELACE_PER_HUNDREDTH - 1n) / LOVELACE_PER_HUNDREDTH
      : amount / LOVELACE_PER_HUNDREDTH;
  return numberFormat(language, 2).format(decimal(hundredths, 2));
};

/**
 * What a wallet whose ADA all sits with other tokens is asked to send itself in one payment
 * (lovelace): enough for the security a minting needs on its own (COLLATERAL_LOVELACE, 2 ADA)
 * and the change that comes back from it, with room. (Here, not in the flow: the sign page names
 * it too and must not load the flow.)
 */
export const SELF_SEND_LOVELACE = "5000000";

// a whole, non-negative amount of lovelace (as the server sends it), or null
const amountOrNull = (amount) => {
  try {
    return lovelaceOf(amount);
  } catch {
    return null;
  }
};

/**
 * What the wallet shows for a built minting's `costs` (an operation's: { networkFee, gameFee,
 * deposit, deposits: { reference, user } }, lovelace), as lovelace strings: `give`, what leaves
 * the wallet (the network fee, a battlechoc fee in ADA, and the reference token's deposit, which
 * stays at the items' script), and `stays`, the user token's deposit, which goes with the item
 * to one of the player's own addresses (a CIP-30 wallet shows the net change of its balance, so
 * that ADA is not given). Without `costs.deposits` (an older server), or with parts that do not
 * add up to `deposit`: `give` the whole sum (the deposit as one), `stays` null. A TypeError for
 * amounts that are not lovelace (as sumLovelace).
 */
export const walletChange = (costs) => {
  const fee =
    costs.gameFee && costs.gameFee.asset === "lovelace"
      ? [costs.gameFee.amount]
      : [];
  const parts = costs.deposits || null;
  const reference = parts ? amountOrNull(parts.reference) : null;
  const user = parts ? amountOrNull(parts.user) : null;
  if (
    reference === null ||
    user === null ||
    reference + user !== lovelaceOf(costs.deposit)
  ) {
    return {
      give: sumLovelace(costs.networkFee, costs.deposit, ...fee),
      stays: null,
    };
  }
  return {
    give: sumLovelace(costs.networkFee, reference, ...fee),
    stays: user.toString(),
  };
};
