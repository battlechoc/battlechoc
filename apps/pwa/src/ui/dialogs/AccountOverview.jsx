import React, { useState } from "react";
import PropTypes from "prop-types";
import { createUseStyles } from "react-jss";
import { connect } from "react-redux";
import { notifyPlayerSignedOut } from "../UiActions";
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import {
  autoUpgradeAnonymousUsers,
  getTranslation,
  initializeUI,
} from "@firebase-oss/ui-core";
import {
  FacebookSignInButton,
  FirebaseUIProvider,
  ForgotPasswordAuthScreen,
  GoogleSignInButton,
  SignInAuthScreen,
  SignUpAuthScreen,
  useUI,
} from "@firebase-oss/ui-react";
import "@firebase-oss/ui-styles/dist.min.css";
import { multiplayer } from "../../Multiplayer";
import { app, auth } from "../../firebase";
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
  signin: {
    display: "flex",
    alignItems: "center",
    flexDirection: "column",
    fontFamily: "Bangers",
    "& p": {
      fontSize: "2vw",
      fontFamily: "Montserrat",
      width: "80%",
      margin: 0,
    },
  },
  signout: {
    display: "flex",
    alignItems: "center",
    flexDirection: "column",
    "& p": {
      textAlign: "center",
      fontSize: "2.5vw",
      [theme.breakpoints.orientation.portrait]: {
        fontSize: "2.5vh",
      },
    },
  },
  firebaseUi: {
    "--fui-primary": theme.color.primary.light,
    "--fui-primary-hover": theme.color.primary.dark,
    "--fui-primary-surface": "white",
    "--fui-text": "white",
    "--fui-text-muted": "rgba(255,255,255,.8)",
    "--fui-background": "transparent",
    "--fui-border": "rgba(255,255,255,.5)",
    "--fui-input": "rgba(255,255,255,.5)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    "& .fui-provider__button, & .signin-email": {
      clipPath: "url(#menu-button-clip-path)",
      fontFamily: "Bangers",
      fontSize: "3vw",
      border: "none",
      padding: "2vw",
      marginBottom: 15,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "1vw",
      width: "35vw",
      cursor: "pointer",
      color: "white",
      "& svg": {
        width: "3vw",
        height: "3vw",
      },
    },
    "& .fui-provider__button[data-provider='google.com']": {
      color: "#757575",
      background: `linear-gradient(0deg, #dedede 0%, #fff 70%)`,
    },
    "& .fui-provider__button[data-provider='facebook.com']": {
      background: `linear-gradient(0deg, ${theme.color.facebook.dark} 0%, ${theme.color.facebook.light} 70%)`,
    },
    "& .signin-email": {
      background: `linear-gradient(0deg, ${theme.color.accent.dark} 0%, ${theme.color.accent.light} 70%)`,
    },
    "& .signin-back": {
      alignSelf: "flex-start",
    },
    "& .fui-card": {
      background: "unset",
      boxShadow: "none",
      border: "none",
      fontFamily: "Montserrat",
      width: "100%",
      maxWidth: "unset",
    },
    "& .fui-card__title": {
      fontFamily: "Bangers",
      fontSize: "3vw",
      color: "white",
    },
    "& .fui-card__subtitle, & label": {
      color: "white",
    },
    "& fieldset": {
      border: "none",
      margin: 0,
      padding: 0,
    },
    "& input": {
      borderColor: "rgba(255,255,255,.5)",
      color: "white",
      background: "transparent",
      padding: 6,
    },
    "& button.fui-button:not(.fui-provider__button)": {
      fontFamily: "Bangers",
      fontSize: "2.5vw",
      color: "white",
      borderRadius: "12.5%",
      border: `3px solid ${theme.color.primary.light}`,
      background: `linear-gradient(0deg, ${theme.color.primary.dark} 0%, ${theme.color.primary.light} 100%)`,
    },
    "& .fui-form__action": {
      color: theme.color.accent.light,
      background: "none",
      border: "none",
      cursor: "pointer",
    },
  },
}));

const recoverCredential = (error, credential, provider) => {
  if (typeof credential !== "undefined") {
    return credential;
  } else if (provider?.providerId === GoogleAuthProvider.PROVIDER_ID) {
    return GoogleAuthProvider.credentialFromError(error);
  } else if (provider?.providerId === FacebookAuthProvider.PROVIDER_ID) {
    return FacebookAuthProvider.credentialFromError(error);
  }
  return OAuthProvider.credentialFromError(error);
};

const firebaseUi = initializeUI({
  app,
  auth,
  behaviors: [
    autoUpgradeAnonymousUsers({
      // the account already exists: switch to it and merge the anonymous player stats into it
      onUpgradeFailure: async ({ error, credential, provider }) => {
        if (
          ![
            "auth/credential-already-in-use",
            "auth/email-already-in-use",
          ].includes(error?.code)
        ) {
          return;
        }

        const existingCredential = recoverCredential(
          error,
          credential,
          provider
        );
        if (!existingCredential) {
          return;
        }

        try {
          await signInWithCredential(auth, existingCredential);
          multiplayer.mergePlayerStats();
          return "handled";
        } catch (signInErr) {
          console.log(
            "could not sign in with credentials after merge conflict during anonymous account upgrade. ",
            signInErr
          );
        }
      },
    }),
  ],
});

const isElectron =
  navigator.userAgent.toLowerCase().indexOf(" electron/") !== -1;

const SignInOptions = ({ className }) => {
  const ui = useUI();
  const [screen, setScreen] = useState("providers");

  // linking an anonymous account keeps the uid, so onAuthStateChanged does not fire
  const signedIn = (user) => {
    if (user) {
      multiplayer.authStateChanged(user);
    }
  };

  const back = (
    <Fab
      icon="back"
      color="secondary"
      className="signin-back"
      onClick={() => setScreen("providers")}
    />
  );

  if (screen === "signIn") {
    return (
      <div className={className}>
        {back}
        <SignInAuthScreen
          onSignIn={signedIn}
          onSignUpClick={() => setScreen("signUp")}
          onForgotPasswordClick={() => setScreen("forgotPassword")}
        />
      </div>
    );
  } else if (screen === "signUp") {
    return (
      <div className={className}>
        {back}
        <SignUpAuthScreen
          onSignUp={signedIn}
          onSignInClick={() => setScreen("signIn")}
        />
      </div>
    );
  } else if (screen === "forgotPassword") {
    return (
      <div className={className}>
        {back}
        <ForgotPasswordAuthScreen
          onBackToSignInClick={() => setScreen("signIn")}
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {isElectron ? null : (
        <>
          <GoogleSignInButton
            onSignIn={(credential) => signedIn(credential?.user)}
          />
          <FacebookSignInButton
            onSignIn={(credential) => signedIn(credential?.user)}
          />
        </>
      )}
      <button
        type="button"
        className="signin-email"
        onClick={() => setScreen("signIn")}
      >
        {getTranslation(ui, "labels", "signInWithEmail")}
      </button>
    </div>
  );
};

const AccountOverview = (props) => {
  const classes = useStyles();
  const [refreshFriend, setRefreshFriend] = useState(false);

  const isPlayerAccount = typeof props.playerAccount === "undefined";

  let level = 0;
  let winnings = 0;
  let losses = 0;
  let loggedIn = false;
  let playerName = EmptyPlayerStats.username;
  let ranking = 0;

  React.useEffect(() => {
    if (typeof props.playerAccount === "undefined") {
      multiplayer.computeRank();
    }
  }, [props.open, props.playerAccount]);

  const signOut = () => {
    Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
    multiplayer.signOut(props.notifyPlayerSignedOut);
  };

  if (isPlayerAccount) {
    playerName = props.playerInfos.stats.username;
    ranking = props.ranking;

    if (typeof props.playerInfos.stats.level !== "undefined") {
      level = Object.values(props.playerInfos.stats.level).reduce(
        (value, prev) => value + prev,
        1
      );
    }

    if (auth.currentUser) {
      winnings = props.playerInfos.stats.winnings;
      losses = props.playerInfos.stats.losses;
    }

    if (auth.currentUser && !auth.currentUser.isAnonymous) {
      loggedIn = true;
    }
  } else {
    playerName = props.playerAccount.name;
    level = props.playerAccount.level;

    if (typeof level !== "number") {
      level = 1;
    }

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
          if (
            typeof props.multiplayerSessions !== "undefined" &&
            !isPlayerAccount
          ) {
            const actions = [];
            const gamesAgainstOpponent = props.multiplayerSessions.filter(
              (session) => session.opponent.name === playerName
            );
            if (
              props.playerInfos.stats.score >= 1000 &&
              props.playerAccount.score >= 1000 &&
              props.playerInfos.stats.name !== EmptyPlayerStats.username
            ) {
              if (gamesAgainstOpponent.length === 0) {
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
                    {t(tr.START_GAME)}
                  </Button>
                );
              } else {
                actions.push(
                  <Button
                    key={1}
                    color="secondary"
                    onClick={() => {
                      Jukebox.playSound(Jukebox.SOUNDS.UI_ACCEPT);
                      props.joinGame(gamesAgainstOpponent[0].id);
                      props.close();
                    }}
                  >
                    {t(tr.JOIN_GAME)}
                  </Button>
                );
              }

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
          <div className={`${classes.gold} ${classes.attribute}`}>
            <div
              className={classes.icon}
              style={{ background: `url(/images/level-up-icon.svg) no-repeat` }}
            />
            <div>{t(tr.ACCOUNT_OVERVIEW_LEVEL)}</div>
            <div>{level}</div>
          </div>
        </div>

        {isPlayerAccount ? (
          loggedIn ? (
            <div className={classes.signout}>
              <p>
                {t(tr.ACCOUNT_OVERVIEW_ASSOCIATION)} {props.playerInfos.email}
              </p>
              <Button color="accent" onClick={signOut}>
                {t(tr.SIGN_OUT)}
              </Button>
            </div>
          ) : (
            <div className={classes.signin}>
              <FirebaseUIProvider ui={firebaseUi}>
                <SignInOptions className={classes.firebaseUi} />
              </FirebaseUIProvider>
              <p>{t(tr.ACCOUNT_OVERVIEW_CREATE_INFO)}</p>
            </div>
          )
        ) : null}
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
  multiplayerSessions: state.ui.multiplayerSessions,
  friends: state.ui.friends,
});

const mapDispatchToProps = {
  notifyPlayerSignedOut,
};

const AccountOverviewContainer = connect(
  mapStateToProps,
  mapDispatchToProps
)(AccountOverview);

export default AccountOverviewContainer;
