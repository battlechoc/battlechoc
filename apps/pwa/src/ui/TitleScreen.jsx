import { Suspense } from "react";
import { createUseStyles } from "react-jss";
import {
  unlocks,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import Info from "./dialogs/Info";
import Dialog from "./dialogs/Dialog";
import Highscore from "./dialogs/Highscore";
// loaded after the title screen (src/ui/onDemand.js)
import { ChallengeDialog } from "./onDemand";
import { retryAssets } from "../firstLoad";
import { isNamed } from "../helper/playerName";
import Button from "./controls/Button";
import { outlined } from "./styles";

// The title screen's logo: its top and size (a square in vh; logo.svg fills its width) and the
// rays turning behind it, centred on the fountain (dev/icons.mjs puts it at x 308, y 22 to 392
// of logo.svg's 1209 × 924). index.html shows the logo in the same box before the script has
// arrived (its splash): change the top or the size there too.
const LOGO = {
  landscape: { top: 5, size: 50, rays: 350 },
  portrait: { top: 12, size: 40, rays: 200 },
};
const FOUNTAIN = { x: 308 / 1209, y: 207 / 1209 };

const logoBox = ({ top, size }) => ({
  top: `${top}vh`,
  width: `${size}vh`,
  height: `${size}vh`,
});

const raysBox = ({ top, size, rays }) => ({
  top: `${top + FOUNTAIN.y * size - rays / 2}vh`,
  left: `calc(50% + ${(FOUNTAIN.x - 0.5) * size - rays / 2}vh)`,
  width: `${rays}vh`,
  height: `${rays}vh`,
});

const useStyles = createUseStyles((theme) => ({
  logo: {
    position: "relative",
    width: "100%",
    height: "100%",
    display: "flex",
    justifyContent: "center",
    overflow: "hidden",
    "& > :first-child": {
      position: "absolute",
      background: "url(/images/logo.svg) no-repeat",
      zIndex: 1,
      [theme.breakpoints.orientation.landscape]: logoBox(LOGO.landscape),
      [theme.breakpoints.orientation.portrait]: logoBox(LOGO.portrait),
    },
    "& > :last-child": {
      position: "absolute",
      background: "url(/images/stripes.svg) no-repeat",
      backgroundSize: "100%",
      zIndex: 0,
      animation: "pulse 20s linear 0s infinite",
      [theme.breakpoints.orientation.landscape]: raysBox(LOGO.landscape),
      [theme.breakpoints.orientation.portrait]: raysBox(LOGO.portrait),
    },
  },
  // the menu starts at about half the screen's height; when it does not fit below that (phones
  // held sideways), the space above it shrinks, so it never reaches the bottom edge
  lowerHalf: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: theme.edge.bottom,
    zIndex: theme.layer.hud,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    pointerEvents: "none",
  },
  spaceAboveMenu: {
    flex: "0 1 auto",
    minHeight: 0,
    // as a share of the whole screen, the bottom edge included
    height: `calc((100% + ${theme.edge.bottom}) * 0.48)`,
    [theme.breakpoints.orientation.landscape]: {
      "@media screen and (max-height: 339px)": {
        height: `calc((100% + ${theme.edge.bottom}) * 0.55)`,
      },
    },
  },
  // how many matches until the Choclab and online play, below the menu
  unlockHint: {
    flex: "0 0 auto",
    maxWidth: "min(90vw, 30em)",
    margin: "0.2em 0 0",
    textAlign: "center",
    fontFamily: theme.font.display,
    fontSize: theme.font.size.md,
    letterSpacing: "0.03em",
    color: "white",
    ...outlined(theme),
  },
  menu: {
    flex: "0 0 auto",
    display: "flex",
    flexDirection: "column",
    pointerEvents: "auto",
    // the menu buttons share the width of the widest
    "& > div": {
      marginBottom: 6,
      width: "100%",
    },
  },
  decoration: {
    position: "fixed",
    background: "url(/images/decoration.svg) no-repeat",
    zIndex: 3,
    [theme.breakpoints.orientation.portrait]: {
      bottom: "-20vh",
      left: "-15vh",
      width: "45vh",
      height: "45vh",
    },
    [theme.breakpoints.orientation.landscape]: {
      bottom: "-35vh",
      left: "-25vh",
      width: "70vh",
      height: "70vh",
    },
  },
  resumeGameDialog: {
    color: "white",
    textAlign: "center",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "space-evenly",
    [theme.breakpoints.orientation.portrait]: {
      justifyContent: "unset",
      alignItems: "center",
      flexDirection: "column",
      "& > div:last-child": {
        marginTop: "3vh",
      },
    },
  },
  notification: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },
  titleScreen: {
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    zIndex: 2,
    // the page's height, not 100vh: mobile browsers take vh with their toolbar hidden, so the
    // screen grew under the toolbar and the info button at the bottom went behind it
    height: "100%",
  },
}));

/**
 * The title screen: the logo, the menu (first visit: start or skip the tutorial, sign in;
 * afterwards: Start, Choclab, Play with a friend), the highscore, the info and its dialogs. The
 * open dialogs are the Hud's state (resume, challenge), so they outlive a match.
 */
const TitleScreen = (props) => {
  const classes = useStyles();
  const { playerInfos, assetsReady, online, notification } = props;
  const { stats } = playerInfos;

  // what the player has unlocked by playing (shared progression.js, src/unlocks.js)
  const unlocked = unlocks(stats, { early: props.earlyUnlock });

  // what is missing to unlock a menu entry: more matches against the AI, or a player name
  const lockMessage = (feature, part) => {
    const left = unlocked.gamesLeft[part];
    return left > 1
      ? t(tr.UNLOCK_FEATURE_GAMES, feature, left)
      : left === 1
        ? t(tr.UNLOCK_FEATURE_ONE_GAME, feature)
        : t(tr.UNLOCK_NEEDS_NAME);
  };
  const notifyLocked = (feature, part) => {
    props.showNotification({
      title: t(tr.COINS_FOR_NEXT_FEATURE_TITLE, feature),
      message: lockMessage(feature, part),
    });
  };

  const resumeOrStartGame = () => {
    if (props.resumeGamePossible) {
      props.setResumeDialog(true);
    } else {
      props.startGame();
    }
  };

  const playername = stats.username;
  const firstPlayScreen =
    stats.tutorialFinished === false && stats.tutorialSkipped === false;
  // a few matches against the AI unlock the Choclab and online play; friends also need
  // a player name, under which others find and invite you (the server assigns one once
  // it is reachable)
  const unnamed = !isNamed(stats);
  const lockedChoclab = !unlocked.choclab;
  const lockedFriends = unnamed || !unlocked.online;
  // how far the next step is, under the menu
  const gamesLeft = unlocked.gamesLeft.online;
  const unlockHint =
    !firstPlayScreen && gamesLeft > 0
      ? gamesLeft === 1
        ? t(tr.UNLOCK_ONLINE_ONE_GAME)
        : t(tr.UNLOCK_ONLINE_GAMES, gamesLeft)
      : null;

  // the start button waits for the 3D models: it fills up while they load and offers
  // another try when one did not arrive (AssetLoader); everything else works at once
  const startButton = (label, start) => (
    <Button
      key="0"
      size="huge"
      data-testid="start-button"
      progress={
        assetsReady || props.assetsFailed ? undefined : props.assetsProgress
      }
      onClick={() => (assetsReady ? start() : retryAssets())}
    >
      {assetsReady
        ? label
        : props.assetsFailed
          ? t(tr.ASSETS_FAILED)
          : t(tr.ASSETS_LOADING)}
    </Button>
  );
  const controls = firstPlayScreen
    ? [
        startButton(t(tr.START_TUTORIAL), () => props.startTutorial()),
        <Button
          key="1"
          size="huge"
          color="accent"
          onClick={() => props.skipTutorial()}
        >
          {t(tr.SKIP_TUTORIAL)}
        </Button>,
        <Button
          key="2"
          size="huge"
          color="secondary"
          offline={!online}
          onOfflineClick={props.showOfflineMessage}
          onClick={() => props.signIn()}
        >
          {t(tr.SIGNINORUP)}
        </Button>,
      ]
    : [
        startButton(t(tr.START_GAME), () => resumeOrStartGame()),
        <Button
          key="2"
          size="huge"
          locked={lockedChoclab}
          onLockedClick={() => notifyLocked(t(tr.MAIN_MENU_CHOCLAB), "choclab")}
          offline={!online}
          onOfflineClick={props.showOfflineMessage}
          color="accent"
          onClick={() => props.openChoclab()}
        >
          {t(tr.MAIN_MENU_CHOCLAB)}
        </Button>,
        // a challenge link for a friend; locked, the dialog still takes a friend's code
        <Button
          key="3"
          size="huge"
          color="secondary"
          locked={lockedFriends}
          onLockedClick={() =>
            props.setChallengeDialog({
              locked: true,
              lockText: lockMessage(t(tr.CHALLENGE_BUTTON), "online"),
            })
          }
          offline={!online}
          onOfflineClick={props.showOfflineMessage}
          onClick={() => props.setChallengeDialog({ locked: false })}
        >
          {t(tr.CHALLENGE_BUTTON)}
        </Button>,
      ];

  const { challengeDialog } = props;
  return (
    <>
      <Dialog
        open={props.resumeDialog}
        close={() => props.setResumeDialog(false)}
        title={t(tr.HUD_RESUME_GAME)}
      >
        <div className={classes.resumeGameDialog}>
          <p>{t(tr.HUD_ASK_NEW_OR_RESUME)}</p>
          <div className={classes.actions}>
            <Button
              onClick={() => {
                props.setResumeDialog(false);
                props.resumeGame();
              }}
            >
              {t(tr.HUD_RESUME_GAME)}
            </Button>
            <Button
              color="accent"
              onClick={() => {
                props.setResumeDialog(false);
                props.startGame();
              }}
            >
              {t(tr.HUD_NEW_GAME)}
            </Button>
          </div>
        </div>
      </Dialog>
      <div className={classes.titleScreen}>
        <div className={classes.logo} data-testid="title-logo">
          <div />
          <div />
        </div>
        <div className={classes.decoration} />
        <div className={classes.lowerHalf}>
          <div className={classes.spaceAboveMenu} />
          <div className={classes.menu}>
            {/* the title screen shows once the fonts are in (no jumping labels) */}
            {assetsReady || props.fontsReady ? controls : null}
          </div>
          {(assetsReady || props.fontsReady) && unlockHint ? (
            <p className={classes.unlockHint} data-testid="unlock-hint">
              {unlockHint}
            </p>
          ) : null}
        </div>
      </div>
      <Highscore
        offline={!online}
        showOfflineMessage={props.showOfflineMessage}
        playername={playername}
        showPlayerProfile={(session) =>
          props.showProfile(session.opponent, "stacked")
        }
        showQuickMessage={props.showQuickMessage}
      />
      <Dialog
        open={notification.open}
        mode="info"
        closable={false}
        title={notification.title}
      >
        <div className={classes.notification}>
          <p>{notification.message}</p>
          <Button
            size="small"
            style={{ marginRight: 32 }}
            onClick={() => props.hideNotification()}
          >
            {t(tr.OK)}
          </Button>
        </div>
      </Dialog>
      <Info online={online} />
      {/* also open by itself for a challenge the welcome restored after a reload */}
      <Suspense fallback={null}>
        <ChallengeDialog
          open={challengeDialog !== null || props.challenge !== null}
          locked={challengeDialog !== null && challengeDialog.locked}
          lockText={
            challengeDialog !== null ? challengeDialog.lockText : undefined
          }
          close={() => props.setChallengeDialog(null)}
        />
      </Suspense>
    </>
  );
};

export default TitleScreen;
