import { useEffect, useState } from "react";
import { createUseStyles } from "react-jss";
import { liveConnection } from "../../match/liveConnection";

const useStyles = createUseStyles((theme) => ({
  // the time left of an offer: a light pill in the dialog's text
  pill: {
    display: "inline-block",
    padding: "0.05em 0.6em",
    borderRadius: "1em",
    background: "rgba(255, 255, 255, 0.18)",
    fontFamily: theme.font.display,
  },
}));

/**
 * The whole seconds until `expiresAt` on the server's clock (liveConnection.clock), at least 0;
 * the component renders again every second while `running`.
 */
export const useCountdown = (expiresAt, running = true) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) {
      return undefined;
    }
    const interval = setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => clearInterval(interval);
  }, [running]);
  if (typeof expiresAt !== "number") {
    return 0;
  }
  return Math.max(0, Math.ceil((expiresAt - liveConnection.clock.serverNow()) / 1000));
};

/** Seconds as minutes and seconds: 125 → "2:05". */
export const minutesAndSeconds = (total) =>
  `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

/** The time left of an offer as a pill; `className` places it. */
export const Pill = ({ className = "", children, ...rest }) => {
  const classes = useStyles();
  return (
    <span className={`${classes.pill} ${className}`} {...rest}>
      {children}
    </span>
  );
};
