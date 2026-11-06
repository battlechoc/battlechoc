import React, { useState, useEffect, useCallback } from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import Dialog from "./Dialog";
import Fab from "../controls/Fab";
import Progress from "../controls/Progress";
import Button from "../controls/Button";
import PlayerList from "../controls/PlayerList";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { multiplayer } from "../../Multiplayer";
import logger from "../../helper/logger";
import withDefaultProps from "../../helper/defaultProps";

const useStyles = createUseStyles((theme) => ({
  // the title screen's top right corner, level with the buttons at the top left
  fab: {
    position: "absolute",
    top: theme.edge.top,
    right: theme.edge.right,
    zIndex: 4,
  },
  // below the list: back buttons, the shown ranks, forward buttons
  paginator: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flex: "0 0 auto",
    marginTop: "0.6em",
  },
  // the page buttons stay small next to the list (the default icon button grows with the screen)
  nav: {
    display: "flex",
    alignItems: "center",
    gap: "0.5em",
    "& > div": {
      width: "clamp(30px, 2.6vw, 44px)",
      height: "clamp(30px, 2.6vw, 44px)",
    },
  },
  // on a short screen only the list scrolls: the page buttons stay below it
  page: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minHeight: 0,
  },
  list: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
  },
  // the old page stays while the next one loads, so the dialog keeps its height
  loading: {
    opacity: 0.5,
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
  // the own entry from the server (null without a player name)
  const [own, setOwn] = useState(null);
  const [highscoreLastPage, setHighscoreLastPage] = useState(1);
  const [highscorePage, setHighscorePage] = useState(1);
  // a failed request is not an empty list: the toast explains it
  const [failed, setFailed] = useState(false);
  const { showQuickMessage } = props;

  const openHighscorePage = useCallback(
    async (page) => {
      setLoading(true);
      setFailed(false);
      try {
        const highscore = await multiplayer.fetchHighscore(page);
        setHighscore(highscore.list);
        setOwn(highscore.own || null);
        setHighscorePage(highscore.page);
        setHighscoreLastPage(highscore.lastPage);
      } catch (error) {
        logger.warn(error);
        setHighscore([]);
        setFailed(true);
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

  return (
    <div style={props.style}>
      <Fab
        onClick={() => setOpen(true)}
        offline={props.offline}
        onOfflineClick={props.showOfflineMessage}
        color="gold"
        icon="trophy"
        className={classes.fab}
      />

      <Dialog
        open={open}
        close={() => setOpen(false)}
        icon="highscore"
        title="Highscore"
        mode="list"
      >
        <div className={classes.page}>
          <div className={`${classes.list} ${loading ? classes.loading : ""}`}>
            <PlayerList
              withScore={true}
              players={highscore}
              username={ownName}
              showProfile={props.showPlayerProfile}
            />
            {highscore.length === 0 && !failed && !loading ? (
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
          </div>
          <div className={classes.paginator}>
            <div className={classes.nav}>
              <Button
                color="accent"
                icon="fast-backward"
                disabled={highscorePage === 1}
                onClick={() => openHighscorePage(1)}
              />
              <Button
                icon="backward"
                disabled={highscorePage === 1}
                onClick={() =>
                  openHighscorePage(Math.max(highscorePage - 1, 1))
                }
              />
            </div>
            <div className={classes.info}>
              {loading ? (
                <Progress infiniteAnimation />
              ) : (
                <span className={classes.rank}>
                  {t(tr.ACCOUNT_OVERVIEW_RANK)}{" "}
                  {highscore.length > 0
                    ? `${highscore[0].ranking} - ${
                        highscore[highscore.length - 1].ranking
                      }`
                    : "–"}
                </span>
              )}
            </div>
            <div className={classes.nav}>
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
                icon="fast-forward"
                disabled={highscorePage === highscoreLastPage}
                onClick={() => openHighscorePage(highscoreLastPage)}
              />
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

const defaultProps = {
  style: {},
  className: "",
  offline: false,
};

Highscore.propTypes = {
  style: PropTypes.object,
  className: PropTypes.string,
  showQuickMessage: PropTypes.func.isRequired,
  showPlayerProfile: PropTypes.func.isRequired,
  // the server does not answer: the trophy is grey and explains itself
  offline: PropTypes.bool,
  showOfflineMessage: PropTypes.func,
};

export default Highscore;
