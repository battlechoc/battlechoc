import { Suspense } from "react";
import { useSelector } from "react-redux";
import { createUseStyles } from "react-jss";
import {
  engine,
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
// loaded after the title screen (src/ui/onDemand.js)
import { GameEndOverview } from "./onDemand";
import { liveLobby } from "../match/liveLobby";
import { matchSession } from "../match/LocalMatchHost";
import { selectActiveGame } from "../match/matchSlice";
import BuildPalette from "./match/BuildPalette";
import WeaponPalette from "./match/WeaponPalette";
import ResourcePanel from "./match/ResourcePanel";
import MatchBanner from "./match/MatchBanner";
import InfoCard from "./match/InfoCard";

const useStyles = createUseStyles((theme) => ({
  // the bottom of a match: what to build (its tips above it) at the left, the weapons at the
  // right, always an edge apart; the buildings wrap instead of running into the weapons. Only
  // the buttons take the pointer, the space between them belongs to the board.
  matchBar: {
    position: "absolute",
    left: theme.edge.left,
    right: theme.edge.right,
    bottom: theme.edge.bottom,
    zIndex: theme.layer.hud,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: theme.edge.gap,
    pointerEvents: "none",
  },
  buildColumn: {
    flex: "1 1 auto",
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: theme.edge.gap,
  },
}));

/**
 * After a challenge match both may ask for another one (a challenge again): `rematch` asks
 * (undefined when it cannot be asked or is waiting), `status` says how the offer stands.
 */
export const useRematch = (game) => {
  const matchOnline = useSelector((state) => state.match.online);
  const matchKind = useSelector((state) => state.match.kind);
  const outgoingInvite = useSelector((state) => state.live.outgoingInvite);
  const inviteClosed = useSelector((state) => state.live.inviteClosed);
  const liveError = useSelector((state) => state.live.error);
  const rematchable = Boolean(matchOnline && matchKind === "challenge" && matchSession.host);
  const opponentName = game.players[1 - game.viewer].name;
  const status = !rematchable
    ? undefined
    : outgoingInvite
    ? t(tr.REMATCH_WAITING, opponentName)
    : inviteClosed === "declined" || inviteClosed === "expired"
    ? t(tr.REMATCH_DECLINED, opponentName)
    : liveError === "PLAYER_OFFLINE"
    ? t(tr.REMATCH_GONE, opponentName)
    : undefined;
  const rematch =
    rematchable && !outgoingInvite
      ? () => liveLobby.requestRematch(matchSession.host.matchId).catch(() => {})
      : undefined;
  return { rematch, status };
};

/** A running match: banner, resources, the palettes at the bottom and, at its end, the overview. */
const MatchHud = ({ endGame }) => {
  const classes = useStyles();
  const game = useSelector(selectActiveGame);
  const overviewVisible = useSelector((state) => state.ui.overviewVisible);
  const matchAwards = useSelector((state) => state.match.awards);
  const matchOnline = useSelector((state) => state.match.online);
  const matchResult = useSelector((state) => state.match.result);
  const { rematch, status } = useRematch(game);
  const result = game.outcome;
  return (
    <div>
      <MatchBanner />
      <ResourcePanel />
      <div className={classes.matchBar}>
        <div className={classes.buildColumn}>
          <InfoCard />
          <BuildPalette />
        </div>
        <WeaponPalette />
      </div>
      {overviewVisible && result ? (
        <Suspense fallback={null}>
          <GameEndOverview
            awards={(matchAwards || []).map((award) => ({
              ...engine.matchAwards.find((candidate) => candidate.key === award.key),
              xp: award.xp,
            }))}
            outcome={result.winners.length === 1 && result.winners[0] === game.viewer ? "won" : "lost"}
            isWinner={result.winners.includes(game.viewer)}
            verified={matchOnline}
            drops={matchResult ? matchResult.drops : undefined}
            rematch={rematch}
            rematchStatus={status}
            finishGame={() => endGame()}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

export default MatchHud;
