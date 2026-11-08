import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createUseStyles } from "react-jss";
import {
  ConnectWalletList,
  useCardano,
} from "@cardano-foundation/cardano-connect-with-wallet";
import {
  NetworkType,
  UnavailableWalletVisibility,
  WrongNetworkTypeError,
} from "@cardano-foundation/cardano-connect-with-wallet-core";
import Dialog from "../dialogs/Dialog";
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
import theme from "../../theme";
import logger from "../../helper/logger";

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
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [code, setCode] = useState(null);
  const running = useRef(false);
  const polling = useRef(null);
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

  // a wallet the component connected (an extension, or a phone wallet by QR code)
  const withWallet = async (walletName) => {
    if (running.current) {
      return;
    }
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const walletApi = await walletApiOf(walletName);
      if (purpose === "confirm") {
        finish({ confirmToken: await confirmWithWallet(walletApi) });
      } else {
        finish(await connectWallet(walletApi, { purpose, confirmToken }));
      }
    } catch (failure) {
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
      running.current = false;
      setBusy(false);
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

  // The component's CIP-158 link opens the page's own address in the wallet's browser: for the
  // tap, the address is the link page with the code (that browser shares nothing with the game),
  // then the game's own address again.
  const pointLinkToCode = () => {
    if (!deeplink || code === null) {
      return;
    }
    const own = `${location.pathname}${location.search}${location.hash}`;
    const link = new URL(linkPageUrl(code));
    history.replaceState(history.state, "", `${link.pathname}${link.search}`);
    const restore = () => {
      if (location.pathname.startsWith("/link/")) {
        history.replaceState(history.state, "", own);
      }
      window.removeEventListener("pagehide", restore);
    };
    window.addEventListener("pagehide", restore);
    setTimeout(restore, 1500);
    waitForPhone();
  };

  if (!open) {
    return null;
  }
  const nothing = paths.size === 0 || (deeplink && code === null && !error);
  return createPortal(
    <Dialog
      open={open}
      close={() => !busy && onClose()}
      closable={!busy}
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
          <div className={classes.list} onClickCapture={pointLinkToCode}>
            <ConnectWalletList
              limitNetwork={limitNetwork}
              peerConnectEnabled={paths.has("qr")}
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
              onConnectError={(walletName, failure) => {
                forget();
                fail(failure);
              }}
            />
          </div>
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
