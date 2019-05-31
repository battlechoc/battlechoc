const puppeteer = require('puppeteer');
const iPhone = puppeteer.devices['iPhone 6 landscape'];
const timeout = 100000;

describe('browser', () => {
    let page;

    beforeAll(async () => {
      page = await global.__BROWSER__.newPage();
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      });
    }, timeout);

    beforeEach(async () => {
        await page.goto('http://localhost:' + global.__PORT__, { waitUntil: 'networkidle2', timeout: 0 })
    }, timeout);

    afterAll(async () => {
      await page.close()
    });

    test('should show the titlepage without error', async () => {
      await page.waitForSelector('.logo img', { timeout: timeout });
      await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test000.png' });
    }, timeout);

    test('should start the game without error', async () => {
      await page.waitForSelector('.titleMenu .menuButton:first-child', {timeout: timeout});
      await expect(page).toMatchElement('.titleMenu', { text: 'New Game' });
      await expect(page).toMatchElement('.titleMenu', { text: 'Tutorial' });
      await page.click('.titleMenu .menuButton:first-child');
      await page.waitForSelector('.active.button .stackedIcon');
      await page.click('.active.button .stackedIcon');
      await page.waitForSelector('.factory.enabled.preview');
      await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test001.png' });
    }, timeout);

    test('should start the tutorial', async () => {
      await page.waitForSelector('.titleMenu .menuButton:nth-child(2)', {timeout: timeout});
      await page.click('.titleMenu .menuButton:nth-child(2)');
      await expect(page).toMatchElement('h6', { text: 'Interactive battlechoc Tutorial' });
      await page.click('.active.button .stackedIcon');
      await expect(page).toMatchElement('h6', { text: 'The chocolate factory' });
      await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test002.png' })
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

  afterAll(async () => {
    await page.close()
  });  

  test('should show an info on iOS', async () => {
    await page.goto('http://localhost:' + global.__PORT__, {waitUntil: 'networkidle2', timeout: 0});
    await page.waitForSelector('.iosMessage', {timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test003.png' })
  }, timeout);

  test('should build a factory on a brown field', async () => {
    await page.goto('http://localhost:' + global.__PORT__ + '?situation=d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('.factory.enabled.preview', {timeout: timeout});
    await page.waitFor(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test005.png' });
    await page.mouse.click(364, 309);
    await expect(page).toMatchElement('p', {text: '0/2', timeout: timout});
  }, timeout);

  test('should build a factory on a white field', async () => {
    await page.goto('http://localhost:' + global.__PORT__ + '?situation=d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('.factory.enabled.preview', {timeout: timeout});
    await page.waitFor(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test006.png' });
    await page.mouse.click(399, 282);
    await expect(page).toMatchElement('p', {text: '0/2', timeout: timout});
  }, timeout);

  test('should move to opponent turn and back after building the factory', async () => {
    await page.goto('http://localhost:' + global.__PORT__ + '?situation=d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('.factory.enabled.preview', {timeout: timeout});
    await page.waitFor(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_0.png' });
    await page.mouse.click(324, 327);
    await expect(page).toMatchElement('p', {text: '0/3', timeout: timout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_1.png' });
    await page.waitForSelector('img.loadingAnimation', {timeout: timeout});
    await page.waitForSelector('.cacaotree.enabled.preview');
    await page.waitFor(3000);
    await expect(page).toMatchElement('p', {text: '3/3', timeout: timout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2.png' });
  }, timeout);
}, timeout);
