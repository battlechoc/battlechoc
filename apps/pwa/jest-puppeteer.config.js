module.exports = {
  launch: {
    dumpio: true,
    headless: true,
    args: [
      '— headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]
  },
  browserContext: 'incognito',
  server: {
    command: 'yarn start',
    port: 3000,
    launchTimeout: 60000
  }
}