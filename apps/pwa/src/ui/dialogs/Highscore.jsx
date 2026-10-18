import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import Dialog from "./Dialog";
import { Fab, Progress, Button, PlayerList } from "../controls";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { multiplayer } from "../../Multiplayer";
import logger from "../../helper/logger";
import withDefaultProps from "../../helper/defaultProps";

const useStyles = createUseStyles((theme) => ({
  fab: {
    position: "absolute",
    top: "calc(4vh + 4vw + 10px)",
    right: 5,
    zIndex: 4,
  },
  paginator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-around",
    padding: 8,
  },
  page: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
  },
  info: {
    display: "flex",
    justifyContent: "center",
    flexGrow: 1,
  },
  empty: {
    textAlign: "center",
    padding: "0 1em",
  },
  own: {
    marginTop: "0.5em",
  },
  rank: {
    fontFamily: theme.font.display,
    fontSize: theme.font.size.lg,
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
}));

const Highscore = (componentProps) => {
  const props = withDefaultProps(componentProps, defaultProps);
  const classes = useStyles(props);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highscore, setHighscore] = useState([]);
  // the own entry from the server (ranking null while unrated; null without a player name)
  const [own, setOwn] = useState(null);
  const [highscoreLastPage, setHighscoreLastPage] = useState(1);
  const [highscorePage, setHighscorePage] = useState(1);
  const { showQuickMessage } = props;

  const openHighscorePage = useCallback(
    async (page) => {
      setLoading(true);
      setHighscore([]);
      try {
        const highscore = await multiplayer.fetchHighscore(page);
        setHighscore(highscore.list);
        setOwn(highscore.own || null);
        setHighscorePage(highscore.page);
        setHighscoreLastPage(highscore.lastPage);
      } catch (error) {
        logger.warn(error);
        showQuickMessage({ text: t(tr.FETCH_HIGHSCORE_FAILED) });
      } finally {
        setLoading(false);
      }
    },
    [showQuickMessage]
  );

  useEffect(() => {
    if (open) {
      openHighscorePage();
    }
  }, [open, openHighscorePage]);

  const ownName = own ? own.name : props.playername;
  // the own row below the list when the player is not on this page (or the list is empty)
  const ownElsewhere =
    own !== null && !highscore.some((player) => player.name === own.name);
  const unrated =
    own !== null &&
    (own.ranking === null || typeof own.ranking === "undefined");

  return (
    <div style={props.style}>
      <Fab
        onClick={() => setOpen(true)}
        color="gold"
        icon="trophy"
        className={classes.fab}
      />

      <Dialog
        open={open}
        close={() => setOpen(false)}
        icon="highscore"
        title="Highscore"
      >
        <div className={classes.page}>
          <div className={classes.paginator}>
            <div>
              <Button
                icon="backward"
                disabled={highscorePage === 1}
                onClick={() =>
                  openHighscorePage(Math.max(highscorePage - 1, 1))
                }
              />
              <Button
                color="accent"
                style={{
                  marginTop: 5,
                }}
                icon="fast-backward"
                disabled={highscorePage === 1}
                onClick={() => openHighscorePage(1)}
              />
            </div>
            <div className={classes.info}>
              {loading ? (
                <Progress infiniteAnimation />
              ) : (
                <span className={classes.rank}>
                  {t(tr.ACCOUNT_OVERVIEW_RANK)}
                  <br />
                  {highscore.length > 0
                    ? `${highscore[0].ranking} - ${
                        highscore[highscore.length - 1].ranking
                      }`
                    : "–"}
                </span>
              )}
            </div>
            <div>
              <Button
                icon="forward"
                disabled={highscorePage === highscoreLastPage}
                onClick={() => {
                  openHighscorePage(
                    Math.min(highscorePage + 1, highscoreLastPage)
                  );
                }}
              />
              <Button
                color="accent"
                style={{
                  marginTop: 5,
                }}
                icon="fast-forward"
                disabled={highscorePage === highscoreLastPage}
                onClick={() => openHighscorePage(highscoreLastPage)}
              />
            </div>
          </div>
          {loading ? null : (
            <>
              <PlayerList
                withScore={true}
                players={highscore}
                username={ownName}
                showProfile={props.showPlayerProfile}
              />
              {highscore.length === 0 ? (
                <p className={classes.empty} data-testid="highscore-empty">
                  {t(tr.HIGHSCORE_EMPTY)}
                </p>
              ) : null}
              {ownElsewhere ? (
                <PlayerList
                  withScore={true}
                  players={[own]}
                  username={own.name}
                  className={classes.own}
                  showProfile={props.showPlayerProfile}
                />
              ) : null}
              {ownElsewhere && unrated && highscore.length > 0 ? (
                <p className={classes.empty} data-testid="highscore-unrated">
                  {t(tr.HIGHSCORE_UNRATED)}
                </p>
              ) : null}
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
};

const defaultProps = {
  style: {},
  className: "",
};

Highscore.propTypes = {
  style: PropTypes.object,
  className: PropTypes.string,
  showQuickMessage: PropTypes.func.isRequired,
  showPlayerProfile: PropTypes.func.isRequired,
};

export default Highscore;
