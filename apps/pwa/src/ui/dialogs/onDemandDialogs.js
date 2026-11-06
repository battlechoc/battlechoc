// The dialogs that are always mounted and show nothing until something opens them: one chunk,
// asked for with the first render (src/ui/onDemand.js). Highscore and Info are not among them,
// their round buttons are part of the title screen.
export { default as Settings } from "./Settings";
export { default as AccountOverview } from "./AccountOverview";
export { default as ChallengeDialog } from "./ChallengeDialog";
export { default as ChallengeCard } from "./ChallengeCard";
export { default as IncomingInvite } from "./IncomingInvite";
export { default as Matchmaking } from "./Matchmaking";
export { default as Unlocked } from "./Unlocked";
export { default as NameConflict } from "./NameConflict";
export { default as UpdateAvailable } from "./UpdateAvailable";
