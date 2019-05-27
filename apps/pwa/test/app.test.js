const puppeteer = require('puppeteer');
const iPhone = puppeteer.devices['iPhone 6'];
const timeout = 360000;

describe(
  'browser', () => {
    let page;

    beforeAll(async () => {
      page = await global.__BROWSER__.newPage();
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      });
    }, timeout);

    beforeEach(async () => {
        console.log('GOTO PAGE')
        await page.goto('http://127.0.0.1:5000', { waitUntil: 'load', timeout: 0 })
    }, timeout);

    afterAll(async () => {
      await page.close()
    });

    test('should show the titlepage without error', async () => {
      console.log('START TEST 1');
      await page.waitForSelector('.logo img', {timeout: timeout});
    }, timeout);

    test('should start the game without error', async () => {
      console.log('START TEST 2');
      await page.waitFor(10000);
      console.log('WAIT 10 SEC BEFORE SCREENSHOT');
      await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test001.png' })
      await page.waitForSelector('.titleMenu .menuButton:first-child', {timeout: timeout});
      await expect(page).toMatchElement('.titleMenu', { text: 'New Game' });
      await expect(page).toMatchElement('.titleMenu', { text: 'Tutorial' });
      await page.click('.titleMenu .menuButton:first-child');
      await page.waitForSelector('.active.button .stackedIcon');
      await page.click('.active.button .stackedIcon');
      await page.waitForSelector('.factory.enabled.preview');
    }, timeout);

    test('should start the tutorial', async () => {
      await page.waitForSelector('.titleMenu .menuButton:nth-child(2)', {timeout: timeout});
      await page.click('.titleMenu .menuButton:nth-child(2)');
      await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test002.png' })
      await expect(page).toMatchElement('h6', { text: 'Interactive battlechoc Tutorial' });
      await page.click('.active.button .stackedIcon');
      await expect(page).toMatchElement('h6', { text: 'The chocolate factory' });
    }, timeout);
  },
  timeout
)

describe('iPhone', () => {
  let page;

  beforeAll(async () => {
    page = await global.__BROWSER__.newPage();
    await page.emulate(iPhone);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' });
    });
  }, timeout);

  beforeEach(async () => {
      await page.goto('http://127.0.0.1:5000', {waitUntil: 'networkidle0', timeout: 0})
  }, timeout);

  afterAll(async () => {
    await page.close()
  });  

  test('should show an info on iOS', async () => {
    await page.waitForSelector('.iosMessage', {timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test003.png' })
  }, timeout);
}, timeout);
