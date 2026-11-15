import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { createUseStyles } from "react-jss";
import Fab from "../controls/Fab";
import Jukebox from "../misc/Jukebox";
import {
  translate as t,
  translationKeys as tr,
  getCurrentLanguage,
} from "@battlechoc/battlechoc-shared-functions";
import { version, commit, builtAt } from "../../build";
import { checkForUpdate } from "../../updateCheck";
import Dialog from "./Dialog";

// the small round buttons in the subtitle: the version and "Check for updates"
const chip = (theme) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3em",
  margin: "0.2em 0",
  padding: "0.15em 0.6em",
  borderRadius: "1em",
  background: theme.color.secondary.dark,
  border: `0.12em solid ${theme.color.secondary.light}`,
  color: "white",
  textDecoration: "none",
  cursor: "pointer",
  transition: "transform 0.15s",
  "&:hover, &:focus-visible": {
    transform: "scale(1.06)",
    borderColor: theme.color.gold.light,
  },
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
});

const useStyles = createUseStyles((theme) => ({
  // the bottom right corner of the title screen
  icons: {
    position: "absolute",
    zIndex: 2,
    bottom: theme.edge.bottom,
    right: theme.edge.right,
    display: "flex",
    gap: theme.edge.gap,
  },
  text: {
    "& *": { color: "white" },
    width: "70vw",
    maxWidth: "48em",
    fontSize: theme.font.size.sm,
    textAlign: "left",
    "& h2": { fontSize: theme.font.size.lg },
  },
  header: {
    textAlign: "center",
  },
  // the version in the subtitle is a small button to the release notes on GitHub
  release: chip(theme),
  // below it: "Check for updates", and what the check found
  update: {
    ...chip(theme),
    font: "inherit",
    marginTop: "0.5em",
    "&:disabled": {
      cursor: "default",
      opacity: 0.75,
      transform: "none",
      borderColor: theme.color.secondary.light,
    },
  },
  // the circling arrows turn while the check or the download runs
  busy: {
    animation: "$turn 1s linear infinite",
    "@media (prefers-reduced-motion: reduce)": { animation: "none" },
  },
  "@keyframes turn": {
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
  },
  // the arrow out of a box: the link opens GitHub
  external: {
    width: "0.85em",
    height: "0.85em",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  },
}));

// release-please tags every release vX.Y.Z and writes its notes there
const releaseUrl = (number) =>
  `https://github.com/battlechoc/battlechoc/releases/tag/v${number}`;

// the game's language codes that are no BCP 47 tags
const UNITS = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

// "3 days ago" in the game's language; under a minute "now"
const timeAgo = (time) => {
  const language = getCurrentLanguage();
  const seconds = Math.round((time - Date.now()) / 1000);
  const found = UNITS.find(([, size]) => Math.abs(seconds) >= size);
  const [unit, value] = found
    ? [found[0], Math.round(seconds / found[1])]
    : ["second", 0];
  return new Intl.RelativeTimeFormat(language, {
    numeric: "auto",
  }).format(value, unit);
};

// how long "You have the latest version" and a failure stay before the button asks again
const RESULT_MS = 5000;

// "Check for updates": idle, checking, current, installing or failed. Once the worker of a new
// build is in charge (state.ui.updateReady), the button restarts the game into it.
const UpdateCheck = ({ classes, onInstalled }) => {
  const ready = useSelector((state) => state.ui.updateReady);
  // the game comes from the site's host (GitHub Pages), not from the API: the check needs the
  // internet, not the server (state.ui.serverDown: the internet works, the API does not answer)
  const internet = useSelector(
    (state) => state.ui.online || state.ui.serverDown
  );
  const [status, setStatus] = useState("idle");

  // the new build the player asked for has arrived: the update dialog takes over
  useEffect(() => {
    if (ready && status === "installing") {
      setStatus("idle");
      onInstalled();
    }
  }, [ready, status, onInstalled]);

  useEffect(() => {
    if (status !== "current" && status !== "failed") {
      return undefined;
    }
    const timer = setTimeout(() => setStatus("idle"), RESULT_MS);
    return () => clearTimeout(timer);
  }, [status]);

  // a game without a worker (the dev server) has nothing to check; without the internet the site
  // is out of reach, but a ready build starts without it
  const worker =
    typeof navigator !== "undefined" &&
    navigator.serviceWorker &&
    navigator.serviceWorker.controller;
  if (!ready && !(internet && worker)) {
    return null;
  }

  const check = async () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    if (ready) {
      window.location.reload();
      return;
    }
    setStatus("checking");
    const result = await checkForUpdate(navigator.serviceWorker, {
      onFailed: () => setStatus("failed"),
    });
    setStatus(result === "unavailable" ? "failed" : result);
  };

  const busy = !ready && (status === "checking" || status === "installing");
  const label = ready
    ? t(tr.INFO_UPDATE_READY)
    : {
        current: t(tr.INFO_UP_TO_DATE),
        installing: t(tr.INFO_UPDATE_LOADING),
        failed: t(tr.INFO_UPDATE_FAILED),
      }[status] || t(tr.INFO_CHECK_UPDATES);

  return (
    <button
      type="button"
      className={classes.update}
      onClick={check}
      disabled={busy}
      aria-busy={busy}
      aria-live="polite"
      data-testid="info-update"
      data-status={ready ? "ready" : status}
    >
      {label}
      <svg
        className={`${classes.external} ${busy ? classes.busy : ""}`}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        {!ready && status === "current" ? (
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        ) : (
          <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5" />
        )}
      </svg>
    </button>
  );
};

const Info = (props) => {
  const classes = useStyles();
  const [open, setOpen] = useState(false);

  const handleClose = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    setOpen(false);
  };
  const closeForUpdate = useCallback(() => setOpen(false), []);
  // the title screen holds a notice back while the info is open
  const { onOpenChange } = props;
  useEffect(() => {
    if (onOpenChange) {
      onOpenChange(open);
    }
  }, [open, onOpenChange]);

  return (
    <>
      <div className={classes.icons}>
        {/* the links lead nowhere offline */}
        {props.online ? (
          <>
            <Fab
              icon="instagram"
              onClick={() =>
                window.open("https://www.instagram.com/battlechoc/", "_blank")
              }
            ></Fab>
            <Fab
              icon="discord"
              onClick={() =>
                window.open("https://discord.gg/XekFHYXNmu", "_blank")
              }
            ></Fab>
          </>
        ) : null}
        <Fab
          icon="info"
          color="primary"
          onClick={() => {
            setOpen(true);
            Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
          }}
        ></Fab>
      </div>
      <Dialog
        open={open}
        close={handleClose}
        title={t(tr.INFO_TITLE)}
        subtitle={
          <div style={{ textAlign: "center" }}>
            <div data-testid="info-build">
              <a
                className={classes.release}
                href={releaseUrl(version)}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="info-release"
              >
                {t(tr.INFO_VERSION)} {version}
                {commit ? ` · ${commit}` : null}
                <svg
                  className={classes.external}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </a>
              <br />
              {t(tr.INFO_LAST_UPDATE, timeAgo(builtAt))}
            </div>
            <UpdateCheck classes={classes} onInstalled={closeForUpdate} />
          </div>
        }
      >
        <div className={classes.text}>
          <div className={classes.header}>
            <p>
              {t(tr.INFO_MADE_BY, "Sebastian Bode & Fabian Bormann")}
              <br />
              {t(tr.INFO_EMAIL)}: hello@battlechoc.com
              <br />
              <a
                href="https://github.com/battlechoc/battlechoc"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(tr.INFO_SOURCE_CODE)}
              </a>
            </p>
          </div>
          <h2 style={{ textAlign: "center" }}>{t(tr.INFO_PRIVACY_POLICY)}</h2>
          <p style={{ textAlign: "justify" }}>
            {t(tr.INFO_PRIVACY_POLICY_TEXT)}
          </p>
          <p className={classes.header}>
            <a href="/privacy-policy/" target="_blank" rel="noopener">
              {t(tr.INFO_PRIVACY_POLICY_FULL)}
            </a>
          </p>
        </div>
      </Dialog>
    </>
  );
};

export default Info;
