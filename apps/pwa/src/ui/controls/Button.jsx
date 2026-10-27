import React from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import { Jukebox } from "../misc";
import withDefaultProps from "../../helper/defaultProps";

// The text size comes from the type scale (huge: title menu, normal: dialogs, small: inline
// actions); the blob grows with its label instead of shrinking the text, so nothing spills out.
// A disabled, locked or offline button is grey and does not answer the pointer.
const still = (props) => props.disabled || props.locked || props.offline;

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
  // the lock leans on the upper right of the blob, sized by the button's text
  locked: {
    position: "absolute",
    right: "0.45em",
    top: "0.25em",
    transform: "rotate(-15deg)",
    width: "0.95em",
    height: "0.95em",
    backgroundSize: "100% 100%",
    backgroundRepeat: "no-repeat",
    backgroundImage: "url(/images/lock.svg)",
  },
  // the no-wifi sign of a button that needs the server, upright in the middle of the right end;
  // the label keeps clear of it on both sides, so it stays centred
  offline: {
    backgroundImage: "url(/images/offline.svg)",
    top: "50%",
    right: "0.5em",
    transform: "translateY(-50%)",
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
  const onClick = () => {
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
  const inert = props.disabled && !props.locked && !props.offline;
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
        style={props.style}
        onClick={onClick}
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
            props.offline && !props.locked ? classes.roomForBadge : ""
          }`}
        >
          {props.children}
        </div>
        {props.locked ? <div className={classes.locked} /> : null}
        {props.offline && !props.locked ? (
          <div className={`${classes.locked} ${classes.offline}`} />
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

Button.propTypes = {
  color: PropTypes.oneOf(["primary", "secondary", "accent"]),
  onClick: PropTypes.func.isRequired,
  className: PropTypes.string,
  style: PropTypes.object,
  buttonStyle: PropTypes.object,
  size: PropTypes.oneOf(["huge", "normal", "small"]),
  disabled: PropTypes.bool,
  locked: PropTypes.bool,
  onLockedClick: PropTypes.func,
  // needs the server, which does not answer: grey, with the no-wifi sign
  offline: PropTypes.bool,
  onOfflineClick: PropTypes.func,
};

export default Button;
