import React, { useEffect, useRef } from "react";
import Jukebox from "../misc/Jukebox";
import { createUseStyles } from "react-jss";
import Fab from "../controls/Fab";
import DialogFrame from "./DialogFrame";
import withDefaultProps from "../../helper/defaultProps";

// the dialog as high as its content (modes info and list)
const fitContent = (theme) => ({
  "& > div": {
    height: "auto",
    maxHeight: `calc(100% - ${theme.fab})`,
    display: "flex",
    flexDirection: "column",
  },
  "& > div > div ": {
    position: "relative",
    flex: "0 1 auto",
    minHeight: 0,
  },
  // phones held sideways: less room around the content, so a short menu needs no scrolling
  [theme.breakpoints.shortLandscape]: {
    "& > div > div ": { paddingTop: 16, paddingBottom: 16 },
  },
});

// The top frame piece (DialogFrame) is as high as its box allows: min(32vh, 80vw / 2.49) in a
// dialog, min(20vh, 50vw / 2.49) in a compact one. Its chocolate edge reaches down to 27 % of
// that height, so the title starts below it (the body's padding is 32px); a list's scaled frame
// stays clear of the title anyway.
const titleMargin = (mode) => {
  if (mode === "list") {
    return "2vh";
  }
  const piece = ["notification", "info"].includes(mode)
    ? "min(20vh, 20vw)"
    : "min(32vh, 32vw)";
  return `max(2vh, calc(${piece} * 0.27 - 24px))`;
};

const useStyles = createUseStyles((theme) => ({
  overlay: {
    background: "rgba(0, 0, 0, 0.85)",
    height: "100%",
    width: "100%",
    zIndex: 10,
    top: 0,
    left: 0,
    position: "fixed",
    justifyContent: "center",
    alignItems: "center",
    // the dialog stays inside the safe area (notches, home indicator)
    boxSizing: "border-box",
    padding:
      "env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)",
  },
  stacked: {
    background: "unset !important",
    zIndex: 20,
  },
  notification: {
    background: "unset !important",
    position: "relative",
    "& > div > div ": {
      left: 0,
      bottom: 0,
      top: "unset",
      padding: 12,
      height: "calc(100% - 32px)",
      width: "calc(100% - 24px)",
    },
  },
  // compact: as high as its content (the body in the flow) and centred; when the content is
  // higher than the screen allows, it scrolls
  info: fitContent(theme),
  // a list (the highscore): as high as its content, a readable width instead of the whole
  // screen, more room inside and a frame that scales with the panel instead of the screen
  list: {
    ...fitContent(theme),
    "& > div": {
      ...fitContent(theme)["& > div"],
      width: `min(38rem, calc(100% - ${theme.fab}))`,
    },
    "& > div > div ": {
      ...fitContent(theme)["& > div > div "],
      padding: "2.2em 2em",
    },
    [theme.breakpoints.shortLandscape]: {
      "& > div > div ": { paddingTop: "1.2em", paddingBottom: "1.2em" },
    },
  },
  // 80 % of the screen and 90 % of its height, but small enough that the close button on the
  // corner keeps an edge (--edge) from the screen's edges
  dialog: {
    boxSizing: "border-box",
    width: (props) =>
      props.mode === "notification"
        ? "100%"
        : `min(calc(80% + 32px), calc(100% - ${theme.fab}))`,
    height: `min(calc(90% + 32px), calc(100% - ${theme.fab}))`,
    padding: 16,
    position: "relative",
  },
  body: {
    borderRadius: (props) => (props.mode === "notification" ? 0 : 20),
    position: "absolute",
    top: 12,
    right: 6,
    height: (props) =>
      ["info", "list"].includes(props.mode) ? "unset" : "calc(100% - 88px)", // 12px (top) + 2 * 32px (padding) = 88px
    width: "calc(100% - 30px)", // 6px (left) + 2 * 12px (padding) = 30px
    padding: "32px 12px",
    display: "flex",
    alignItems: "center",
    flexDirection: "column",
    "&:before": {
      content: '""',
      position: "absolute",
      borderRadius: (props) => (props.mode === "notification" ? 0 : 20),
      top: 0,
      left: 0,
      zIndex: -1,
      width: "100%",
      height: "calc(100% - 1px)",
      background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`,
    },
    [theme.breakpoints.smartphone]: {
      right: 8,
      width: "calc(100% - 56px)",
      padding: "32px 24px",
    },
  },
  // titles of compact dialogs (notifications, questions) are one step smaller; long titles wrap
  title: {
    zIndex: 12,
    marginTop: (props) => titleMargin(props.mode),
    fontFamily: theme.font.display,
    fontSize: (props) =>
      ["notification", "info"].includes(props.mode)
        ? theme.font.size.lg
        : theme.font.size.xl,
    lineHeight: 1.1,
    display: "flex",
    textAlign: "center",
    overflowWrap: "anywhere",
    justifyContent: "center",
    alignItems: "center",
    color: "white",
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  subtitle: {
    zIndex: 12,
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    color: "white",
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  // the chocolate pieces of the frame, cut to the rounded body (the body itself does not clip,
  // so the close button can sit on its corner)
  frame: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    overflow: "hidden",
    borderRadius: (props) => (props.mode === "notification" ? 0 : 20),
    zIndex: 12,
    pointerEvents: "none",
    // the scaled frame of a list measures the panel
    containerType: (props) =>
      props.mode === "list" ? "inline-size" : "normal",
  },
  // every dialog's close button: centred on the top right corner of its border (where the
  // rounded corner bends, 6px in), the same in every dialog and on every screen
  close: {
    position: "absolute",
    top: 6,
    right: 6,
    transform: "translate(50%, -50%)",
    zIndex: 17,
  },
  content: {
    position: "relative",
    zIndex: 16,
    overflowY: "auto",
    overflowX: "hidden",
    // the space below the title; scrolls when the content is taller
    flex: "1 1 auto",
    minHeight: 0,
    width: "100%",
    color: "white",
    display: "flex",
    justifyContent: "center",
    fontSize: theme.font.size.md,
    textAlign: "center",
    [theme.breakpoints.smartphone]: {
      width: "80%",
    },
    [theme.breakpoints.orientation.landscape]: {
      width: "90%",
    },
  },
  // a square of the title's size before the title
  icon: {
    flex: "0 0 auto",
    width: "1em",
    height: "1em",
    marginRight: "0.15em",
  },
}));

// the open closable dialogs, the topmost last: Escape closes only that one
const escapable = [];
const onKeyDown = (event) => {
  if (event.key === "Escape" && escapable.length > 0) {
    escapable[escapable.length - 1].current();
  }
};

const Dialog = (componentProps) => {
  const props = withDefaultProps(componentProps, defaultProps);
  const classes = useStyles(props);
  const closeDialog = () => {
    if (props.closable) {
      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
      props.close();
    }
  };
  const latestClose = useRef(closeDialog);
  latestClose.current = closeDialog;

  useEffect(() => {
    if (!props.open || !props.closable) {
      return undefined;
    }
    if (escapable.length === 0) {
      window.addEventListener("keydown", onKeyDown);
    }
    escapable.push(latestClose);
    return () => {
      escapable.splice(escapable.indexOf(latestClose), 1);
      if (escapable.length === 0) {
        window.removeEventListener("keydown", onKeyDown);
      }
    };
  }, [props.open, props.closable]);

  return (
    <div
      className={`${classes.overlay} ${classes[props.mode]}`}
      style={props.open ? { display: "flex" } : { display: "none" }}
    >
      <div className={classes.dialog}>
        <div className={classes.body}>
          <div className={classes.frame}>
            <DialogFrame
              compact={["notification", "info"].includes(props.mode)}
              scaled={props.mode === "list"}
            />
          </div>
          {props.closable ? (
            <Fab
              className={classes.close}
              color={props.mode === "stacked" ? "secondary" : "accent"}
              icon={props.mode === "stacked" ? "back" : "close"}
              onClick={closeDialog}
            />
          ) : null}
          <span className={classes.title}>
            {props.titleSlotBefore}
            {props.icon ? (
              <span
                className={classes.icon}
                style={{
                  background: `url(/images/${props.icon}.svg) no-repeat`,
                  backgroundSize: "100% 100%",
                }}
              />
            ) : null}
            {props.title}
            {props.titleSlotAfter}
          </span>
          {props.subtitle ? (
            <span className={classes.subtitle}>{props.subtitle}</span>
          ) : null}
          <div className={classes.content}>{props.children}</div>
        </div>
      </div>
    </div>
  );
};

const defaultProps = {
  closable: true,
  subtitle: null,
  icon: null,
  mode: "default",
  titleSlotBefore: null,
  titleSlotAfter: null,
};

export default Dialog;
