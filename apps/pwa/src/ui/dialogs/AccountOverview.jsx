import React, { useState } from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import { connect } from "react-redux";
import { multiplayer } from "../../Multiplayer";
import logger from "../../helper/logger";
import { Jukebox } from "../misc";
import { Button, Progress, Fab } from "../controls";
import UnsyncedMark from "../controls/UnsyncedMark";
import Dialog from "./Dialog";
import {
  EmptyPlayerStats,
  playerLevel,
  unlocks,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";

const useStyles = createUseStyles((theme) => ({
  wrapper: {
    display: "flex",
    flexDirection: "column",
    marginTop: 16,
  },
  pendingButton: {
    backgroundColor: "#777",
  },
  opponentActions: {
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-evenly",
    alignItems: "center",
    height: 140,
    marginBottom: 24,
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
  noAccountInfo: {
    textAlign: "center",
    color: "white",
    marginBottom: "1em",
  },
  icon: {
    padding: "0.8em",
    backgroundSize: "100% 100%",
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
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.brown.light}`,
    "-webkit-font-smoothing": "antialiased",
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
      background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 100%)`,
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
    background: `linear-gradient(0deg, ${theme.color.gold.dark} 0%, ${theme.color.gold.light} 100%)`,
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.gold.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  primary: {
    borderColor: theme.color.primary.light,
    background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 100%)`,
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.primary.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  secondary: {
    borderColor: theme.color.secondary.light,
    background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`,
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  accent: {
    borderColor: theme.color.accent.light,
    background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`,
    "-webkit-text-stroke": `${theme.font.stroke} ${theme.color.accent.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
}));

const AccountOverview = (props) => {
  const classes = useStyles();
  const [refreshFriend, setRefreshFriend] = useState(false);

  const isPlayerAccount = typeof props.playerAccount === "undefined";

  let winnings = 0;
  let losses = 0;
  let playerName = EmptyPlayerStats.username;
  let ranking = 0;

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
          {share}
        </>
      }
    >
      <div className={classes.wrapper}>
        {(() => {
          if (!isPlayerAccount) {
            const actions = [];
            if (props.playerInfos.stats.username !== EmptyPlayerStats.username) {
              // a live match: invite the player (in-app when online, else by push)
              actions.push(
                <Button
                  key={0}
                  color="secondary"
                  onClick={() => {
                    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                    props.challengePlayer(playerName);
                    props.close();
                  }}
                >
                  {t(tr.ONLINE_INVITE_SEND)}
                </Button>
              );

              if (
                !props.friends.map((friend) => friend.name).includes(playerName)
              ) {
                actions.push(
                  <Button
                    key={2}
                    className={`${refreshFriend ? classes.pendingButton : ""}`}
                    onClick={async () => {
                      if (!refreshFriend) {
                        setRefreshFriend(true);
                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                        await props.addFriend(playerName);
                        setRefreshFriend(false);
                      }
                    }}
                  >
                    {refreshFriend ? (
                      <Progress infiniteAnimation size={24} />
                    ) : (
                      t(tr.ADD_FRIEND)
                    )}
                  </Button>
                );
              } else {
                actions.push(
                  <Button
                    key={3}
                    color="accent"
                    className={`${refreshFriend ? classes.pendingButton : ""}`}
                    onClick={async () => {
                      if (!refreshFriend) {
                        setRefreshFriend(true);
                        Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                        props.removeFriend(playerName);
                        await props.addFriend(playerName);
                        setRefreshFriend(false);
                      }
                    }}
                  >
                    {refreshFriend ? (
                      <Progress infiniteAnimation size={24} />
                    ) : (
                      t(tr.REMOVE_FRIEND)
                    )}
                  </Button>
                );
              }
              return <div className={classes.opponentActions}>{actions}</div>;
            } else if (props.playerInfos.stats.score < 1000) {
              return (
                <div className={classes.noAccountInfo}>
                  {t(tr.NO_ACCOUNT_INFO)}
                </div>
              );
            } else {
              return null;
            }
          }
        })()}

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

AccountOverview.propTypes = {
  close: PropTypes.func.isRequired,
  open: PropTypes.bool.isRequired,
  dialogStyle: PropTypes.string.isRequired,
};

const mapStateToProps = (state) => ({
  playerInfos: state.ui.playerInfos,
  ranking: state.ui.ranking,
  friends: state.ui.friends,
  online: state.ui.online,
  earlyUnlock: state.ui.earlyUnlock,
});

const mapDispatchToProps = {};

const AccountOverviewContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(AccountOverview);

export default AccountOverviewContainer;
