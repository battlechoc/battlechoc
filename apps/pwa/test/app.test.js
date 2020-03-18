const puppeteer = require('puppeteer');
const iPhone = puppeteer.devices['iPhone 6 landscape'];
const timeout = 120000;

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

    test('should start the tutorial', async () => {
      await page.waitForSelector('.titleMenu .menuButton:first-child', {timeout: timeout});
      await expect(page).toMatchElement('.titleMenu', { text: 'New Game' });
      await page.click('.titleMenu .menuButton:first-child');
      await expect(page).toMatchElement('h6', { text: 'Welcome to battlechoc' });
      await page.waitFor(1000);
      await page.click('#next-loop');
      await page.waitFor(1000);
      await page.waitForSelector('#prev-loop', {timeout: timeout});
      await expect(page).toMatchElement('h6', { text: 'The Chocolate Factory'});
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
    await page.waitForSelector('#client-snackbar', {timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test003.png' })
  }, timeout);

  test('should build a factory on a black field', async () => {
    await page.goto('http://localhost:' + global.__PORT__ + '/situation/d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('.factory.enabled.preview', {timeout: timeout});
    await page.waitFor(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test005.png' });
    await page.mouse.click(336, 241);
    await expect(page).toMatchElement('p', {text: '0/2', timeout: timeout});
  }, timeout);

  test('should build a factory on a brown field', async () => {
    await page.goto('http://localhost:' + global.__PORT__ + '/situation/d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('.factory.enabled.preview', {timeout: timeout});
    await page.waitFor(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test005.png' });
    await page.mouse.click(388, 209);
    await expect(page).toMatchElement('p', {text: '0/1', timeout: timeout});
  }, timeout);

  test('should build a factory on a white field', async () => {
    await page.goto('http://localhost:' + global.__PORT__ + '/situation/d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('.factory.enabled.preview', {timeout: timeout});
    await page.waitFor(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test006.png' });
    await page.mouse.click(363, 223);
    await expect(page).toMatchElement('p', {text: '0/1', timeout: timeout});
  }, timeout);

  test('should move to opponent turn and back after building the factory', async () => {
    await page.goto('http://localhost:' + global.__PORT__ + '/situation/d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('.factory.enabled.preview', {timeout: timeout});
    await page.waitFor(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_0.png' });
    await page.mouse.click(335, 238);
    await expect(page).toMatchElement('p', {text: '0/2', timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_1.png' });
    await page.waitForSelector('img.loadingAnimation', {timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2_2.png' });
    await page.waitForSelector('.cacaotree.enabled.preview', {timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2_1.png' });
    await page.waitFor(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2_0.png' });
    await expect(page).toMatchElement('p', {text: '2/2', timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2.png' });
  }, timeout);
}, timeout);
