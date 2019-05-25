const puppeteer = require('puppeteer');
const iPhone = puppeteer.devices['iPhone 6'];

describe(
  'browser', () => {
    let page;

    beforeAll(async () => {
      page = await global.__BROWSER__.newPage();
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      });
    }, 10000);

    beforeEach(async () => {
        await page.goto('http://localhost:3000')
    });

    afterAll(async () => {
      await page.close()
    });

    it('should load without error', async () => {
      await page.waitForSelector('.titleMenu .menuButton:first-child');
      await expect(page).toMatchElement('.titleMenu', { text: 'New Game' });
      await expect(page).toMatchElement('.titleMenu', { text: 'Tutorial' });
      await page.click('.titleMenu .menuButton:first-child');
      await page.waitForSelector('.active.button .stackedIcon');
      await page.click('.active.button .stackedIcon');
      await page.waitForSelector('.factory.enabled.preview');
    });

    it('should start the tutorial', async () => {
      await page.waitForSelector('.titleMenu .menuButton:nth-child(2)');
      await page.click('.titleMenu .menuButton:nth-child(2)');
      await page.screenshot({path: 'screenshot.png'});
      await expect(page).toMatchElement('h6', { text: 'Interactive battlechoc Tutorial' });
      await page.click('.active.button .stackedIcon');
      await expect(page).toMatchElement('h6', { text: 'The chocolate factory' });
    }, 20000);
  },
  10000
)

describe('iPhone', () => {
  let page;

  beforeAll(async () => {
    page = await global.__BROWSER__.newPage();
    await page.emulate(iPhone);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' });
    });
  }, 10000);

  beforeEach(async () => {
      await page.goto('http://localhost:3000')
  });

  afterAll(async () => {
    await page.close()
  });  

  it('should show an info on iOS', async () => {
    await page.waitForSelector('.titleMenu .menuButton:first-child');
    await page.screenshot({path: 'screenshot.png'});
    await page.waitForSelector('.iosMessage');
  }, 20000);
});
