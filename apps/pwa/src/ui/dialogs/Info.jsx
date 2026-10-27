import React, { useState } from "react";
import { createUseStyles } from "react-jss";
import Fab from "../controls/Fab";
import { Jukebox } from "../misc";
import {
  translate as t,
  translationKeys as tr,
  getCurrentLanguage,
} from "@battlechoc/battlechoc-shared-functions";
import { version, commit, builtAt } from "../../build";
import Dialog from "./Dialog";

const useStyles = createUseStyles((theme) => ({
  icons: {
    position: "absolute",
    zIndex: 2,
    bottom: 0,
    right: 0,
    marginBottom: 5,
    display: "flex",
    "& > div": {
      marginRight: 5,
    },
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
}));

// the game's language codes that are no BCP 47 tags
const LOCALES = { jp: "ja", vn: "vi" };
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
  const [unit, value] = found ? [found[0], Math.round(seconds / found[1])] : ["second", 0];
  return new Intl.RelativeTimeFormat(LOCALES[language] || language, {
    numeric: "auto",
  }).format(value, unit);
};

const Info = (props) => {
  const classes = useStyles();
  const [open, setOpen] = useState(false);

  const handleClose = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    setOpen(false);
  };

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
              onClick={() => window.open("https://discord.gg/XekFHYXNmu", "_blank")}
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
          <div style={{ textAlign: "center" }} data-testid="info-build">
            {t(tr.INFO_VERSION)} {version}
            {commit ? ` · ${commit}` : null} <br />
            {t(tr.INFO_LAST_UPDATE, timeAgo(builtAt))}
          </div>
        }
      >
        <div className={classes.text}>
          <div className={classes.header}>
            <p>
              {t(tr.INFO_MADE_BY, "Sebastian Bode & Fabian Bormann")}
              <br />
              {t(tr.INFO_EMAIL)}: contact@battlechoc.com
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
