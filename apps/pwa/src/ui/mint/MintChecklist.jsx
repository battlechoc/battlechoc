import { createUseStyles } from "react-jss";
import { checklistSheet } from "./mintSheets";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { guideLink } from "../../cardano/guide";
import { shortAddress } from "../account/safetyState";
import { MINT_LOOK } from "./mintLook";
import { say } from "./mintText";

// The checklist of the minting dialog (the mockup's "Bereit zum Prägen?"): one line per
// condition of mintFlow's checklist, each with its mark (met, missing, checked later), its title
// and text, and what the player can do about it there.

const useStyles = createUseStyles(checklistSheet);

// the marks of the mockup: met (a green tick), missing (a gold "!"), checked later (a ring)
const Mark = ({ met, className }) => {
  if (met === true) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke={MINT_LOOK.get}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        role="img"
        aria-label={t(tr.MINT_LINE_MET)}
      >
        <path d="M4 12.5l5 5L20 6.5" />
      </svg>
    );
  }
  if (met === false) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke={MINT_LOOK.gold}
        strokeWidth="3"
        strokeLinecap="round"
        role="img"
        aria-label={t(tr.MINT_LINE_UNMET)}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6M12 17h.01" />
      </svg>
    );
  }
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke={MINT_LOOK.soft}
      strokeWidth="3"
      strokeLinecap="round"
      role="img"
      aria-label={t(tr.MINT_LINE_OPEN)}
    >
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
};

// what a line offers: its guide link (none while the guide is not online) and its button
const DOING = {
  connect: {
    guide: "wallet",
    link: "WALLET_WHAT_IS",
    button: "MINT_CHECK_CONNECT",
    testId: "mint-connect",
  },
  getAda: {
    guide: "ada",
    link: "MINT_GET_ADA",
    button: "MINT_RECHECK",
    testId: "mint-line-recheck",
  },
  recheck: { button: "MINT_RECHECK", testId: "mint-line-recheck" },
  goTo: { button: "MINT_TO_ITEM", testId: "mint-goto" },
};

// the lines that are not met first (in their own order), then the others: the reason Continue
// cannot be tapped is the first thing a player reads, at any size
const unmetFirst = (lines) => [
  ...lines.filter((line) => line.met === false),
  ...lines.filter((line) => line.met !== false),
];

/**
 * The checklist's `lines` (mintFlow's checklistOf). `onAction(action, line)`: a line's button
 * ("connect", "getAda" and "recheck": Check again, "goTo"); `onPick(subject)`: a wallet of
 * several; `disabled`: while a request of the flow is out.
 */
const MintChecklist = ({ lines, onAction, onPick, disabled = false }) => {
  const classes = useStyles();
  return (
    <div className={classes.list}>
      {unmetFirst(lines).map((line) => {
        const doing =
          line.met !== true && line.action ? DOING[line.action] : null;
        const href = doing && doing.guide ? guideLink(doing.guide) : null;
        let state = "open";
        if (line.met === true) {
          state = "true";
        } else if (line.met === false) {
          state = "false";
        }
        return (
          <div
            key={line.id}
            className={`${classes.line} ${
              line.met === false ? classes.missing : ""
            } ${line.met === null && !doing ? classes.later : ""}`}
            data-testid="mint-line"
            data-id={line.id}
            data-met={state}
          >
            <div className={classes.head}>
              <Mark met={line.met} className={classes.mark} />
              <div className={classes.words}>
                {say(line.key, line.values)}
                {line.text ? (
                  <span className={classes.text}>
                    {say(line.text, line.values)}
                  </span>
                ) : null}
              </div>
            </div>
            {line.options && line.options.length > 0 ? (
              <div
                className={classes.options}
                role="radiogroup"
                aria-label={t(tr.MINT_CHECK_PICK)}
              >
                {line.options.map((option) => (
                  <label
                    key={option.subject}
                    className={`${classes.option} ${
                      option.picked ? classes.picked : ""
                    }`}
                    data-testid="mint-wallet"
                    data-subject={option.subject}
                    data-picked={option.picked ? "true" : "false"}
                  >
                    <input
                      type="radio"
                      name="mint-wallet"
                      checked={option.picked}
                      disabled={disabled}
                      onChange={() => onPick(option.subject)}
                    />
                    <span>
                      {option.name || t(tr.MINT_YOUR_WALLET)}
                      {option.address ? (
                        <span className={classes.address}>
                          {` · ${shortAddress(option.address)}`}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : null}
            {doing ? (
              <div className={classes.doing}>
                {href ? (
                  <a
                    className={classes.link}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    data-testid="mint-guide"
                    data-guide={doing.guide}
                  >
                    {t(tr[doing.link])}
                  </a>
                ) : null}
                <button
                  type="button"
                  className={classes.pill}
                  disabled={disabled}
                  onClick={() => onAction(line.action, line)}
                  data-testid={doing.testId}
                >
                  {t(tr[doing.button])}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default MintChecklist;
