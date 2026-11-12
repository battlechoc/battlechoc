import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import Dialog from "../dialogs/Dialog";
import SafetyRow, { Pill } from "./SafetyRow";
import TechnicalDetails from "./TechnicalDetails";
import LineIcon from "./LineIcon";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

// "Account safety" (the owner's mockup B, screens 4, 5 and 7, 2026-11-12), opened by "Manage" in
// the profile: how the player gets back into the account on another device. One row per way that
// applies here (recovery words, passkey, Cardano wallet), each with its status and at most one
// action; actions that are not possible are not shown. Addresses and the network sit one tap
// deeper in the technical details. The state comes from accountSafety(), the actions from
// SaveProgress.

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    maxWidth: "30em",
    margin: "12px auto 0",
    fontFamily: theme.font.body,
    color: "white",
  },
  text: {
    margin: "0 0 1em",
    fontSize: theme.font.size.sm,
    lineHeight: 1.4,
    textAlign: "center",
  },
  rows: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6em",
    width: "100%",
  },
  link: {
    display: "flex",
    alignItems: "center",
    gap: "0.35em",
    minHeight: 44,
    padding: "0 0.5em",
    border: 0,
    background: "none",
    color: "white",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: 600,
    textDecoration: "underline",
    cursor: "pointer",
  },
  disclosure: {
    marginTop: "0.6em",
  },
  error: {
    margin: "0.8em 0 0",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    color: theme.color.gold.light,
    textAlign: "center",
  },
}));

/**
 * `open`, `onClose`; `state` from accountSafety(); `network` (the test network's name, null on
 * mainnet); `policyHref`; `passkeyBusy`; `error`; the actions `onBackUp`, `onPasskey`,
 * `onConnectWallet`, `onRemove(subject)` (Disconnect and Remove) and `onAnotherAccount`.
 */
const AccountSafety = ({
  open,
  onClose,
  state,
  network,
  policyHref,
  passkeyBusy,
  error,
  onBackUp,
  onPasskey,
  onConnectWallet,
  onRemove,
  onAnotherAccount,
}) => {
  const classes = useStyles();
  const [details, setDetails] = useState(false);

  // a new opening starts with the details closed
  useEffect(() => {
    if (open) {
      setDetails(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }
  const { words, passkey, wallet, keys } = state;

  let walletStatus = { text: t(tr.WALLET_NOT_CONNECTED), tone: "plain" };
  if (wallet && wallet.count === 1) {
    walletStatus = { text: t(tr.WALLET_CONNECTED), tone: "done" };
  } else if (wallet && wallet.count > 1) {
    walletStatus = {
      text: t(tr.WALLETS_CONNECTED, wallet.count),
      tone: "done",
    };
  }

  return createPortal(
    <Dialog
      open={open}
      close={onClose}
      mode="stacked"
      icon="lock"
      title={t(tr.SAFETY_TITLE)}
    >
      <div className={classes.body} data-testid="account-safety">
        <p className={classes.text}>{t(tr.SAFETY_TEXT)}</p>
        <div className={classes.rows}>
          {words ? (
            <SafetyRow
              testId="safety-words"
              icon="words"
              title={t(tr.RECOVERY_WORDS_NAME)}
              status={
                words.backedUp
                  ? { text: t(tr.WORDS_BACKED_UP), tone: "done" }
                  : { text: t(tr.BACKUP_MISSING), tone: "todo" }
              }
              action={
                <Pill chevron onClick={onBackUp}>
                  {t(tr.BACK_UP)}
                </Pill>
              }
            />
          ) : null}
          {passkey ? (
            <SafetyRow
              testId="safety-passkey"
              icon="passkey"
              title={t(tr.PASSKEY_NAME)}
              status={
                passkey.count > 0
                  ? {
                      text: t(tr.PASSKEYS_SET_UP, passkey.count),
                      tone: "done",
                    }
                  : { text: t(tr.PASSKEY_RECOMMENDED), tone: "todo" }
              }
              action={
                passkey.action ? (
                  <Pill disabled={passkeyBusy} onClick={onPasskey}>
                    {t(
                      passkey.action === "add"
                        ? tr.PASSKEY_ADD
                        : tr.PASSKEY_SET_UP
                    )}
                  </Pill>
                ) : null
              }
            />
          ) : null}
          {wallet ? (
            <SafetyRow
              testId="safety-wallet"
              icon="wallet"
              title={t(tr.WALLET_NAME)}
              status={walletStatus}
              action={
                wallet.action === "disconnect" ? (
                  <Pill
                    variant="outline"
                    onClick={() => onRemove(wallet.subject)}
                  >
                    {t(tr.WALLET_DISCONNECT)}
                  </Pill>
                ) : (
                  <Pill onClick={onConnectWallet}>{t(tr.WALLET_CONNECT)}</Pill>
                )
              }
            />
          ) : null}
        </div>
        {error ? (
          <p className={classes.error} role="alert">
            {error}
          </p>
        ) : null}
        {keys ? (
          <button
            type="button"
            className={`${classes.link} ${classes.disclosure}`}
            aria-expanded={details}
            onClick={() => setDetails(!details)}
          >
            {t(tr.TECHNICAL_DETAILS)}
            <LineIcon name={details ? "up" : "down"} size={0.95} width={2.5} />
          </button>
        ) : null}
        {keys && details ? (
          <TechnicalDetails
            keys={keys}
            network={network}
            policyHref={policyHref}
            onRemove={onRemove}
          />
        ) : null}
        <button
          type="button"
          className={classes.link}
          onClick={onAnotherAccount}
        >
          {t(tr.USE_ANOTHER_ACCOUNT)}
        </button>
      </div>
    </Dialog>,
    document.body
  );
};

export default AccountSafety;
