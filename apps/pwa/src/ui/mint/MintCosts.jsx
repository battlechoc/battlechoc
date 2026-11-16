import { createUseStyles } from "react-jss";
import { costsSheet } from "./mintSheets";
import {
  getCurrentLanguage,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { formatAda } from "./ada";
import { costRows } from "./mintFlow";

// What minting costs (the mockup's "Was es kostet"): three rows, each with where the amount goes
// and how much it is: the network fee, the battlechoc fee (none without fee options) and the
// deposit (mintFlow's costRows). Before Mint now the network fee and the deposit are estimates
// ("≈", rounded up); after it they are the prepared operation's, with every decimal. The
// battlechoc fee is the config's amount, exact either way; in another asset it is shown in it.

const useStyles = createUseStyles(costsSheet);

// an amount of `unit` as the row shows it: exact with every decimal, else "≈"; nothing for an
// amount an older API sent in another form
const amountText = (amount, { ada, exact, unit }) => {
  let shown;
  try {
    if (!ada) {
      shown = String(BigInt(amount));
    } else {
      shown = formatAda(amount, getCurrentLanguage(), exact ? { exact } : {});
    }
  } catch {
    return "";
  }
  return exact || !ada
    ? t(tr.MINT_AMOUNT, shown, unit)
    : t(tr.MINT_ABOUT, shown, unit);
};

/**
 * The cost rows of `costs` (mintFlow's costsOf: lovelace strings, `exact`; null: nothing to
 * show yet). `choice` (feeChoice) with the picked option's config index `fee` and
 * `onPickFee(fee)` offer the battlechoc fee's options when there are two or more.
 */
const MintCosts = ({ costs, choice, fee, onPickFee, disabled = false }) => {
  const classes = useStyles();
  if (!costs) {
    return null;
  }
  const rows = costRows(costs);
  const picked =
    choice && choice.show
      ? choice.options.find((option) => option.fee === fee) || choice.options[0]
      : null;
  return (
    <>
      {picked ? (
        <div
          className={classes.choice}
          role="radiogroup"
          aria-labelledby="mint-fee-pick"
        >
          <span id="mint-fee-pick">{t(tr.MINT_FEE_PICK)}</span>
          {choice.options.map((option) => (
            <label
              key={option.fee}
              className={`${classes.option} ${
                option === picked ? classes.picked : ""
              }`}
              data-testid="mint-fee"
              data-fee={option.fee}
              data-picked={option === picked ? "true" : "false"}
            >
              <input
                type="radio"
                name="mint-fee"
                checked={option === picked}
                disabled={disabled}
                onChange={() => onPickFee(option.fee)}
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
      <div className={classes.rows}>
        {rows.map((row) => (
          <div
            key={row.kind}
            className={classes.row}
            data-testid="mint-cost"
            data-kind={row.kind}
            data-exact={row.exact ? "true" : "false"}
          >
            <div className={classes.words}>
              <span className={classes.name}>{t(tr[row.name])}</span>
              {t(tr[row.text])}
            </div>
            <div className={classes.amount}>
              {amountText(row.amount, {
                ada: row.ada,
                exact: row.exact,
                unit: row.unit,
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

export default MintCosts;
