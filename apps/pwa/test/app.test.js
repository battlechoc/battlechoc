const puppeteer = require('puppeteer');
const iPhone = puppeteer.devices['iPhone 6'];
const timeout = 360000;

describe(
  'browser', () => {
    let page;

    beforeAll(async () => {
      page = await global.__BROWSER__.newPage();
      await page.setRequestInterception(true);
      console.log('SETUP LISTENER')
      page.on('request', request => {
          console.log('request for ' + request.url());
          request.continue();
      });

      page.on('response', async response => {
        console.log('response from ' + response.url() + ' with status ' + response.status() + ' and headers ' + JSON.stringify(response.headers()));
      });

      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      });
    }, timeout);

    beforeEach(async () => {
        await page.goto('http://127.0.0.1:5000', {waitUntil: 'load', timeout: timeout})
    }, timeout);

    afterAll(async () => {
      await page.close()
    });

    it('should load without error', async () => {
      await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test001.png' })
      await page.waitForSelector('.titleMenu .menuButton:first-child');
      await expect(page).toMatchElement('.titleMenu', { text: 'New Game' });
      await expect(page).toMatchElement('.titleMenu', { text: 'Tutorial' });
      await page.click('.titleMenu .menuButton:first-child');
      await page.waitForSelector('.active.button .stackedIcon');
      await page.click('.active.button .stackedIcon');
      await page.waitForSelector('.factory.enabled.preview');
    }, timeout);

    it('should start the tutorial', async () => {
      await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test002.png' })
      await page.waitForSelector('.titleMenu .menuButton:nth-child(2)');
      await page.click('.titleMenu .menuButton:nth-child(2)');
      await page.screenshot({path: 'screenshot.png'});
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
      await page.goto('http://127.0.0.1:5000')
  }, timeout);

  afterAll(async () => {
    await page.close()
  });  

  it('should show an info on iOS', async () => {
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test003.png' })
    await page.waitForSelector('.titleMenu .menuButton:first-child');
    await page.screenshot({path: 'screenshot.png'});
    await page.waitForSelector('.iosMessage');
  }, timeout);
}, timeout);
