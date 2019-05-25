module.exports = {
    server: {
      command: 'yarn start',
      port: 3000,
    },
	preset: 'jest-puppeteer',
	testRegex: './*\\.test\\.js$',
}