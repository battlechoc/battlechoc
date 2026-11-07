import { EmptyPlayerStats } from "@battlechoc/battlechoc-shared-functions";

/** The name of a player who has not chosen one ("Chocnonymous"). */
export const DEFAULT_NAME = EmptyPlayerStats.username;

/** Whether the stats carry a name the player chose (the default is no name). */
export const isNamed = (stats) =>
  Boolean(stats) && typeof stats.username === "string" && stats.username !== DEFAULT_NAME;
