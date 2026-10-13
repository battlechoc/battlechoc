import { useEffect, useState } from "react";
import { matchSession } from "../../match/LocalMatchHost";

// Current match time of the running match host, refreshed `hz` times per second.
// Kept out of Redux on purpose: only the components that show timers re-render.
const currentTime = () =>
  typeof matchSession.host !== "undefined" ? matchSession.host.now() : 0;

const useMatchTime = (hz = 4) => {
  const [t, setT] = useState(currentTime);
  useEffect(() => {
    const interval = setInterval(() => setT(currentTime()), 1000 / hz);
    return () => clearInterval(interval);
  }, [hz]);
  return t;
};

export default useMatchTime;
