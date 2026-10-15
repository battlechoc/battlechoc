import React, { useState } from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import { connect } from "react-redux";
import { multiplayer } from "../../Multiplayer";
import { account } from "../../account";
import logger from "../../helper/logger";
import { Jukebox } from "../misc";
import { Button, Progress, Fab } from "../controls";
import Dialog from "./Dialog";
import {
  EmptyPlayerStats,
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
    fontSize: "3vw",
    textAlign: "center",
    color: "white",
    marginBottom: "2vw",
    [theme.breakpoints.orientation.portrait]: {
      fontSize: "3vh",
      marginBottom: "2vh",
    },
  },
  icon: {
    padding: "2.5vw",
    backgroundSize: "100% 100%",
  },
  attributes: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "center",
    fontFamily: "Bangers",
    fontSize: "3vw",
    [theme.breakpoints.orientation.portrait]: {
      fontSize: "3vh",
    },
  },
  attribute: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
    padding: "1vw",
    borderRadius: "100%",
    width: "12vw",
    height: "12vw",
    margin: "0.5vw",
    borderWidth: "0.6vw",
    borderStyle: "solid",
    [theme.breakpoints.orientation.portrait]: {
      padding: "1vh",
      width: "12vh",
      height: "12vh",
      margin: "0.5vh",
      borderWidth: "0.6vh",
    },
  },
  gold: {
    borderColor: theme.color.gold.light,
    background: `linear-gradient(0deg, ${theme.color.gold.dark} 0%, ${theme.color.gold.light} 100%)`,
    "-webkit-text-stroke": `0.1vh ${theme.color.gold.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  primary: {
    borderColor: theme.color.primary.light,
    background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 100%)`,
    "-webkit-text-stroke": `0.1vh ${theme.color.primary.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  secondary: {
    borderColor: theme.color.secondary.light,
    background: `linear-gradient(0deg, ${theme.color.secondary.dark} 0%, ${theme.color.secondary.light} 100%)`,
    "-webkit-text-stroke": `0.1vh ${theme.color.secondary.dark}`,
    "-webkit-font-smoothing": "antialiased",
  },
  accent: {
    borderColor: theme.color.accent.light,
    background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 100%)`,
    "-webkit-text-stroke": `0.1vh ${theme.color.accent.dark}`,
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

    if (account.isReady()) {
      winnings = props.playerInfos.stats.winnings;
      losses = props.playerInfos.stats.losses;
    }
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

  const share =
    playerName !== EmptyPlayerStats.username ? (
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
      autoscale={true}
      title={
        playerName.length > 20 ? `${playerName.slice(0, 17)}...` : playerName
      }
      titleSlotAfter={share}
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

        <div className={classes.attributes}>
          <div className={`${classes.gold} ${classes.attribute}`}>
            <div
              className={classes.icon}
              style={{ background: `url(/images/trophy.svg) no-repeat` }}
            />
            <div>{t(tr.ACCOUNT_OVERVIEW_RANK)}</div>
            <div>{ranking}</div>
          </div>
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
});

const mapDispatchToProps = {};

const AccountOverviewContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(AccountOverview);

export default AccountOverviewContainer;
