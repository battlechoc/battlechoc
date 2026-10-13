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
      // the e2e tests do not cover the service worker; bypass it to keep page loads deterministic
      await page.setBypassServiceWorker(true);
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
    // the e2e tests do not cover the service worker; bypass it to keep page loads deterministic
    await page.setBypassServiceWorker(true);
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

  // the debug board is a real-time scenario in the placement phase; ?testclock lets the test
  // fast-forward to the running phase, where the build slots show up in the resource panel
  const situation = baseUrl + '/situation/d41d8cd98f00b204e9800998ecf8427e?testclock';
  const placeFactoryAt = async (x, y) => {
    await page.goto(situation);
    await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match, { timeout });
    await sleep(3000);
    await page.mouse.click(x, y);
    await sleep(500);
    await page.evaluate(() => window.__battlechoc.host.clock.advance(23000));
    await sleep(500);
  };

  test('should build a factory on a black field', async () => {
    await placeFactoryAt(336, 241);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test005.png' });
    await expect(page).toMatchElement('[data-testid=build-tokens]', { text: '3/3', timeout: timeout });
  }, timeout);

  test('should build a factory on a brown field', async () => {
    await placeFactoryAt(388, 209);
    await expect(page).toMatchElement('[data-testid=build-tokens]', { text: '2/2', timeout: timeout });
  }, timeout);

  test('should build a factory on a white field', async () => {
    await placeFactoryAt(363, 223);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test006.png' });
    await expect(page).toMatchElement('[data-testid=build-tokens]', { text: '2/2', timeout: timeout });
  }, timeout);

  test('should count down and start the match after both factories are placed', async () => {
    await page.goto(situation);
    await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match, { timeout });
    await sleep(3000);
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_0.png' });
    await page.mouse.click(335, 238);
    await sleep(500);
    const phase = () => page.evaluate(() => window.__battlechoc.host.match.phase);
    expect(await phase()).toBe('MatchPhase.PLACEMENT');
    await page.evaluate(() => window.__battlechoc.host.clock.advance(20000));
    expect(await phase()).toBe('MatchPhase.COUNTDOWN');
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_1.png' });
    await page.evaluate(() => window.__battlechoc.host.clock.advance(3000));
    expect(await phase()).toBe('MatchPhase.RUNNING');
    await expect(page).toMatchElement('[data-testid=build-tokens]', { text: '3/3', timeout: timeout });
    await page.screenshot({ fullPage: true, path: 'test/output/screenshot_test004_2.png' });
  }, timeout);
}, timeout);
