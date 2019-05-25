module.exports = {
  launch: {
    headless: true,
    args: [
      '--headless',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  },
  server: {
    command: 'yarn start',
    port: 3000,
    launchTimeout: 60000
  }
}