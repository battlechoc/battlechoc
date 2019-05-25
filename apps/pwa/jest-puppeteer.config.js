module.exports = {
  launch: {
    headless: true,
    dumpio: true,
    args: [
      '--headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  },
  browserContext: 'default',
  server: {
    command: 'yarn start',
    port: 3000,
    launchTimeout: 60000
  }
}