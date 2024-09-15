import React from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import { Jukebox } from "../misc";

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

const Fab = (props) => {
  const color =
    props.icon === "discord" || props.icon === "instagram"
      ? props.icon
      : props.color;
  const classes = useStyles({ ...props, color: color });
  const onClick = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    props.onClick();
  };
  return (
    <div
      style={props.style}
      onClick={onClick}
      className={`${classes.fab} ${classes.background} ${props.className}`}
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

Fab.defaultProps = {
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
    "bell",
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
  ]),
  iconStyle: PropTypes.object,
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired,
  style: PropTypes.object,
};

export default Fab;
