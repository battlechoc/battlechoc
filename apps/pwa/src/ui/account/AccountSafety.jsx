import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import Dialog from "../dialogs/Dialog";
import SafetyRow, { Pill } from "./SafetyRow";
import TechnicalDetails from "./TechnicalDetails";
import LineIcon from "./LineIcon";
import { shortAddress } from "./safetyState";
import { MINT } from "../lab/itemText";
import {
  getCurrentLanguage,
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
  // a wallet's entry under the wallet row (the owner's mockup, board 4): gold while it holds
  // minted items
  entry: {
    display: "flex",
    flexDirection: "column",
    gap: "0.55em",
    boxSizing: "border-box",
    width: "100%",
    padding: "0.75em",
    borderRadius: 14,
    background: theme.color.secondary.dark,
    border: `2px solid ${theme.color.secondary.light}`,
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    textAlign: "left",
  },
  holding: { borderColor: MINT.gold },
  walletName: { fontWeight: 700, lineHeight: 1.35 },
  walletAddress: {
    display: "block",
    fontWeight: 600,
    color: "#CFE9F7",
    overflowWrap: "anywhere",
  },
  items: {
    display: "flex",
    alignItems: "center",
    gap: "0.5em",
    fontWeight: 700,
  },
  // a gold coin with the stamp's colours
  coin: {
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.75em",
    height: "1.75em",
    boxSizing: "border-box",
    borderRadius: "50%",
    background: MINT.gold,
    border: `2px solid ${MINT.dark}`,
    "& > svg": {
      width: "55%",
      height: "55%",
      fill: "none",
      stroke: MINT.ink,
      strokeWidth: 3,
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
  },
  wait: {
    fontWeight: 600,
    lineHeight: 1.4,
    color: theme.color.gold.light,
  },
  removeNote: {
    padding: "0.6em 0.75em",
    borderRadius: 12,
    background: "#0F2E3F",
    border: `2px solid ${theme.color.secondary.light}`,
    fontWeight: 600,
    lineHeight: 1.45,
  },
  guide: {
    alignSelf: "center",
    display: "flex",
    alignItems: "center",
    minHeight: 44,
    padding: "0 0.5em",
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    color: "#FFE08A",
    "&:hover": { color: "white" },
  },
  error: {
    margin: "0.8em 0 0",
    fontSize: theme.font.size.sm,
    fontWeight: 700,
    color: theme.color.gold.light,
    textAlign: "center",
  },
}));

// the local date and time a wallet's items count from (null for no valid time)
const localTime = (iso) => {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) {
    return null;
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

/**
 * One wallet under the wallet row (plan C): its name, its address and network, its minted
 * items, their wait after a wallet moved from another account, and what removing it does.
 */
const WalletEntry = ({ entry, networkName, classes }) => {
  const time = entry.waitUntil ? localTime(entry.waitUntil) : null;
  return (
    <div
      className={`${classes.entry} ${entry.items > 0 ? classes.holding : ""}`}
      data-testid="wallet-entry"
      data-subject={entry.subject}
    >
      <div className={classes.walletName}>
        {entry.name || t(tr.WALLET_NAME)}
        <span className={classes.walletAddress}>
          {[shortAddress(entry.address), networkName]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {entry.items > 0 ? (
        <div
          className={classes.items}
          data-testid="wallet-items"
          data-count={entry.items}
        >
          <span className={classes.coin} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M8 3h8l-1 8h4v4H5v-4h4z" />
              <path d="M4 20h16" />
            </svg>
          </span>
          {entry.items === 1
            ? t(tr.WALLET_ITEMS_ONE)
            : t(tr.WALLET_ITEMS_COUNT, entry.items)}
        </div>
      ) : null}
      {time ? (
        <div className={classes.wait} data-testid="wallet-wait">
          {t(tr.WALLET_ITEMS_WAIT, time)}
        </div>
      ) : null}
      {entry.items > 0 ? (
        <div className={classes.removeNote} data-testid="wallet-remove-note">
          {t(tr.WALLET_REMOVE_NOTE)}
        </div>
      ) : null}
    </div>
  );
};

/**
 * `open`, `onClose`; `state` from accountSafety(); `network` (the test network's name, null on
 * mainnet); `policyHref`; `passkeyBusy`; `error`; the actions `onBackUp`, `onPasskey`,
 * `onConnectWallet`, `onRemove(subject)` (Disconnect and Remove) and `onAnotherAccount`.
 * `mintMarks` (features.showMintMarks): the wallet row also says what the wallets hold, with
 * `networkName` (the build's network as players read it) and `guideHref` (what a wallet is; no
 * link while it is null, cardano/guide.js).
 */
const AccountSafety = ({
  open,
  onClose,
  state,
  network,
  policyHref,
  mintMarks = false,
  networkName,
  guideHref,
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
              text={
                mintMarks && wallet.describesItems
                  ? t(tr.WALLET_ITEMS_HERE)
                  : undefined
              }
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
          {wallet && mintMarks
            ? wallet.list.map((entry) => (
                <WalletEntry
                  key={entry.subject}
                  entry={entry}
                  networkName={networkName}
                  classes={classes}
                />
              ))
            : null}
          {wallet && mintMarks && guideHref ? (
            <a
              className={classes.guide}
              href={guideHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="wallet-guide"
            >
              {t(tr.WALLET_WHAT_IS)}
            </a>
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
