import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { scrollCue } from "../lab/itemActions";

// The scroll area of a dialog's step (the minting dialog, the salvage of a minted item): whether
// more of the step is above or below its view, from its real scroll state (measured after every
// render, on scrolling, and when its size or a child's changes), and the mask that fades its
// edges there.

// how far the scroll area's edge fades where more of the step is beyond it
const FADE = "2em";

/** The mask that fades the scroll area's edges with more beyond them (none when all is in view). */
export const fadeMask = ({ above, below }) => {
  if (above && below) {
    return `linear-gradient(to bottom, transparent, #000 ${FADE}, #000 calc(100% - ${FADE}), transparent)`;
  }
  if (below) {
    return `linear-gradient(to bottom, #000 calc(100% - ${FADE}), transparent)`;
  }
  if (above) {
    return `linear-gradient(to top, #000 calc(100% - ${FADE}), transparent)`;
  }
  return undefined;
};

/**
 * { ref (the scroll area's), cue ({ above, below }), measure (its onScroll) }; `step`: the step
 * shown (its children are observed anew when it changes).
 */
export const useScrollCue = (step) => {
  const ref = useRef(null);
  const [cue, setCue] = useState({ above: false, below: false });
  const measure = useCallback(() => {
    const area = ref.current;
    if (!area) {
      return;
    }
    const next = scrollCue(area);
    setCue((before) =>
      before.above === next.above && before.below === next.below ? before : next
    );
  }, []);
  useLayoutEffect(() => {
    measure();
  });
  useEffect(() => {
    const area = ref.current;
    window.addEventListener("resize", measure);
    const observer =
      area && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(measure)
        : null;
    if (observer) {
      observer.observe(area);
      [...area.children].forEach((child) => observer.observe(child));
    }
    return () => {
      window.removeEventListener("resize", measure);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [measure, step]);
  return { ref, cue, measure };
};
