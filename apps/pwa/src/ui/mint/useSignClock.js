import { useEffect, useState } from "react";

// how often the minutes left move, and how soon after the end of the window the clock ticks
const TICK_MS = 15000;
const PAST_END_MS = 50;

/**
 * The time (ms) for a sign window's minutes left, while `running`: it ticks every 15 s and once
 * at `until` (an ISO time, the window's end), so nothing offers signing after the window closed.
 */
const useSignClock = (running, until) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      return undefined;
    }
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), TICK_MS);
    const end = Date.parse(until);
    const left = Number.isNaN(end) ? -1 : end - Date.now();
    const atEnd =
      left >= 0
        ? setTimeout(() => setNow(Date.now()), left + PAST_END_MS)
        : null;
    return () => {
      clearInterval(interval);
      if (atEnd !== null) {
        clearTimeout(atEnd);
      }
    };
  }, [running, until]);
  return now;
};

export default useSignClock;
