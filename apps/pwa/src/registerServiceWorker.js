import logger from "./helper/logger.js";

const isLocalhost = Boolean(
  window.location.hostname === "localhost" ||
  // [::1] is the IPv6 localhost address.
  window.location.hostname === "[::1]" ||
  // 127.0.0.1/8 is considered localhost for IPv4.
  window.location.hostname.match(
    /^127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}$/
  )
);

export function register(config) {
  if (import.meta.env.DEV && "serviceWorker" in navigator) {
    // The dev server shares its port with the e2e build's preview (3000), whose worker would stay
    // registered and could answer the dev server's requests with that build's files.
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        registrations.forEach((registration) => registration.unregister())
      );
  }
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    // The URL constructor is available in all browsers that support SW.
    const publicUrl = new URL(import.meta.env.BASE_URL, window.location.href);
    if (publicUrl.origin !== window.location.origin) {
      // Our service worker won't work if BASE_URL is on a different origin
      // from what our page is served on. This might happen if a CDN is used to
      // serve assets; see https://github.com/facebook/create-react-app/issues/2374
      return;
    }

    // after the page's load event (index.jsx registers once the 3D models are in, often later)
    const start = () => {
      const swUrl = `${import.meta.env.BASE_URL}service-worker.js`;

      if (isLocalhost) {
        // This is running on localhost. Let's check if a service worker still exists or not.
        checkValidServiceWorker(swUrl, config);

        // Add some additional logging to localhost, pointing developers to the
        // service worker/PWA documentation.
        navigator.serviceWorker.ready.then(() => {
          logger.info(
            "This web app is being served cache-first by a service " +
              "worker. To learn more, visit http://bit.ly/CRA-PWA"
          );
        });
      } else {
        // Is not localhost. Just register service worker
        registerValidSW(swUrl, config);
      }
    };
    if (document.readyState === "complete") {
      start();
    } else {
      window.addEventListener("load", start);
    }
  }
}

function registerValidSW(swUrl, config) {
  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.onupdatefound = () => {
        const installingWorker = registration.installing;
        if (installingWorker == null) {
          return;
        }
        if (navigator.serviceWorker.controller) {
          // A new build. Its worker skips waiting, and the game offers it once it is in charge, not
          // as soon as it is installed: Chrome stops the old worker to hand over, and a request in
          // that moment (the dialog's pictures) starts the old one again and leaves the new one
          // waiting. The reload of "Start now" then went to the old worker as Chrome stopped it,
          // and the page hung (test/service-worker.spec.js).
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => {
              if (config && config.onUpdate) {
                config.onUpdate(registration);
              }
            },
            { once: true }
          );
          return;
        }
        installingWorker.onstatechange = () => {
          if (installingWorker.state === "installed") {
            logger.info("Content is cached for offline use.");
            if (config && config.onSuccess) {
              config.onSuccess(registration);
            }
          }
        };
      };
    })
    .catch((error) => {
      logger.error("Error during service worker registration", String(error));
    });
}

function checkValidServiceWorker(swUrl, config) {
  // Check if the service worker can be found. If it can't reload the page.
  fetch(swUrl)
    .then((response) => {
      // Ensure service worker exists, and that we really are getting a JS file.
      const contentType = response.headers.get("content-type");
      if (
        response.status === 404 ||
        (contentType != null && contentType.indexOf("javascript") === -1)
      ) {
        // No service worker found. Probably a different app. Reload the page.
        navigator.serviceWorker.ready.then((registration) => {
          registration.unregister().then(() => {
            window.location.reload();
          });
        });
      } else {
        logger.info("Service worker found. Proceed as normal.");
        registerValidSW(swUrl, config);
      }
    })
    .catch(() => {
      logger.info(
        "No internet connection found. App is running in offline mode."
      );
    });
}

export function unregister() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.unregister();
    });
  }
}
