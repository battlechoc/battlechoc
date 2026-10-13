import { BattlechocError } from "@battlechoc/battlechoc-shared-functions";
import { matchSession } from "../../match/LocalMatchHost";
import logger from "../../helper/logger";

// Sends an action of the local player to the match host. Rule violations are expected
// during play (a target vanished, not enough cocoa) and only logged; other errors rethrow.
const submit = (type, payload) => {
  if (typeof matchSession.host === "undefined") {
    return Promise.reject(new Error("No running match"));
  }
  return matchSession.host.submit(type, payload);
};

const ignoreRuleErrors = (error) => {
  if (error instanceof BattlechocError) {
    logger.info(error.message);
    return undefined;
  }
  throw error;
};

export { submit, ignoreRuleErrors };
