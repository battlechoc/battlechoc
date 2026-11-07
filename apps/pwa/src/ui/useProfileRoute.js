import { useEffect, useState } from "react";
import {
  translate as t,
  translationKeys as tr,
} from "@battlechoc/battlechoc-shared-functions";
import { account } from "../api/account";
import { fetchProfile } from "../api/profile";
import logger from "../helper/logger";

/**
 * A player's profile link (battlechoc.com/<username>): once the device account is there, the
 * profile is asked for and handed to `show`; an unknown name says so (`showQuickMessage`).
 * Returns whether the game is still waiting for it (the waiting room).
 */
const useProfileRoute = (username, { show, showQuickMessage }) => {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (typeof username === "undefined") {
      return;
    }
    const open = async () => {
      setWaiting(true);
      try {
        await account.ensure();
        show(await fetchProfile(username));
      } catch (error) {
        if (error.response) {
          if (error.response.status === 404) {
            showQuickMessage({ text: t(tr.WARNING_PLAYER_NOT_FOUND, username) });
          } else {
            logger.warn(error, error.response.toString());
          }
        } else {
          logger.error(error);
        }
      } finally {
        setWaiting(false);
      }
    };
    open();
    // only for a new link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, showQuickMessage]);
  return waiting;
};

export default useProfileRoute;
