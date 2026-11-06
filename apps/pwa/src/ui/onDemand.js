import { lazy } from "react";
import { loadChunk } from "../helper/loadChunk";

// What a player opens on demand is not part of the first load (npm run check:bundle): the
// dialogs, the lab, the tutorial and the end of a match are chunks of their own. Render them
// inside <Suspense fallback={null}>: until a chunk is in, nothing shows, as for a closed dialog.
// The dialogs that are always mounted ask for their chunk with the first render; the others are
// asked for once the title screen stands (warmOnDemand), so a tap never waits for the network,
// and a device that goes offline before the service worker has stored the game still has them.
//
// Import these components only from here. A static import elsewhere (or a barrel file that
// re-exports them) puts them back into the first load.

const dialogs = loadChunk(() => import("./dialogs/onDemandDialogs"));
const lab = loadChunk(() => import("./pages/Choclab"));
const tutorial = loadChunk(() => import("../tutorial/Tutorial"));
const gameEnd = loadChunk(() => import("./controls/GameEndOverview"));

const dialog = (name) =>
  lazy(() => dialogs().then((module) => ({ default: module[name] })));

export const Settings = dialog("Settings");
export const AccountOverview = dialog("AccountOverview");
export const ChallengeDialog = dialog("ChallengeDialog");
export const ChallengeCard = dialog("ChallengeCard");
export const IncomingInvite = dialog("IncomingInvite");
export const Matchmaking = dialog("Matchmaking");
export const Unlocked = dialog("Unlocked");
export const NameConflict = dialog("NameConflict");
export const UpdateAvailable = dialog("UpdateAvailable");
export const Choclab = lazy(lab);
export const Tutorial = lazy(tutorial);
export const GameEndOverview = lazy(gameEnd);

/** Asks for every on-demand chunk now (once the title screen stands). */
export const warmOnDemand = () => {
  [dialogs, lab, tutorial, gameEnd].forEach((load) => load());
};
