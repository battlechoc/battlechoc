import { createUseStyles } from "react-jss";
import { Pill } from "./SafetyRow";
import { shortAddress } from "./safetyState";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// The technical details of Account safety (the owner's mockup B, screen 5, 2026-11-12): for
// players who know Cardano, one tap deeper and labelled: the test network (on preprod), every
// linked key's address with Remove while more than one is linked, and the privacy policy's
// section about what battlechoc stores on Cardano. Not in the Android app.

const useStyles = createUseStyles((theme) => ({
  box: {
    display: "flex",
    flexDirection: "column",
    gap: "1em",
    boxSizing: "border-box",
    width: "100%",
    padding: "0.9em",
    borderRadius: 14,
    background: "rgba(0, 0, 0, 0.24)",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    lineHeight: 1.45,
    color: "white",
    textAlign: "left",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35em",
  },
  label: {
    fontSize: theme.font.size.xs,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "rgba(255, 255, 255, 0.78)",
  },
  key: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "0.6em",
  },
  address: {
    fontFamily: "ui-monospace, Menlo, monospace",
    overflowWrap: "anywhere",
  },
  note: {
    color: "rgba(255, 255, 255, 0.85)",
  },
  link: {
    alignSelf: "flex-start",
    color: "white",
    fontWeight: 600,
    "&:hover": { color: theme.color.gold.light },
  },
}));

/**
 * `keys` (accountSafety's keys: { subject, address, kind, removable }), `network` (the test
 * network's name, or null on mainnet), `policyHref`, and `onRemove(subject)`.
 */
const TechnicalDetails = ({ keys, network, policyHref, onRemove }) => {
  const classes = useStyles();
  return (
    <div className={classes.box} data-testid="technical-details">
      {network ? (
        <div className={classes.section}>
          <span className={classes.label}>{t(tr.DETAILS_NETWORK)}</span>
          <span>{t(tr.DETAILS_TEST_NETWORK, network)}</span>
        </div>
      ) : null}
      {keys.map((key) => (
        <div key={key.subject} className={classes.section}>
          <span className={classes.label}>
            {t(
              key.kind === "words" ? tr.ADDRESS_OF_WORDS : tr.ADDRESS_OF_WALLET
            )}
          </span>
          <div className={classes.key}>
            <code className={classes.address} title={key.address}>
              {shortAddress(key.address)}
            </code>
            {key.removable ? (
              <Pill
                variant="danger"
                aria-label={`${t(tr.LINKED_KEY_REMOVE)} ${shortAddress(key.address)}`}
                onClick={() => onRemove(key.subject)}
              >
                {t(tr.LINKED_KEY_REMOVE)}
              </Pill>
            ) : null}
          </div>
          {key.removable && key.kind === "words" ? (
            <span className={classes.note}>{t(tr.REMOVE_WORDS_NOTE)}</span>
          ) : null}
        </div>
      ))}
      <a
        className={classes.link}
        href={policyHref}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t(tr.CARDANO_POLICY_LINK)}
      </a>
    </div>
  );
};

export default TechnicalDetails;
