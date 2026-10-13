import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import withDefaultProps from "../../helper/defaultProps";

const useStyles = createUseStyles((theme) => ({
  message: {
    color: "white",
    margin: "1vh",
    padding: "1vh",
    display: "flex",
    borderRadius: "2vh",
    alignItems: "flex-start",
    boderWidth: "0.4vh",
    borderStyle: "solid",
    borderColor: (props) => {
      if (props.variant === "error") {
        return theme.color.accent.light;
      } else if (props.variant === "warning") {
        return theme.color.warning.light;
      } else if (props.variant === "success") {
        return theme.color.primary.light;
      } else {
        return theme.color.secondary.light;
      }
    },
    background: (props) => {
      if (props.variant === "error") {
        return `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`;
      } else if (props.variant === "success") {
        return `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 100%)`;
      } else if (props.variant === "warning") {
        return `linear-gradient(0deg, ${theme.color.warning.dark} 0%, ${theme.color.warning.light} 100%)`;
      } else {
        return `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`;
      }
    },
    [theme.breakpoints.orientation.landscape]: {
      margin: "1vw",
      padding: "1vw",
      borderRadius: "2vw",
      boderWidth: "0.4vw",
    },
  },
  icon: {
    margin: "1vh",
    "& > div": {
      padding: "3vh",
      backgroundSize: "100% 100%",
    },
    [theme.breakpoints.orientation.landscape]: {
      margin: "1vw",
      "& > div": {
        padding: "3vw",
      },
    },
  },
  info: {
    "& > div": {
      background: `url(/images/info-icon.svg) no-repeat`,
    },
  },
  error: {
    "& > div": {
      background: `url(/images/error-icon.svg) no-repeat`,
    },
  },
  warning: {
    "& > div": {
      background: `url(/images/warning-icon.svg) no-repeat`,
    },
  },
  success: {
    "& > div": {
      background: `url(/images/success-icon.svg) no-repeat`,
    },
  },
  actions: {
    margin: "1vh",
    padding: "0.5vh",
    "& > div": {
      padding: "1.5vh",
      background: (props) => {
        if (props.variant === "error") {
          return `url(/images/close.svg) no-repeat`;
        } else if (props.variant === "warning") {
          return `url(/images/warning-close.svg) no-repeat`;
        } else if (props.variant === "success") {
          return `url(/images/primary-close.svg) no-repeat`;
        } else {
          return `url(/images/secondary-close.svg) no-repeat`;
        }
      },
      backgroundSize: "100% 100%",
    },
    [theme.breakpoints.orientation.landscape]: {
      margin: "1vw",
      padding: "0.5vw",
      "& > div": {
        padding: "1.5vw",
      },
    },
  },
  text: {
    margin: "1vh",
    fontSize: "2vh",
    alignSelf: "center",
    [theme.breakpoints.orientation.landscape]: {
      margin: "1vw",
      fontSize: "2vw",
    },
  },
  invisible: {
    transition: "opacity 1s ease-out",
    opacity: 0,
  },
  visible: {
    opacity: 1,
  },
  rotate: {
    padding: "1.5vh",
    margin: "0.5vh",
    background: `url(/images/phone-rotation.svg) no-repeat`,
    backgroundSize: "100% 100%",
    [theme.breakpoints.orientation.landscape]: {
      padding: "1.5vw",
      margin: "0.5vw",
    },
  },
  share: {
    padding: "1.1vh",
    margin: "0.5vh",
    background: `url(/images/apple-share-icon.svg) no-repeat`,
    backgroundSize: "100% 100%",
    [theme.breakpoints.orientation.landscape]: {
      padding: "1.1vw",
      margin: "0.5vw",
    },
  },
  add: {
    padding: "1.2vh",
    margin: "0.5vh",
    background: `url(/images/add-icon.svg) no-repeat`,
    backgroundSize: "100% 100%",
    [theme.breakpoints.orientation.landscape]: {
      padding: "1.2vw",
      margin: "0.5vw",
    },
  },
}));

const QuickMessage = (componentProps) => {
  const props = withDefaultProps(componentProps, defaultProps);
  const classes = useStyles(props);
  const [visible, setVisible] = useState(true);
  let { message, onClose, variant, autoHideDuration } = props;

  if (variant === "apple-pwa-hint") {
    variant = "info";
    message = (
      <span>
        {message.substring(0, message.indexOf("[0]"))}
        <span className={classes.rotate} />
        {message.substring(message.indexOf("[0]") + 3, message.indexOf("[1]"))}
        <span className={classes.share} />
        {message.substring(message.indexOf("[1]") + 3, message.indexOf("[2]"))}
        <span className={classes.add} />
        {message.substring(message.indexOf("[2]") + 3)}
      </span>
    );
  }

  const close = useCallback(() => {
    if (visible) {
      setVisible(false);
      setTimeout(onClose, 1000);
    }
  }, [onClose, visible]);

  useEffect(() => {
    if (autoHideDuration > 0) {
      const timeout = setTimeout(close, autoHideDuration);
      return () => {
        clearTimeout(timeout);
      };
    }
  }, [autoHideDuration, close]);

  return (
    <div
      className={`${visible ? classes.visible : classes.invisible} ${
        classes.message
      }`}
    >
      <div className={`${classes[variant]} ${classes.icon}`}>
        <div />
      </div>
      <div className={classes.text}>{message}</div>
      <div className={classes.actions}>
        <div onClick={close} />
      </div>
    </div>
  );
};

QuickMessage.propTypes = {
  open: PropTypes.bool.isRequired,
  autoHideDuration: PropTypes.number,
  message: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  variant: PropTypes.oneOf([
    "error",
    "info",
    "success",
    "warning",
    "apple-pwa-hint",
  ]),
};

const defaultProps = {
  variant: "warning",
  autoHideDuration: 4000,
  messageId: 0,
};

export default QuickMessage;
