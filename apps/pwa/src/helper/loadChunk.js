// a chunk that does not arrive is asked for again after these pauses, the last one over and over
const RETRY_DELAYS_MS = [1000, 3000, 10000];

/**
 * Wraps a dynamic import: the returned function loads the chunk once, however often it is
 * called, and never gives up. React.lazy keeps a failed import for good and throws it into the
 * render, which would take the whole app down for one lost request; this promise stays open
 * until the chunk is in (the device may be back online later).
 */
const loadChunk = (load, delays = RETRY_DELAYS_MS) => {
  let loading;
  return () => {
    if (!loading) {
      loading = new Promise((resolve) => {
        const attempt = (tries) =>
          load().then(resolve, () =>
            setTimeout(
              () => attempt(tries + 1),
              delays[Math.min(tries, delays.length - 1)]
            )
          );
        attempt(0);
      });
    }
    return loading;
  };
};

export { loadChunk, RETRY_DELAYS_MS };
