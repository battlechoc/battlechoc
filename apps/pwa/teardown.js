const chalk = require('chalk');
const rimraf = require('rimraf');
const os = require('os');
const path = require('path');
const { teardown: teardownDevServer } = require('jest-dev-server');
const DIR = path.join(os.tmpdir(), 'jest_puppeteer_global_setup');

module.exports = async function() {
  console.log(chalk.green('Teardown Development Server'));
  //await teardownDevServer()
  console.log(chalk.green('Teardown Puppeteer'));
  await global.__BROWSER_GLOBAL__.close()
  rimraf.sync(DIR)
}