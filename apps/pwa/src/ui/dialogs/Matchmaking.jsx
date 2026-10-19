import React, { useEffect, useState } from "react";
import {
  translate as t,
  translationKeys as tr,
  live,
} from "@battlechoc/battlechoc-shared-functions";
import Dialog from "./Dialog";
import Button from "../controls/Button";

// Shown while the Start button waits for an opponent: a countdown to the server AI, which can
// also be called right away.
const Matchmaking = ({ open, cancel, playAiNow }) => {
  const [openedAt, setOpenedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    setOpenedAt(Date.now());
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [open]);
  // counted from when the dialog opened: the server's queue time is on another clock
  const seconds = Math.max(0, Math.ceil((openedAt + live.LiveDefaults.aiFallbackMs - now) / 1000));
  return (
    <Dialog open={open} close={cancel} mode="info" closable={false} title={t(tr.MATCHMAKING_TITLE)}>
      <div data-testid="matchmaking" style={{ textAlign: "center" }}>
        <p>{t(tr.MATCHMAKING_AI_IN, seconds)}</p>
        <div style={{ display: "flex", gap: "1em", justifyContent: "center", flexWrap: "wrap" }}>
          <Button onClick={playAiNow}>{t(tr.MATCHMAKING_PLAY_AI_NOW)}</Button>
          <Button color="accent" onClick={cancel}>
            {t(tr.MATCHMAKING_CANCEL)}
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default Matchmaking;
