// "Check for updates" in the Info dialog (node --test): the browser asks the server for the
// worker again. Nothing new is "current", a changed worker is "installing" (and onFailed hears
// when it gives up), no connection is "failed", no worker at all is "unavailable".
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkForUpdate } from "../../src/updateCheck.js";

// a service worker: its state changes come as "statechange" events
const fakeWorker = () => {
  const worker = new EventTarget();
  worker.state = "installing";
  worker.become = (state) => {
    worker.state = state;
    worker.dispatchEvent(new Event("statechange"));
  };
  return worker;
};

// navigator.serviceWorker with one registration; update() finds `next` (or throws `error`)
const fakeContainer = ({
  next = null,
  error = null,
  registered = true,
} = {}) => {
  const registration = {
    installing: null,
    waiting: null,
    updates: 0,
    update: async () => {
      registration.updates += 1;
      if (error) {
        throw error;
      }
      registration.installing = next;
      return registration;
    },
  };
  return {
    registration,
    getRegistration: async () => (registered ? registration : undefined),
  };
};

test("nothing new on the server: current", async () => {
  const container = fakeContainer();
  assert.equal(await checkForUpdate(container), "current");
  assert.equal(container.registration.updates, 1);
});

test("a changed worker: installing; onFailed only when it gives up", async () => {
  const worker = fakeWorker();
  let failed = 0;
  const container = fakeContainer({ next: worker });
  assert.equal(
    await checkForUpdate(container, { onFailed: () => (failed += 1) }),
    "installing"
  );
  worker.become("installed");
  worker.become("activating");
  worker.become("activated");
  assert.equal(failed, 0);

  const broken = fakeWorker();
  const second = fakeContainer({ next: broken });
  assert.equal(
    await checkForUpdate(second, { onFailed: () => (failed += 1) }),
    "installing"
  );
  // its download failed (src/service-worker.js precaches the whole game while installing)
  broken.become("redundant");
  assert.equal(failed, 1);
});

test("a worker that already waits counts as installing", async () => {
  const container = fakeContainer();
  container.registration.waiting = fakeWorker();
  container.registration.waiting.state = "installed";
  assert.equal(await checkForUpdate(container), "installing");
});

test("no connection: failed", async () => {
  const container = fakeContainer({ error: new TypeError("Failed to fetch") });
  assert.equal(await checkForUpdate(container), "failed");
});

test("no worker (the dev server, an old browser): unavailable", async () => {
  assert.equal(await checkForUpdate(undefined), "unavailable");
  assert.equal(
    await checkForUpdate(fakeContainer({ registered: false })),
    "unavailable"
  );
});
