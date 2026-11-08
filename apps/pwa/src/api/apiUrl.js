// The address of the battlechoc API: localStorage "battlechoc.apiUrl" points a build at another
// API (e2e tests, local servers), else the build's VITE_API_URL, else the live one. Its own module
// so the link page (src/link/main.js) gets it without the game's account and storage.
const storedApiUrl = (() => {
  try {
    return window.localStorage.getItem("battlechoc.apiUrl");
  } catch {
    return null;
  }
})();

export const apiUrl =
  storedApiUrl || import.meta.env.VITE_API_URL || "https://api.battlechoc.com";
