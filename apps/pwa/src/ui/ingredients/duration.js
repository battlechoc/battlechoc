// How long an ingredient keeps, as the pantry writes it: "3 d", "5 h" or "40 min" (the pantry's
// batches that spoil, the notice of a salvaged item's fresh ingredients). No React.

/** `ms` as "3 d", "5 h" or "40 min" (at least 1 min). */
export const formatDuration = (ms) => {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes >= 48 * 60) {
    return `${Math.floor(minutes / (24 * 60))} d`;
  }
  if (minutes >= 120) {
    return `${Math.floor(minutes / 60)} h`;
  }
  return `${minutes} min`;
};
