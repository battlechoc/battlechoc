// What the Choclab opens with when another screen sends the player there for something in it:
// the title screen's notice of a salvaged item's ingredients opens the Choclab with its pantry
// (the shelf of ingredients, where they now are). No React: the title screen loads it.

let pantry = false;

/** The next Choclab opens with its pantry. */
export const openPantryNext = () => {
  pantry = true;
};

/** Whether the Choclab is to open with its pantry (once: the request is taken). */
export const takePantryRequest = () => {
  const asked = pantry;
  pantry = false;
  return asked;
};
