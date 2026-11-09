import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import {
  ConnectWalletList,
  useCardano,
} from "@cardano-foundation/cardano-connect-with-wallet";
import {
  generateCip158DeepLink,
  getWalletConfig,
  NetworkType,
  UnavailableWalletVisibility,
  WrongNetworkTypeError,
} from "@cardano-foundation/cardano-connect-with-wallet-core";
import Dialog from "../dialogs/Dialog";
import Button from "../controls/Button";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import {
  cardanoApi,
  confirmWithWallet,
  connectWallet,
  features,
  linkPageUrl,
  waitForCode,
  walletApiOf,
  WalletCancelledError,
  WalletNetworkError,
} from "../../cardano";
import { createAttempts } from "../../cardano/wallet";
import { account } from "../../api/account";
import theme from "../../theme";
import logger from "../../helper/logger";
import { openDeepLink } from "../../testHooks";

// The wallet door (plan 3): the Cardano Foundation's ConnectWalletList in a game dialog. It lists
// the injected wallets (extensions, or the wallet of a phone wallet's own browser), the QR code
// for a phone wallet (CIP-45) and, on phones, the wallets a deep link opens (CIP-158). The
// signing is ours (cardano/wallet.js). `purpose`: "connect" (unknown wallet → linked, known →
// a session), "link" (link only), "confirm" (a proof for a key change). `onDone(answer)` gets the
// server's answer ({ outcome, … }, or { confirmToken }); every failure leaves the account as it was.
// It is loaded only when it opens (React.lazy): the component, peer-connect and styled-components
// stay out of the first load.

const useStyles = createUseStyles((theme) => ({
  body: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    marginTop: 16,
  },
  text: {
    fontFamily: theme.font.body,
    fontSize: theme.font.size.sm,
    color: "white",
    textAlign: "center",
    maxWidth: "28em",
    margin: "0 auto 0.8em",
  },
  error: {
    fontWeight: 700,
    color: theme.color.gold.light,
  },
  list: {
    display: "flex",
    justifyContent: "center",
    width: "min(20em, 100%)",
    margin: "0 auto",
  },
}));

// the component's look, in the game's colours and fonts
const LIST_CSS = `
  font-family: var(--font-body);
  & > span, & > button, & > div {
    font-family: var(--font-body);
  }
`;
// the QR dialog of the component opens above the game's dialogs
const QR_CSS = "z-index: 10000; font-family: var(--font-body);";

// the wallets the list may show: the registry's (the component's default leaves out Vespr, Begin
// and Gero) and whatever this browser injected (a wallet's own browser on a phone)
const REGISTRY_WALLETS = [
  "eternl",
  "lace",
  "vespr",
  "begin",
  "yoroi",
  "nufi",
  "typhoncip30",
  "gerowallet",
  "flint",
  "nami",
];
const supportedWallets = () => {
  let injected = [];
  try {
    const wallets = window.cardano || {};
    injected = Object.keys(wallets).filter(
      (key) => wallets[key] && typeof wallets[key].enable === "function"
    );
  } catch {
    // none
  }
  return [...new Set([...REGISTRY_WALLETS, ...injected])];
};

const injectedWallets = () => {
  try {
    const wallets = window.cardano || {};
    return Object.keys(wallets).some(
      (key) => wallets[key] && typeof wallets[key].enable === "function"
    );
  } catch {
    return false;
  }
};

// the server's answer for a link code's final state, as the direct way gives it
const answerOfCode = (state) => {
  if (state.state === "linked") {
    return { outcome: "linked", identity: state.identity };
  }
  if (state.state === "known") {
    const { playerId, refreshToken, accessToken, expiresIn } = state;
    return { outcome: "known", playerId, refreshToken, accessToken, expiresIn };
  }
  return { outcome: state.state, error: state.error };
};

const WalletDoor = ({
  open,
  purpose = "connect",
  confirmToken,
  onClose,
  onDone,
}) => {
  const classes = useStyles();
  const network = features.network();
  const limitNetwork =
    network && network.name === "mainnet"
      ? NetworkType.MAINNET
      : NetworkType.TESTNET;
  const { disconnect } = useCardano({ limitNetwork });
  const [error, setError] = useState(null);
  const [waiting, setWaiting] = useState(false);
  const [code, setCode] = useState(null);
  // the QR code for a phone wallet (CIP-45) only once asked for: the component connects to the
  // public PeerJS server as soon as it shows that way in (privacy policy, section 11)
  const [qr, setQr] = useState(false);
  const list = useRef(null);

  // the component's own entry for it ("P2P Wallet") opens the QR code: tapped for the player
  useEffect(() => {
    if (!qr) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      const entry = [
        ...(list.current ? list.current.querySelectorAll("*") : []),
      ]
        .reverse()
        .find((node) => (node.textContent || "").trim() === "P2P Wallet");
      if (entry) {
        entry.click();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [qr]);
  const attempts = useRef(createAttempts());
  const polling = useRef(null);

  // the door is gone: late answers are dropped, and the QR code's peer (CIP-45), which the
  // component never ends, does not hand its id to the next door (a new one is made)
  useEffect(
    () => () => {
      attempts.current.close();
      try {
        window.localStorage.removeItem("peer-connect-dapp-id");
      } catch {
        // nothing kept, nothing to drop
      }
    },
    []
  );
  const paths = features.walletPaths({ injected: injectedWallets() });
  const deeplink = paths.has("deeplink") && purpose !== "confirm";

  // the game does not keep the wallet connected: the core remembers the last one otherwise
  const forget = () => {
    try {
      disconnect();
    } catch (failure) {
      logger.info("could not disconnect the wallet", failure);
    }
  };

  const fail = (failure) => {
    if (
      failure instanceof WalletCancelledError ||
      (failure && failure.name === "AbortError")
    ) {
      return;
    }
    const answer = failure && failure.response;
    const code = answer && answer.data && answer.data.error;
    if (
      failure instanceof WalletNetworkError ||
      failure instanceof WrongNetworkTypeError
    ) {
      setError(t(tr.WALLET_WRONG_NETWORK, network ? network.name : ""));
    } else if (code === "IDENTITY TAKEN") {
      setError(t(tr.WALLET_TAKEN));
    } else {
      logger.warn("the wallet door failed", failure);
      setError(t(tr.WALLET_FAILED));
    }
  };

  const finish = (answer) => {
    if (answer.outcome === "failed") {
      setError(
        t(
          answer.error === "IDENTITY TAKEN" ? tr.WALLET_TAKEN : tr.WALLET_FAILED
        )
      );
      return;
    }
    onDone(answer);
  };

  // a wallet the component connected (an extension, or a phone wallet by QR code); an answer
  // that comes after the door closed or after a newer tap does nothing (a known wallet's session
  // made for it is ended again)
  const withWallet = async (walletName) => {
    const attempt = attempts.current.start();
    if (!attempts.current.isCurrent(attempt)) {
      return;
    }
    setError(null);
    try {
      const walletApi = await walletApiOf(walletName);
      const answer =
        purpose === "confirm"
          ? { confirmToken: await confirmWithWallet(walletApi) }
          : await connectWallet(walletApi, { purpose, confirmToken });
      if (attempts.current.isCurrent(attempt)) {
        finish(answer);
      } else if (answer.outcome === "known") {
        account
          .logout(answer.refreshToken)
          .catch((failure) =>
            logger.warn("could not end a late session", failure)
          );
      }
    } catch (failure) {
      if (!attempts.current.isCurrent(attempt)) {
        return;
      }
      const answer = failure && failure.response;
      if (
        answer &&
        answer.status === 403 &&
        answer.data &&
        answer.data.error === "CONFIRMATION REQUIRED"
      ) {
        onDone({ outcome: "confirm" });
      } else {
        fail(failure);
      }
    } finally {
      forget();
    }
  };

  // on a phone: a link code for the link page that the wallet's own browser opens
  useEffect(() => {
    if (!open || !deeplink) {
      return undefined;
    }
    let gone = false;
    cardanoApi
      .createLinkCode(purpose, confirmToken)
      .then((made) => !gone && setCode(made.code))
      .catch((failure) => !gone && fail(failure));
    return () => {
      gone = true;
      setCode(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deeplink, purpose, confirmToken]);

  // the door closes: no more polling
  useEffect(() => {
    if (!open) {
      if (polling.current) {
        polling.current.abort();
        polling.current = null;
      }
      setWaiting(false);
      setError(null);
    }
    return () => polling.current && polling.current.abort();
  }, [open]);

  const waitForPhone = () => {
    if (polling.current || code === null) {
      return;
    }
    const controller = new AbortController();
    polling.current = controller;
    setWaiting(true);
    waitForCode(code, { signal: controller.signal })
      .then((state) => finish(answerOfCode(state)))
      .catch(fail)
      .finally(() => {
        if (polling.current === controller) {
          polling.current = null;
        }
        setWaiting(false);
      });
  };

  // On a phone, a tap on a CIP-158 wallet opens the link page with the code in the wallet's own
  // browser (that browser shares nothing with the game). The deep link is the same for every
  // wallet (the phone picks the app), so the door opens it itself: the component's own link would
  // carry the game's address. Other wallets are left to the component (their store pages).
  const tapDeepLink = (event) => {
    if (!deeplink || code === null) {
      return;
    }
    for (
      let node = event.target;
      node && node !== event.currentTarget;
      node = node.parentElement
    ) {
      const config = getWalletConfig(
        (node.textContent || "").trim().toLowerCase()
      );
      if (config) {
        if (config.hasCIP158Support) {
          event.preventDefault();
          event.stopPropagation();
          openDeepLink(generateCip158DeepLink(linkPageUrl(code)));
          waitForPhone();
        }
        return;
      }
    }
  };

  if (!open) {
    return null;
  }
  // on a phone the list waits for the link code (without one a tap would lead nowhere)
  const nothing = paths.size === 0 || (deeplink && code === null);
  return createPortal(
    <Dialog
      open={open}
      close={onClose}
      closable
      mode="stacked"
      icon="user"
      title={t(tr.WALLET_DOOR_TITLE)}
    >
      <div className={classes.body} data-testid="wallet-door">
        <p className={classes.text}>{t(tr.WALLET_DOOR_TEXT)}</p>
        {paths.size === 0 ? (
          <p className={classes.text}>{t(tr.WALLET_NONE)}</p>
        ) : null}
        {!nothing ? (
          <div className={classes.list} ref={list} onClickCapture={tapDeepLink}>
            <ConnectWalletList
              key={qr ? "with-qr" : "without-qr"}
              limitNetwork={limitNetwork}
              peerConnectEnabled={paths.has("qr") && qr}
              cip158Enabled={deeplink}
              showUnavailableWallets={
                deeplink
                  ? UnavailableWalletVisibility.SHOW_UNAVAILABLE_ON_MOBILE
                  : UnavailableWalletVisibility.HIDE_UNAVAILABLE
              }
              dAppName="battlechoc"
              dAppUrl={location.origin}
              peerConnectSubtitle={t(tr.WALLET_QR_TEXT)}
              peerConnectCustomCSS={QR_CSS}
              primaryColor={theme.color.secondary.dark}
              borderRadius={12}
              customCSS={LIST_CSS}
              onConnect={withWallet}
              supportedWallets={supportedWallets()}
              onConnectError={(walletName, failure) => {
                forget();
                fail(failure);
              }}
            />
          </div>
        ) : null}
        {!nothing && paths.has("qr") && !qr ? (
          <Button color="secondary" size="small" onClick={() => setQr(true)}>
            {t(tr.WALLET_QR)}
          </Button>
        ) : null}
        {waiting ? (
          <p className={classes.text}>{t(tr.WALLET_WAITING)}</p>
        ) : null}
        {error ? (
          <p className={`${classes.text} ${classes.error}`} role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>,
    document.body
  );
};

export default WalletDoor;
