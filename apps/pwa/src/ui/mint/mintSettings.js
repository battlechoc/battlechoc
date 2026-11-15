// What the minting dialog keeps on the device (OfflineStore's settings): whether the player has
// read the explainer. Settings → Restart Tutorial deletes it, like the Choclab's intro.

/** The settings key of "the explainer was read" (true once How it works was tapped). */
export const MINT_EXPLAINED = "mintExplained";

/** The sessionStorage key of this tab's sign code for operation `id` (dropped when it ends). */
export const signCodeKey = (id) => `battlechoc.mintSign.${id}`;
