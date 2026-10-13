const port = Number(process.env.PORT || 3000);

module.exports = {
  launch: {
    headless: process.env.HEADLESS !== "false",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      // chrome no longer falls back to software webgl on its own
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  },
  // previews the production build, an already running server (e.g. in CI) is reused
  server: {
    command: `vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    host: "127.0.0.1",
    port,
    launchTimeout: 60000,
    usedPortAction: "ignore",
  },
  exitOnPageError: false,
};
