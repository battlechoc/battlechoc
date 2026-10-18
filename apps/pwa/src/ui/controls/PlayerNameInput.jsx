import React, { useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import { ServerRequest } from "../../helper/settings";
import Axios from "axios";
import { createUseStyles } from "react-jss";
import logger from "../../helper/logger";
import {
  NoHealthyInternetConnectionError,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Progress from "./Progress";
import withDefaultProps from "../../helper/defaultProps";

// One row in the text size of buttons (the type scale); the action button sits on its right end.
const useStyles = createUseStyles((theme) => ({
  root: {
    display: "flex",
    alignItems: "center",
    position: "relative",
    fontSize: theme.font.size.lg,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    paddingRight: "2.4em",
    outline: "none",
    borderRadius: "0.55em",
    color: theme.color.secondary.dark,
    fontFamily: theme.font.display,
    fontSize: "inherit",
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    height: "2.2em",
    background: "white",
    border: `2px solid ${theme.color.secondary.light}`,
    overflow: "hidden",
    whiteSpace: "nowrap",
  },
  error: {
    border: `2px solid ${theme.color.accent.light} !important`,
    color: `${theme.color.accent.dark} !important`,
  },
  errorLabel: {
    color: theme.color.accent.light,
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.accent.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  icon: {
    flex: "0 0 auto",
    width: "2.4em",
    height: "1.1em",
  },
  actionButton: {
    boxSizing: "border-box",
    border: `0.12em solid ${theme.color.secondary.light}`,
    borderRadius: "0.55em",
    background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 70%)`,
    height: "2.2em",
    width: "2.2em",
    position: "absolute",
    top: 0,
    right: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  buttonError: {
    border: `0.12em solid ${theme.color.accent.light}`,
    background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 70%)`,
    "& > div": {
      filter: "hue-rotate(120deg)",
    },
  },
  actionIcon: {
    width: "60%",
    height: "60%",
  },
  disabled: {
    background: "linear-gradient(0deg, #666 0%, #aaa 70%)",
    border: "0.12em solid #aaa",
    "& > div": {
      filter: "grayscale(1)",
    },
  },
  name: {
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
}));

const PlayerNameInput = (componentProps) => {
  const props = withDefaultProps(componentProps, defaultProps);
  const classes = useStyles();
  const { setPlayerName, startValue, current } = props;
  const [loading, setLoading] = useState(false);
  const [playerNameValid, setPlayerNameValid] = useState(true);
  const [playerNameAvailable, setPlayerNameAvailable] = useState(true);
  const [playerName, updatePlayerName] = useState(
    typeof startValue === "undefined" ? "Chocnonymous" : startValue
  );
  const [unchanged, setUnchanged] = useState(current === startValue);
  const [badInternetConnection, setBadInternetConnection] = useState(false);
  const [editMode, setEditMode] = useState(props.editMode);

  const abortController = useRef(new AbortController());
  const [requestRunning, setRequestRunning] = useState(false);
  const [requestTimeout, setRequestTimeout] = useState(null);

  useEffect(() => {
    setEditMode(props.editMode);
    updatePlayerName(
      typeof startValue === "undefined" ? "Chocnonymous" : startValue
    );
    if (!props.editMode) {
      setPlayerNameAvailable(true);
      setPlayerNameValid(true);
      setLoading(false);
    }
  }, [props.editMode, startValue]);

  useEffect(() => {
    setUnchanged(playerName === current);
    if (playerName !== "" && playerName !== current) {
      setPlayerNameValid(validate(playerName));
      setPlayerNameAvailable(true);

      clearTimeout(requestTimeout);
      if (requestRunning) {
        abortController.current.abort();
      }

      setLoading(true);
      setRequestTimeout(
        setTimeout(async () => {
          abortController.current = new AbortController();

          try {
            setRequestRunning(true);
            let response = await ServerRequest(
              "get",
              "/check/available/" + playerName,
              abortController.current.signal
            );
            setPlayerNameAvailable(response.data.available);
            setBadInternetConnection(false);
          } catch (error) {
            if (
              error instanceof NoHealthyInternetConnectionError ||
              error.code === "auth/network-request-failed"
            ) {
              setBadInternetConnection(true);
            } else if (!Axios.isCancel(error)) {
              logger.warn(error);
            }
          } finally {
            setRequestRunning(false);
            setLoading(false);
          }
        }, 500)
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName]);

  const validate = (name) => {
    let regex = /^([a-zA-Z][a-zA-Z0-9_]{2,24})$/;
    return regex.test(name) && name.toUpperCase() !== "CHOCNONYMOUS";
  };

  const getHelperText = () => {
    if (loading || unchanged) {
      return "";
    } else if (badInternetConnection) {
      return t(tr.NO_HEALTHY_INTERNET);
    } else if (!playerNameAvailable) {
      return t(tr.SETTINGS_PLAYER_NAME_IN_USE);
    } else if (!playerNameValid) {
      return t(tr.SETTINGS_PLAYER_NAME_INVALID);
    } else {
      return "";
    }
  };

  const hasError =
    editMode &&
    (!playerNameAvailable || !playerNameValid || badInternetConnection) &&
    !unchanged;
  const actionIcon = editMode ? "send" : "pen";
  const handleAction = () => {
    if (editMode) {
      if (playerNameAvailable && playerNameValid && !loading) {
        setPlayerName(playerName);
      }
    } else {
      if (typeof props.onEditMode === "function") {
        props.onEditMode();
      }
      setEditMode(true);
    }
  };

  const buttonError = editMode && (!playerNameAvailable || !playerNameValid);
  const buttonDisabled =
    !buttonError && editMode && (loading || unchanged || badInternetConnection);

  return (
    <div className={props.className}>
      {hasError ? (
        <span className={classes.errorLabel}>{getHelperText()}</span>
      ) : null}
      <div className={classes.root}>
        {editMode ? (
          <input
            noValidate
            style={{ paddingLeft: 5 }}
            className={`${classes.input} ${hasError ? classes.error : ""}`}
            value={playerName}
            spellCheck={false}
            autoFocus={true}
            onChange={(event) => {
              updatePlayerName(event.target.value);
            }}
          />
        ) : (
          <div className={classes.input}>
            <div
              className={`${classes.icon} ${classes.fixed}`}
              style={{
                backgroundImage: "url(/images/user.svg)",
                backgroundRepeat: "no-repeat",
                backgroundSize: "100% 100%",
              }}
            ></div>
            <div
              className={classes.name}
            >
              {playerName}
            </div>
          </div>
        )}
        <div
          onClick={handleAction}
          className={`${classes.actionButton} ${
            buttonDisabled ? classes.disabled : null
          } ${buttonError ? classes.buttonError : null}`}
        >
          {loading ? (
            <Progress infiniteAnimation={true} size={24} />
          ) : (
            <div
              className={classes.actionIcon}
              style={{
                backgroundImage: `url(/images/${actionIcon}.svg)`,
                backgroundRepeat: "no-repeat",
                backgroundSize: "100% 100%",
              }}
            ></div>
          )}
        </div>
      </div>
    </div>
  );
};

const defaultProps = {
  editMode: true,
  className: "",
};

PlayerNameInput.propTypes = {
  editMode: PropTypes.bool,
  className: PropTypes.string,
  onEditMode: PropTypes.func,
};

export default PlayerNameInput;
