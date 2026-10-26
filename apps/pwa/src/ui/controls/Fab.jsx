import React from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import { Jukebox } from "../misc";
import withDefaultProps from "../../helper/defaultProps";

const useStyles = createUseStyles((theme) => ({
  fab: {
    color: "white",
    display: "flex",
    cursor: "pointer",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "100%",
    [theme.breakpoints.orientation.portrait]: {
      width: "12vw",
      height: "12vw",
    },
    [theme.breakpoints.orientation.landscape]: {
      width: "7vw",
      height: "7vw",
      maxWidth: "12vh",
      maxHeight: "12vh",
    },
    [theme.breakpoints.orientation.square]: {
      width: "calc(3.5vh + 3.5vw)",
      height: "calc(3.5vh + 3.5vw)",
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
  focusable: {
    outline: "none",
    "&:focus-visible": {
      outline: `0.3vw solid ${theme.color.gold.light}`,
      outlineOffset: "0.2vw",
    },
  },
  background: {
    border: (props) => `0.4vw solid ${theme.color[props.color].light}`,
    background: (props) =>
      `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${
        theme.color[props.color].light
      } 100%)`,
    "&:hover": {
      background: (props) =>
        `linear-gradient(0deg, ${theme.color[props.color].dark} 0%, ${
          theme.color[props.color].light
        } 150%)`,
    },
  },
}));

// the props the fab handles itself; everything else (data-testid, aria-label, ...) goes to its element
const OWN_PROPS = ["color", "onClick", "className", "style", "iconStyle", "icon"];

const Fab = (componentProps) => {
  const props = withDefaultProps(componentProps, defaultProps);
  const rest = Object.fromEntries(
    Object.entries(componentProps).filter(([name]) => !OWN_PROPS.includes(name))
  );
  const color =
    props.icon === "discord" || props.icon === "instagram"
      ? props.icon
      : props.color;
  const classes = useStyles({ ...props, color: color });
  const onClick = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    props.onClick();
  };
  const onKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      {...rest}
      onKeyDown={onKeyDown}
      style={props.style}
      onClick={onClick}
      className={`${classes.fab} ${classes.background} ${classes.focusable} ${props.className}`}
      data-icon={props.icon}
    >
      <div
        className={classes.icon}
        style={{
          backgroundImage: `url(/images/${props.icon}.svg)`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "100% 100%",
          ...props.iconStyle,
        }}
      />
    </div>
  );
};

const defaultProps = {
  color: "primary",
  style: {},
  iconStyle: {},
  icon: "settings",
  className: "",
};

Fab.propTypes = {
  color: PropTypes.oneOf([
    "primary",
    "secondary",
    "accent",
    "facebook",
    "instagram",
    "gold",
  ]),
  icon: PropTypes.oneOf([
    "donuts-enabled",
    "done",
    "search",
    "info",
    "forward",
    "forward-accent",
    "backward",
    "fast-forward",
    "fast-backward",
    "settings",
    "mute",
    "volume",
    "facebook",
    "instagram",
    "fullscreen",
    "user",
    "close",
    "trophy",
    "back",
    "share",
    "refresh",
    "discord",
    "lab/recipe-book",
  ]),
  iconStyle: PropTypes.object,
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired,
  style: PropTypes.object,
};

export default Fab;
