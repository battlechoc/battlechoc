import React, { useEffect, useState } from "react";
import { isNamed } from "../../helper/playerName";
import { createUseStyles } from "react-jss";
import { connect } from "react-redux";
import { multiplayer } from "../../Multiplayer";
import logger from "../../helper/logger";
import Fab from "../controls/Fab";
import UnsyncedMark from "../controls/UnsyncedMark";
import PlayerNameInput from "../controls/PlayerNameInput";
import Dialog from "./Dialog";
import {
  EmptyPlayerStats,
  playerLevel,
  unlocks,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { outlined, rise } from "../styles";

const useStyles = createUseStyles((theme) => ({
  wrapper: {
    display: "flex",
    flexDirection: "column",
    marginTop: 16,
  },
  actionIcon: {
    padding: "0.5rem",
    border: "1px solid #f3f7df",
    borderRadius: "50%",
  },
  actionTitle: {
    display: "flex",
    justifyContent: "center",
    flexGrow: 1,
    marginLeft: "-0.5rem",
  },
  icon: {
    padding: "0.8em",
    backgroundSize: "100% 100%",
  },
  // the own name, while the player changes it (the pen beside the title)
  nameField: {
    width: "min(22em, 100%)",
    margin: "0 auto 1em",
  },
  // the pen beside the own name, as big as the title's text
  pen: {
    width: "1.1em !important",
    height: "1.1em !important",
    marginLeft: "0.3em",
  },
  // the own profile: level, XP to the next level, what the next matches unlock
  progress: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.35em",
    margin: "0 0 1em",
    textAlign: "center",
  },
  level: {
    fontFamily: theme.font.display,
    fontSize: theme.font.size.xl,
    lineHeight: 1,
    color: theme.color.gold.light,
    ...outlined(theme, theme.color.brown.light),
  },
  bar: {
    position: "relative",
    width: "min(16em, 70vw)",
    height: "0.9em",
    borderRadius: "1em",
    overflow: "hidden",
    boxSizing: "border-box",
    border: `0.15em solid ${theme.color.gold.light}`,
    background: "rgba(0, 0, 0, 0.3)",
    "& > div": {
      height: "100%",
      background: rise(theme.color.primary),
    },
  },
  xp: {
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    color: "white",
  },
  note: {
    margin: 0,
    maxWidth: "22em",
    fontSize: theme.font.size.sm,
  },
  offlineNote: {
    opacity: 0.85,
  },
  // rank, wins and losses in round badges sized by their text
  attributes: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    lineHeight: 1.15,
  },
  attribute: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
    padding: "0.4em",
    borderRadius: "100%",
    width: "5em",
    height: "5em",
    margin: "0.25em",
    borderWidth: "0.2em",
    borderStyle: "solid",
  },
  gold: {
    borderColor: theme.color.gold.light,
    background: rise(theme.color.gold),
    ...outlined(theme, theme.color.gold.dark),
  },
  primary: {
    borderColor: theme.color.primary.light,
    background: rise(theme.color.primary),
    ...outlined(theme, theme.color.primary.dark),
  },
  secondary: {
    borderColor: theme.color.secondary.light,
    background: rise(theme.color.secondary),
    ...outlined(theme),
  },
  accent: {
    borderColor: theme.color.accent.light,
    background: rise(theme.color.accent),
    ...outlined(theme, theme.color.accent.dark),
  },
}));

const AccountOverview = (props) => {
  const classes = useStyles();
  // the own name is changed here (offline too: Multiplayer keeps it until the server answers)
  const [editName, setEditName] = useState(false);
  useEffect(() => {
    if (!props.open) {
      setEditName(false);
    }
  }, [props.open]);

  const isPlayerAccount = typeof props.playerAccount === "undefined";

  let winnings;
  let losses;
  let playerName = EmptyPlayerStats.username;
  let ranking;

  React.useEffect(() => {
    if (typeof props.playerAccount === "undefined") {
      multiplayer.computeRank();
    }
  }, [props.open, props.playerAccount]);


  if (isPlayerAccount) {
    playerName = props.playerInfos.stats.username;
    ranking = props.ranking;
    // the server's numbers once it answered, else the device's own record
    winnings = props.playerInfos.stats.winnings || 0;
    losses = props.playerInfos.stats.losses || 0;
  } else {
    playerName = props.playerAccount.name;
    winnings = props.playerAccount.winnings;
    losses = props.playerAccount.losses;
    ranking = props.playerAccount.ranking;
  }

  const createProfileLink = () => {
    const link = "https://battlechoc.com/" + playerName;
    if (navigator.share) {
      navigator
        .share({
          title: window.document.title,
          text: t(tr.INVITATION),
          url: link,
        })
        .catch((error) =>
          logger.info("error sharing multiplayer session", error)
        );
    } else {
      let whatsappWindowRef = window.open();
      whatsappWindowRef.location =
        "https://api.whatsapp.com/send?text=" +
        encodeURIComponent(t(tr.INVITATION) + " - " + link);
    }
  };

  // a profile link only helps where others can open it
  // a player who chose a name or got one (after the tutorial) can change it
  const stats = props.playerInfos.stats;
  const nameEditable =
    isPlayerAccount &&
    (isNamed(stats) ||
      stats.tutorialSkipped === true ||
      stats.tutorialFinished === true);
  const changeName = async (username) => {
    try {
      await multiplayer.changeUsername(username, props.online);
      setEditName(false);
    } catch (error) {
      logger.warn("could not change the name", error);
    }
  };

  const share =
    playerName !== EmptyPlayerStats.username && (props.online || !isPlayerAccount) ? (
      <Fab
        style={{ marginLeft: "2vw", marginRight: "-7vw" }}
        icon="share"
        color="secondary"
        onClick={createProfileLink}
      />
    ) : null;

  return (
    <Dialog
      open={props.open}
      icon="user"
      close={props.close}
      mode={props.dialogStyle}
      id="accountOverviewDialog"
      title={
        playerName.length > 20 ? `${playerName.slice(0, 17)}...` : playerName
      }
      titleSlotAfter={
        <>
          {isPlayerAccount && props.playerInfos.stats.usernamePending ? <UnsyncedMark /> : null}
          {nameEditable ? (
            <Fab
              className={classes.pen}
              icon="pen"
              color="secondary"
              aria-label={t(tr.PROFILE_CHANGE_NAME)}
              data-testid="change-name"
              onClick={() => setEditName(!editName)}
            />
          ) : null}
          {share}
        </>
      }
    >
      <div className={classes.wrapper}>
        {nameEditable && editName ? (
          <PlayerNameInput
            className={classes.nameField}
            editMode
            setPlayerName={changeName}
            startValue={stats.username}
            current={stats.username}
            offline={!props.online}
          />
        ) : null}

        {isPlayerAccount
          ? (() => {
              const level = playerLevel(props.playerInfos.stats.score);
              const gamesLeft = unlocks(props.playerInfos.stats, {
                early: props.earlyUnlock,
              }).gamesLeft.online;
              return (
                <div className={classes.progress} data-testid="profile-progress">
                  <div className={classes.level} data-testid="profile-level">
                    {`${t(tr.ACCOUNT_OVERVIEW_LEVEL)} ${level.level}`}
                  </div>
                  <div
                    className={classes.bar}
                    role="progressbar"
                    aria-valuemin={level.from}
                    aria-valuemax={level.to}
                    aria-valuenow={level.xp}
                  >
                    <div style={{ width: `${Math.round(level.progress * 100)}%` }} />
                  </div>
                  <div className={classes.xp} data-testid="profile-xp">
                    {t(tr.PROFILE_XP, level.xp, level.to)}
                  </div>
                  {gamesLeft > 0 ? (
                    <p className={classes.note} data-testid="profile-next-unlock">
                      {gamesLeft === 1
                        ? t(tr.UNLOCK_ONLINE_ONE_GAME)
                        : t(tr.UNLOCK_ONLINE_GAMES, gamesLeft)}
                    </p>
                  ) : null}
                  {props.online ? null : (
                    <p
                      className={`${classes.note} ${classes.offlineNote}`}
                      data-testid="profile-offline"
                    >
                      {t(tr.PROFILE_OFFLINE)}
                    </p>
                  )}
                </div>
              );
            })()
          : null}

        <div className={classes.attributes}>
          {/* the rank comes from the server */}
          {!isPlayerAccount || props.online ? (
            <div className={`${classes.gold} ${classes.attribute}`}>
              <div
                className={classes.icon}
                style={{ background: `url(/images/trophy.svg) no-repeat` }}
              />
              <div>{t(tr.ACCOUNT_OVERVIEW_RANK)}</div>
              {/* no rank (null) until the first rated match */}
              <div data-testid="account-rank">
                {ranking === null || typeof ranking === "undefined"
                  ? "–"
                  : ranking}
              </div>
            </div>
          ) : null}
          <div className={`${classes.primary} ${classes.attribute}`}>
            <div
              className={classes.icon}
              style={{ background: `url(/images/win.svg) no-repeat` }}
            />
            <div>{t(tr.ACCOUNT_OVERVIEW_WON)}</div>
            <div>{winnings}</div>
          </div>
          <div className={`${classes.accent} ${classes.attribute}`}>
            <div
              className={classes.icon}
              style={{ background: `url(/images/lost.svg) no-repeat` }}
            />
            <div>{t(tr.ACCOUNT_OVERVIEW_LOST)}</div>
            <div>{losses}</div>
          </div>
        </div>

      </div>
    </Dialog>
  );
};

const mapStateToProps = (state) => ({
  playerInfos: state.ui.playerInfos,
  ranking: state.ui.ranking,
  online: state.ui.online,
  earlyUnlock: state.ui.earlyUnlock,
});

const mapDispatchToProps = {};

const AccountOverviewContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(AccountOverview);

export default AccountOverviewContainer;
