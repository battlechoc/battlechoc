// Real-time single player match against Tom Toffee. The page is opened with ?testclock, which
// replaces the match clock with a manual one exposed as window.__battlechoc.host.clock, so the
// tests fast-forward match time instead of sleeping.
const baseUrl = 'http://localhost:' + (process.env.PORT || 3000);
const url = baseUrl + '/?testclock';
const timeout = 120000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const seedProfile = (page, score = 150) => page.evaluate((score) => new Promise((resolve, reject) => {
  const open = indexedDB.open('battlechoc');
  open.onsuccess = () => {
    const tx = open.result.transaction('player', 'readwrite');
    const store = tx.objectStore('player');
    const get = store.get('stats');
    get.onsuccess = () => store.put(Object.assign({}, get.result || {}, {
      username: 'Tester', score, tutorialFinished: true, tutorialSkipped: true,
    }), 'stats');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  };
  open.onerror = () => reject(open.error);
}), score);

const clickText = (page, text) => page.evaluate((text) => {
  const element = [...document.querySelectorAll('button, div')].filter((e) => e.innerText && e.innerText.trim() === text).pop();
  if (!element) {
    throw new Error('no element with the text ' + text);
  }
  element.click();
}, text);

const host = (page, fn, ...args) => page.evaluate(fn, ...args);
const advance = (page, ms) => host(page, (ms) => window.__battlechoc.host.clock.advance(ms), ms);
const phase = (page) => host(page, () => window.__battlechoc.host.match.phase);

const startMatch = async (page) => {
  await page.waitForFunction(() => document.body.innerText.includes('Singleplayer'), { timeout });
  await clickText(page, 'Singleplayer');
  await sleep(500);
  // a saved match from an earlier test opens the resume dialog first
  if (await page.evaluate(() => document.body.innerText.includes('Resume Game'))) {
    await clickText(page, 'New game');
  }
  await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match, { timeout: 10000 });
};

const reachRunningPhase = async (page) => {
  await page.evaluate(() => [...document.querySelectorAll('div[class*="button-"]')]
    .find((element) => element.querySelector('[class*="fields"]')).click());
  await host(page, () => {
    const h = window.__battlechoc.host;
    const grid = h.match.board.fields[h.match.players[0].fieldIndex].grid;
    const cell = grid.find((c) => c.occupiedBy.every((e) => e.type === 'EntityType.CREAM'));
    return h.submit('battlechoc/match/placeFactory', { row: cell.row, col: cell.col });
  });
  await advance(page, 25000);
};

describe('real-time match', () => {
  let page;

  beforeAll(async () => {
    page = await browser.newPage();
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
    });
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    await sleep(1000);
    await seedProfile(page);
  }, timeout);

  afterAll(async () => {
    await page.close();
  });

  test('walks through field choice, simultaneous placement and countdown', async () => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    await startMatch(page);
    expect(await phase(page)).toBe('MatchPhase.FIELD_CHOICE');
    await expect(page).toMatchElement('div', { text: 'Choose your field' });
    await page.evaluate(() => [...document.querySelectorAll('div[class*="button-"]')]
      .find((element) => element.querySelector('[class*="fields"]')).click());
    expect(await phase(page)).toBe('MatchPhase.PLACEMENT');
    await expect(page).toMatchElement('[data-testid=match-banner]');
    await expect(page).toMatchElement('div', { text: 'Place your chocolate factory' });
    // the AI places its factory at the deadline, then the countdown starts
    await advance(page, 20000);
    expect(await phase(page)).toBe('MatchPhase.COUNTDOWN');
    await advance(page, 3000);
    expect(await phase(page)).toBe('MatchPhase.RUNNING');
    await expect(page).toMatchElement('[data-testid=resource-panel]');
    await expect(page).toMatchElement('[data-testid=build-palette]');
    await page.screenshot({ path: 'test/output/screenshot_realtime_running.png' });
  }, timeout);

  test('builds a cannon that turns blue after 10 s and green after 20 s', async () => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    await startMatch(page);
    await reachRunningPhase(page);
    const result = await host(page, () => {
      const h = window.__battlechoc.host;
      const grid = h.match.board.fields[h.match.players[0].fieldIndex].grid;
      const cell = grid.find((c) => c.occupiedBy.every((e) => e.type === 'EntityType.CREAM'));
      return h.submit('battlechoc/match/build', { entityType: 'EntityType.RUM_TRUFFLE_CANNON', row: cell.row, col: cell.col }).then(() => 'ok', (e) => e.message);
    });
    expect(result).toBe('ok');
    await sleep(300);
    await expect(page).toMatchElement('[data-testid=weapon-truffle-cannon][data-state=charging]');
    await advance(page, 10000);
    await sleep(400);
    await expect(page).toMatchElement('[data-testid=weapon-truffle-cannon][data-state=rushable]', { text: '-10' });
    await advance(page, 10000);
    await sleep(400);
    await expect(page).toMatchElement('[data-testid=weapon-truffle-cannon][data-state=ready]');
    await page.screenshot({ path: 'test/output/screenshot_realtime_weapon_ready.png' });
  }, timeout);

  test('pauses when the tab is hidden and resumes after a reload', async () => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    await startMatch(page);
    await reachRunningPhase(page);
    await advance(page, 30000);
    await host(page, () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await sleep(300);
    expect(await host(page, () => window.__battlechoc.host.clock.running)).toBe(false);
    await expect(page).toMatchElement('[data-testid=paused-overlay]');
    const savedAt = await host(page, () => window.__battlechoc.host.match.t);
    await sleep(1000);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    await page.waitForFunction(() => document.body.innerText.includes('Singleplayer'), { timeout });
    await clickText(page, 'Singleplayer');
    await sleep(500);
    await clickText(page, 'Resume Game');
    await page.waitForFunction(() => window.__battlechoc && window.__battlechoc.host.match, { timeout: 10000 });
    expect(await host(page, () => window.__battlechoc.host.match.t)).toBe(savedAt);
    expect(await phase(page)).toBe('MatchPhase.RUNNING');
  }, timeout);

  test('plays against Gustav Ganache on a 10x10 board with a high score', async () => {
    await seedProfile(page, 900);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    await startMatch(page);
    const setup = await host(page, () => ({
      opponent: window.__battlechoc.host.match.players[1].name,
      rows: window.__battlechoc.host.match.board.size.rows,
    }));
    expect(setup).toEqual({ opponent: 'Gustav Ganache', rows: 10 });
    await reachRunningPhase(page);
    for (let i = 0; i < 12; i++) {
      await advance(page, 5000);
    }
    const aiActions = await host(page, () => window.__battlechoc.host.match.events.filter((e) => e.player === 1).length);
    expect(aiActions).toBeGreaterThan(5);
    await page.screenshot({ path: 'test/output/screenshot_realtime_gustav.png' });
    await seedProfile(page, 150);
  }, timeout);

  test('ends at the time limit and shows the overview', async () => {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });
    await startMatch(page);
    await reachRunningPhase(page);
    await advance(page, 11 * 60 * 1000);
    expect(await phase(page)).toBe('MatchPhase.ENDED');
    await expect(page).toMatchElement('div', { text: 'Time is up!' });
    await page.waitForFunction(() => /You won|You lost/i.test(document.body.innerText), { timeout: 10000 });
    await page.screenshot({ path: 'test/output/screenshot_realtime_ended.png' });
  }, timeout);
});
