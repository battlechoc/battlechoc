// Which build this is: the version of package.json (release-please raises it with every
// release) and, in a deployed build, the commit and the build time (pages.yml sets both).
// A local build has no commit and counts as built now.
const version = import.meta.env.VITE_VERSION;
const commit = (import.meta.env.VITE_COMMIT || "").slice(0, 7);
const builtAt = import.meta.env.VITE_BUILD_TIME
  ? new Date(import.meta.env.VITE_BUILD_TIME).getTime()
  : Date.now();

export { version, commit, builtAt };
