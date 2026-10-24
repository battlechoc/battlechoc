import React, { useState } from "react";
import { createUseStyles } from "react-jss";
import Fab from "../controls/Fab";
import { Jukebox } from "../misc";
import {
  translate as t,
  translationKeys as tr,
  getCurrentLanguage,
} from "@battlechoc/battlechoc-shared-functions";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import de from "javascript-time-ago/locale/de";
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

const Info = (props) => {
  const classes = useStyles();
  const [open, setOpen] = useState(props.openInfo);
  // GitLab CI is going to override these variables
  let date = "LOCAL_DATETIME";
  let version = import.meta.env.VITE_VERSION;

  if (date.startsWith("LOCAL")) {
    date = new Date().getTime();
  } else {
    date = new Date(date).getTime();
  }

  TimeAgo.addLocale(en);
  TimeAgo.addLocale(de);

  const handleClose = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    setOpen(false);
  };

  let timeAgo = new TimeAgo("en-US");
  let timeSinceUpdate = timeAgo.format(date);
  timeSinceUpdate = "last update " + timeSinceUpdate;

  if (getCurrentLanguage() === "de") {
    timeAgo = new TimeAgo("de-DE");
    timeSinceUpdate = timeAgo.format(date);
    timeSinceUpdate = "Letztes Update " + timeSinceUpdate;
  }

  return (
    <>
      <div className={classes.icons}>
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
        title="About battlechoc"
        subtitle={
          <div style={{ textAlign: "center" }}>
            version {version} <br /> {timeSinceUpdate}
          </div>
        }
      >
        <div className={classes.text}>
          <div className={classes.header}>
            <p>
              battlechoc made with ❤️
              <br />
              by Sebastian Bode & Fabian Bormann
              <br />
              E-mail: contact@battlechoc.com
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
        </div>
      </Dialog>
    </>
  );
};

export default Info;
