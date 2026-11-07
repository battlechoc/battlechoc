import React from "react";
import { createUseStyles } from "react-jss";
import Jukebox from "../misc/Jukebox";
import withDefaultProps from "../../helper/defaultProps";

// The text size comes from the type scale (huge: title menu, normal: dialogs, small: inline
// actions); the blob grows with its label instead of shrinking the text, so nothing spills out.
// A disabled, locked or offline button is grey and does not answer the pointer.
// still filling up (progress below 100) counts as still too: it does nothing yet
const loadingOf = (props) => typeof props.progress === "number" && props.progress < 100;
const still = (props) => props.disabled || props.locked || props.offline || loadingOf(props);

const useStyles = createUseStyles((theme) => ({
  // the light rim around the blob: the outer blob shows through this padding
  border: (props) => ({
    cursor: still(props) ? "default" : "pointer",
    clipPath: "url(#menu-button-clip-path)",
    position: "relative",
    display: "flex",
    width: "fit-content",
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: "max(2px, 0.16em)",
    background: theme.color[props.color].light,
  }),
  button: {
    flex: "1 1 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxSizing: "border-box",
    padding: "0.3em 0.9em",
    clipPath: "url(#menu-button-clip-path)",
    textAlign: "center",
    lineHeight: 1.05,
    overflowWrap: "anywhere",
    color: "white",
    fontFamily: theme.font.display,
    "-webkit-text-stroke": (props) =>
      `${theme.font.stroke} ${theme.color[props.color].dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  iconButton: {
    color: "white",
    width: "5vw",
    height: "5vw",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "12.5%",
    borderColor: (props) => theme.color[props.color].light,
    borderWidth: "0.1vw",
    borderStyle: "solid",
    [theme.breakpoints.orientation.portrait]: {
      borderWidth: "0.1vh",
      width: "5vh",
      height: "5vh",
    },
  },
  icon: (props) => {
    const style = {
      width: "60%",
      height: "60%",
    };
    if (props.icon === "trophy") {
      style.width = "90%";
      style.height = "90%";
      style.marginTop = 3;
    }

    return style;
  },
  background: (props) => ({
    background: `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${
      theme.color[props.color].light
    } 70%)`,
    "&:hover": {
      background: `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${
        theme.color[props.color].light
      } ${still(props) ? 70 : 120}%)`,
    },
  }),
  // progress: grey, and the button's own colour fills it from the left (the first start: the
  // start button while the 3D models load)
  track: {
    position: "relative",
    overflow: "hidden",
    background: "linear-gradient(0deg, #6f7a80 0%, #a9b3b8 70%) !important",
  },
  fill: (props) => ({
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    background: `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${
      theme.color[props.color].light
    } 70%)`,
    transition: "width 0.4s ease-out",
  }),
  label: {
    position: "relative",
  },
  // the blob is at least this big (in em of its text) and grows with longer labels
  huge: {
    fontSize: theme.font.size.xxl,
    minWidth: "6.5em",
    minHeight: "1.8em",
  },
  normal: {
    fontSize: theme.font.size.lg,
    minWidth: "7em",
    minHeight: "2.3em",
  },
  small: {
    fontSize: theme.font.size.md,
    minWidth: "5.5em",
    minHeight: "2.3em",
  },
  disabled: {
    filter: "grayscale(1)",
  },
  // keyboard focus: the clip path would cut off an outline, so the light rim turns gold
  focusable: {
    outline: "none",
    "&:focus-visible": {
      background: theme.color.gold.light,
    },
  },
  focusableIcon: {
    outline: "none",
    "&:focus-visible": {
      outline: `0.25vw solid ${theme.color.gold.light}`,
      outlineOffset: "0.1vw",
    },
  },
  // a badge upright in the middle of the blob's right end, sized by the button's text: the lock
  // of a locked button, the no-wifi sign of one that needs the server; the label keeps clear of
  // it on both sides (roomForBadge), so it stays centred
  badge: {
    position: "absolute",
    top: "50%",
    right: "0.5em",
    transform: "translateY(-50%)",
    width: "0.95em",
    height: "0.95em",
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
  },
  lock: {
    backgroundImage: "url(/images/lock.svg)",
  },
  offline: {
    backgroundImage: "url(/images/offline.svg)",
  },
  roomForBadge: {
    paddingLeft: "1.5em",
    paddingRight: "1.5em",
  },
}));

// the props the button handles itself; everything else (data-testid, aria-label, ...) goes to its element
const OWN_PROPS = [
  "color",
  "onClick",
  "className",
  "style",
  "buttonStyle",
  "size",
  "disabled",
  "locked",
  "onLockedClick",
  "offline",
  "onOfflineClick",
  "icon",
  "progress",
  "children",
];

const Button = (componentProps) => {
  const props = withDefaultProps(componentProps, defaultProps);
  const classes = useStyles(props);
  const rest = Object.fromEntries(
    Object.entries(componentProps).filter(([name]) => !OWN_PROPS.includes(name))
  );
  // a disabled button does nothing; a locked one may explain how to unlock it, one that needs
  // the server that it does not answer (the lock comes first: offline matches unlock it too)
  const loading = loadingOf(props);
  const onClick = () => {
    if (loading) {
      return;
    }
    if (props.locked) {
      if (typeof props.onLockedClick === "function") {
        props.onLockedClick();
      }
      return;
    }
    if (props.offline) {
      if (typeof props.onOfflineClick === "function") {
        props.onOfflineClick();
      }
      return;
    }
    if (props.disabled) {
      return;
    }
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    props.onClick();
  };
  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };
  // a locked or offline button stays clickable (it explains itself), a disabled one does not
  const inert = (props.disabled && !props.locked && !props.offline) || loading;
  const accessibility = {
    role: "button",
    tabIndex: inert ? -1 : 0,
    "aria-disabled": inert ? "true" : undefined,
    onKeyDown,
  };

  if (props.icon) {
    return (
      <div
        {...rest}
        {...accessibility}
        style={props.style}
        onClick={onClick}
        data-icon={props.icon}
        className={`${classes.iconButton} ${classes.background} ${
          classes.focusableIcon
        } ${props.className} ${props.disabled ? classes.disabled : ""}`}
      >
        <div
          className={classes.icon}
          style={{
            backgroundImage: `url(/images/${props.icon}.svg)`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "100% 100%",
            ...props.buttonStyle,
          }}
        />
      </div>
    );
  } else {
    return (
      <div
        {...rest}
        {...accessibility}
        style={loading ? { ...props.style, background: "#b9c2c6" } : props.style}
        onClick={onClick}
        data-progress={typeof props.progress === "number" ? props.progress : undefined}
        className={`${classes.border} ${classes[props.size]} ${
          classes.focusable
        } ${props.className} ${
          props.disabled || props.locked || props.offline ? classes.disabled : ""
        }`}
        data-offline={props.offline && !props.locked ? "true" : undefined}
      >
        <div
          style={props.buttonStyle}
          className={`${classes.background} ${classes.button} ${
            props.locked || props.offline ? classes.roomForBadge : ""
          } ${loading ? classes.track : ""}`}
        >
          {loading ? (
            <>
              <span className={classes.fill} style={{ width: `${props.progress}%` }} />
              <span className={classes.label}>{props.children}</span>
            </>
          ) : (
            props.children
          )}
        </div>
        {props.locked ? <div className={`${classes.badge} ${classes.lock}`} data-badge="lock" /> : null}
        {props.offline && !props.locked ? (
          <div className={`${classes.badge} ${classes.offline}`} data-badge="offline" />
        ) : null}
      </div>
    );
  }
};

const defaultProps = {
  color: "primary",
  size: "normal",
  style: {},
  buttonStyle: {},
  className: "",
  locked: false,
  offline: false,
  disabled: false,
};

export default Button;
