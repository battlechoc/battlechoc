import React, { useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { Jukebox } from "../misc";
import { createUseStyles } from "react-jss";
import Fab from "../controls/Fab";
import DialogFrame from "./DialogFrame";
import withDefaultProps from "../../helper/defaultProps";

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
  // compact: the body in the flow, so the dialog is as high as its content; the close button
  // stays on the corner like in the other dialogs
  info: {
    "& > div > div ": {
      position: "relative",
    },
    "& > div > $close": {
      position: "absolute",
    },
  },
  dialog: {
    width: (props) => (props.mode === "notification" ? "100%" : "80%"),
    height: "90%",
    padding: 16,
    position: "relative",
    top: (props) => (props.mode === "info" ? "10vh" : "unset"),
  },
  body: {
    borderRadius: (props) => (props.mode === "notification" ? 0 : 20),
    position: "absolute",
    top: 12,
    right: 6,
    overflow: "hidden",
    height: (props) => (props.mode === "info" ? "unset" : "calc(100% - 88px)"), // 12px (top) + 2 * 32px (padding) = 88px
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
    marginTop: "2vh",
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
  close: {
    position: "absolute",
    right: "-2vw",
    top: 0,
    zIndex: 16,
    [theme.breakpoints.orientation.portrait]: {
      right: "-2vh",
    },
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
      paddingRight: "5",
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
        {props.closable ? (
          <Fab
            className={classes.close}
            color={props.mode === "stacked" ? "secondary" : "accent"}
            icon={props.mode === "stacked" ? "back" : "close"}
            onClick={closeDialog}
          />
        ) : null}
        <div className={classes.body}>
          <DialogFrame
            compact={["notification", "info"].includes(props.mode)}
          />
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

Dialog.propTypes = {
  open: PropTypes.bool.isRequired,
  close: PropTypes.func,
  closable: PropTypes.bool,
  children: PropTypes.element.isRequired,
  title: PropTypes.string,
  icon: PropTypes.string,
  titleSlotBefore: PropTypes.element,
  titleSlotAfter: PropTypes.element,
  subtitle: PropTypes.oneOfType([PropTypes.string, PropTypes.object]),
  mode: PropTypes.oneOf(["default", "stacked", "notification", "info"]),
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
