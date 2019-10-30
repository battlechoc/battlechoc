importScripts('https://www.gstatic.com/firebasejs/7.2.2/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/7.2.2/firebase-messaging.js');

firebase.initializeApp({
	'messagingSenderId': '618424349380'
});

const messaging = firebase.messaging();