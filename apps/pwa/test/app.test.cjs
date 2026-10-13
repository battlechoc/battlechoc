// puppeteer's KnownDevices['iPhone 6 landscape'], puppeteer is ESM only and cannot be required here
const iPhone = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1',
  viewport: { width: 667, height: 375, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: true },
};
const baseUrl = 'http://localhost:' + (process.env.PORT || 3000);
const timeout = 120000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('browser', () => {
    let page;

    beforeAll(async () => {
      page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
      });
    }, timeout);

    beforeEach(async () => {
        await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 0 })
    }, timeout);

    afterAll(async () => {
      await page.close()
    });

    test('should show the titlepage without error', async () => {
      await page.waitForSelector('[class^=logo]', { timeout: timeout });
      await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test000.png' });
    }, timeout);

    test('should start the tutorial', async () => {
      await page.waitForSelector('div[class^=menu] > div:first-child', {timeout: timeout});
      await expect(page).toMatchElement('div[class^=menu] > div:first-child', { text: 'Start Tutorial' });
      await page.click('div[class^=menu] > div:first-child');
      await sleep(2000);
      await expect(page).toMatchElement('[class^=tutorial]:last-child [class^=title]', { text: 'Welcome to battlechoc' });
      await sleep(1000);
      await page.click('[class^=tutorial]:last-child [class^=title] [class^=iconButton]');
      await sleep(1000);
      await expect(page).toMatchElement('[class^=tutorial]:last-child [class^=title]', { text: 'The Chocolate Factory'});
      await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test002.png' })
    }, timeout);
  },
  timeout
)

describe('iPhone', () => {
  let page;

  beforeAll(async () => {
    page = await browser.newPage();
    await page.emulate(iPhone);
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'platform', { get: () => 'iPhone' });
    });
  }, timeout);

  afterAll(async () => {
    await page.close()
  });

  test('should show an info on iOS', async () => {
    await page.goto(baseUrl, {waitUntil: 'networkidle2', timeout: 0});
    await page.waitForSelector('[class^=visible]', {timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test003.png' })
  }, timeout);

  test('should build a factory on a black field', async () => {
    await page.goto(baseUrl + '/situation/d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('[class^=preview]', {timeout: timeout});
    await sleep(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test005.png' });
    await page.mouse.click(336, 241);
    await expect(page).toMatchElement('p', {text: '0/3', timeout: timeout});
  }, timeout);

  test('should build a factory on a brown field', async () => {
    await page.goto(baseUrl + '/situation/d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('[class^=preview]', {timeout: timeout});
    await sleep(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test005.png' });
    await page.mouse.click(388, 209);
    await expect(page).toMatchElement('p', {text: '0/2', timeout: timeout});
  }, timeout);

  test('should build a factory on a white field', async () => {
    await page.goto(baseUrl + '/situation/d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('[class^=preview]', {timeout: timeout});
    await sleep(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test006.png' });
    await page.mouse.click(363, 223);
    await expect(page).toMatchElement('p', {text: '0/2', timeout: timeout});
  }, timeout);

  test('should move to opponent turn and back after building the factory', async () => {
    await page.goto(baseUrl + '/situation/d41d8cd98f00b204e9800998ecf8427e');
    await page.waitForSelector('[class^=preview]', {timeout: timeout});
    await sleep(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_0.png' });
    await page.mouse.click(335, 238);
    await expect(page).toMatchElement('p', {text: '0/3', timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_1.png' });
    await page.waitForSelector('[class^=slow]', {timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2_2.png' });
    await page.waitForSelector('[class^=preview]', {timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2_1.png' });
    await sleep(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2_0.png' });
    await expect(page).toMatchElement('p', {text: '3/3', timeout: timeout});
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2.png' });
  }, timeout);
}, timeout);
