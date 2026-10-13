// fallback used by firebase messaging when the app's service worker is not registered (e.g. dev)
importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js"
);

// keep in sync with src/firebaseConfig.js
firebase.initializeApp({
  apiKey: "***REMOVED***",
  authDomain: "battlechoc.firebaseapp.com",
  projectId: "battlechoc",
  storageBucket: "battlechoc.appspot.com",
  messagingSenderId: "618424349380",
  appId: "1:618424349380:web:8880b60bbdd61aaf360f91",
});

const messaging = firebase.messaging();
