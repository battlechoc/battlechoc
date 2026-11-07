import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// The service worker for real (the other specs block it): the first visit installs it, the game
// then starts without a connection, and a new build reaches an installed game. Its own Playwright
// project (playwright.config.js, serviceWorkers: "allow").
//
// The e2e build is served here by a small server that answers like GitHub Pages, where the game
// lives: strong ETags, `Cache-Control: max-age=600`, 304 for a matching If-None-Match. That is
// what the worker's requests depend on (src/service-worker.js asks for the precached media with
// conditional requests), and vite preview sends none of it. The server also keeps a log of what
// was asked for, can go down, and can serve "the next build" of a file.
const BUILD = fileURLToPath(new URL("../build-e2e/", import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".glb": "model/gltf-binary",
};

const etagOf = (body) =>
  '"' + crypto.createHash("md5").update(body).digest("hex") + '"';

const startServer = async () => {
  const site = {
    // every answer: { url, status, conditional }
    log: [],
    // the next build: url -> body
    deployed: new Map(),
    down: false,
  };
  const server = http.createServer((request, response) => {
    if (site.down) {
      request.socket.destroy();
      return;
    }
    let url = new URL(request.url, "http://localhost").pathname;
    if (url.endsWith("/")) {
      url += "index.html";
    }
    const file = path.join(BUILD, url);
    let body;
    if (site.deployed.has(url)) {
      body = site.deployed.get(url);
    } else if (file.startsWith(BUILD) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      body = fs.readFileSync(file);
    }
    const conditional = typeof request.headers["if-none-match"] === "string";
    if (typeof body === "undefined") {
      site.log.push({ url, status: 404, conditional });
      response.writeHead(404).end();
      return;
    }
    const headers = {
      "Content-Type": TYPES[path.extname(url)] || "application/octet-stream",
      "Cache-Control": "max-age=600",
      ETag: etagOf(body),
    };
    if (request.headers["if-none-match"] === headers.ETag) {
      site.log.push({ url, status: 304, conditional });
      response.writeHead(304, headers).end();
      return;
    }
    site.log.push({ url, status: 200, conditional });
    response.writeHead(200, { ...headers, "Content-Length": body.length });
    response.end(request.method === "HEAD" ? undefined : body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  site.origin = `http://127.0.0.1:${server.address().port}`;
  site.close = () =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    });
  return site;
};

let site;
test.beforeAll(async () => {
  site = await startServer();
});
test.afterAll(async () => {
  await site.close();
});
test.beforeEach(() => {
  site.log.length = 0;
  site.deployed.clear();
  site.down = false;
});

const answers = (url, status) =>
  site.log.filter((entry) => entry.url === url && entry.status === status);

// the first visit: the title screen, then the worker (registered once the 3D models are in)
// installs, activates and takes the page over
const firstVisit = async (page) => {
  await page.goto(site.origin + "/");
  await expect(page.getByTestId("start-button")).toHaveText("Start Tutorial", {
    timeout: 30000,
  });
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 60000 }
  );
};

const precached = (page) =>
  page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) =>
      name.includes("precache")
    );
    const keys = await Promise.all(
      names.map(async (name) => (await caches.open(name)).keys())
    );
    return keys.flat().map((request) => new URL(request.url).pathname);
  });

const seed = (page, stats) =>
  page.evaluate(
    (stats) =>
      new Promise((resolve) => {
        const open = indexedDB.open("battlechoc");
        open.onsuccess = () => {
          const tx = open.result.transaction("player", "readwrite");
          const store = tx.objectStore("player");
          const get = store.get("stats");
          get.onsuccess = () =>
            store.put(Object.assign({}, get.result || {}, stats), "stats");
          tx.oncomplete = () => resolve();
        };
      }),
    stats
  );

const titleScreen = async (page, label) => {
  await expect(page.locator("[class^=logo]").first()).toBeVisible();
  await expect(page.getByTestId("start-button")).toHaveText(label, {
    timeout: 30000,
  });
};

test("the first visit installs the worker; without a connection the game starts, a match against the AI too, and so does every further navigation", async ({
  page,
  context,
}) => {
  await firstVisit(page);
  const stored = await precached(page);
  expect(stored).toContain("/index.html");
  expect(stored).toContain("/models/factory.glb");
  expect(stored).toContain("/music/CacaoLiving.mp3");
  expect(stored).toContain("/images/tap-finger.svg");
  // what the game never loads is not stored (vite.config.js)
  expect(stored).not.toContain("/images/challenge-preview.jpg");
  expect(stored.filter((url) => /openpbr|ktxTextureLoader/.test(url))).toEqual(
    []
  );

  // a player who has finished the tutorial, so Start plays a match
  await seed(page, { username: "Tester", score: 150, tutorialFinished: true });
  site.down = true;
  await context.setOffline(true);

  await page.reload();
  await titleScreen(page, "Start Game");
  await page.getByTestId("start-button").click();
  await page.waitForFunction(
    () =>
      window.__battlechoc &&
      window.__battlechoc.host &&
      window.__battlechoc.host.match &&
      !window.__battlechoc.host.online,
    null,
    { timeout: 15000 }
  );
  await page.screenshot({
    path: "test/output/screenshot_service_worker_offline_match.png",
  });

  // further navigations: the same tab again, and a second tab
  await page.goto(site.origin + "/");
  await titleScreen(page, "Start Game");
  const second = await context.newPage();
  await second.goto(site.origin + "/");
  await titleScreen(second, "Start Game");
  await second.close();
  await context.setOffline(false);
});

test("the worker stores the models the page has just loaded without downloading them again", async ({
  page,
}) => {
  await firstVisit(page);
  const models = fs
    .readdirSync(path.join(BUILD, "models"))
    .filter((name) => name.endsWith(".glb"))
    .map((name) => `/models/${name}`);
  expect(models.length).toBeGreaterThan(10);
  const stored = await precached(page);
  for (const model of models) {
    expect(stored).toContain(model);
    // once in full for the page; the worker asked with If-None-Match and got "not modified"
    expect(answers(model, 200), model).toHaveLength(1);
    expect(answers(model, 304), model).toHaveLength(1);
  }
});

test("a new build reaches an installed game: the updated worker takes a changed file that kept its address", async ({
  page,
}) => {
  await firstVisit(page);
  const picture = "/images/win.svg";
  const before = fs.readFileSync(path.join(BUILD, picture), "utf8");
  const inPage = () =>
    page.evaluate((url) => fetch(url).then((response) => response.text()), picture);
  expect(await inPage()).toBe(before);

  // the next build: the picture changed, and with it its revision in the worker's manifest. The
  // browser's cache still holds the old picture as fresh (max-age), so only a request that asks
  // the server gets the new one.
  const after = before.replace(/<svg/, "<!-- the next build --><svg");
  expect(after).not.toBe(before);
  const worker = fs.readFileSync(path.join(BUILD, "service-worker.js"), "utf8");
  const revision = (content) =>
    crypto.createHash("md5").update(content).digest("hex");
  const entry = (hash) => `{"revision":"${hash}","url":"images/win.svg"}`;
  expect(worker).toContain(entry(revision(before)));
  site.deployed.set(picture, Buffer.from(after));
  site.deployed.set(
    "/service-worker.js",
    Buffer.from(worker.replace(entry(revision(before)), entry(revision(after))))
  );
  site.log.length = 0;

  // the browser looks for a new worker on every navigation; here the page asks for it
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
  });
  // the game offers the new version (dialogs/UpdateAvailable.jsx), and the new worker serves the
  // new picture
  await expect(page.getByTestId("update-available")).toBeVisible({
    timeout: 30000,
  });
  await expect.poll(inPage, { timeout: 15000 }).toBe(after);
  // of the game's files only the changed one was asked for, with a conditional request that
  // got the new file
  const fetched = site.log.filter((entry) =>
    /^\/(assets|images|models|sound|music|fonts|textures)\//.test(entry.url)
  );
  expect(fetched).toEqual([{ url: picture, status: 200, conditional: true }]);

  await page.getByText("Start now", { exact: true }).click();
  await titleScreen(page, "Start Tutorial");
  expect(await inPage()).toBe(after);
});
