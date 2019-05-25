module.exports = {
  launch: {
    headless: true,
    args: [
      '— headless',
      '--no-sandbox'
    ]
  },
  server: {
    command: 'yarn start',
    port: 3000,
    launchTimeout: 60000
  }
}