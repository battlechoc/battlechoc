import { request, get, post } from "./client.js";

// The player's profile on the battlechoc API (the device account, src/api/account.js): the
// calls the game makes, each resolving with the answer's body. Errors are those of
// api/client.js (error.response.status for an answer other than 2xx).

/** Creates the player entry of the device account (once; again is harmless). */
export const createPlayer = () => request("post", "/user");

/** The own stats ({ stats, … }). */
export const fetchOwnProfile = () => get("/user");

/** Another player's public profile by name (a 404 when there is none). */
export const fetchProfile = async (username) =>
  (await get("/user/" + username))[0];

/** Merges the stats kept on the device into the account ({ mergedPlayerInfo }). */
export const mergeProfile = (playerInfo) => post("/user/merge", { playerInfo });

/** Finished matches of this device ({ stats }). */
export const sendTrackRecords = (stats) =>
  post("/user/trackrecords", { stats });

/** The tutorial's progress: "started", "skipped" or "finished" ({ stats }). */
export const sendTutorialStep = (step) => post("/user/tutorial/" + step);

/** Claims a player name (a 400 when it is taken or not allowed). */
export const claimUsername = (username) => post("/user/username", { username });

/** Whether a name is free ({ available }); `signal` aborts the question. */
export const checkUsername = (username, signal) =>
  get("/check/available/" + username, signal);

/** A free random name ({ username }). */
export const fetchRandomName = () => get("/generaterandomname");

/** The language the server writes to the player in. */
export const saveLanguage = (language) => post("/user/language", { language });

/** The own rank ({ ranking }). */
export const fetchRank = () => get("/rank");

/** A page of the highscore list. */
export const fetchHighscore = (page) =>
  get("/highscore" + (typeof page !== "undefined" ? "?page=" + page : ""));

/** A problem report from the settings. */
export const sendProblemReport = (report) =>
  post("/debugging/gamestate", { report });

/** The server's public key for push messages ({ publicKey }). */
export const fetchPushKey = () => get("/push/key");

/** The browser's push subscription for this player. */
export const sendPushSubscription = (subscription) =>
  post("/push/subscription", { subscription });
