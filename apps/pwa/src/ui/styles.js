// Style pieces the interface shares (react-jss rules take them with a spread or as a value).

/** The outline of display text: the stroke of the type scale in `color` (dark blue by default). */
export const outlined = (theme, color = theme.color.secondary.dark) => ({
  "-webkit-text-stroke": `${theme.font.stroke} ${color}`,
  "-webkit-font-smoothing": "antialiased",
});

/** Names, headings and counts: Bangers with a dark blue outline. */
export const bangers = (theme, color = "white") => ({
  fontFamily: theme.font.display,
  fontWeight: "normal",
  letterSpacing: "0.03em",
  color,
  ...outlined(theme),
});

/** A game panel: dark blue with a light blue rim, like the info card of a match. */
export const gamePanel = (theme) => ({
  borderRadius: "0.8em",
  background: theme.color.secondary.dark,
  border: `0.15em solid ${theme.color.secondary.light}`,
  boxSizing: "border-box",
});

/** The game's light from above: a colour of the theme ({ light, dark }) from its dark shade at
 * the bottom to its light one at `top` (of the height). */
export const rise = (color, top = "100%") => `linear-gradient(0deg, ${color.dark} 0%, ${color.light} ${top})`;
