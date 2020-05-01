importScripts('https://www.gstatic.com/firebasejs/7.2.2/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/7.2.2/firebase-messaging.js');

firebase.initializeApp({
    'messagingSenderId': '618424349380'
});

const messaging = firebase.messaging();
/*
messaging.onMessage((payload) => {
    console.log("push received when fg");
    console.log(payload);
});

messaging.setBackgroundMessageHandler(function (payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    console.log("I am alive");
    // Customize notification here
    const notificationTitle = 'Background Message Title';
    const notificationOptions = {
        body: 'Background Message body.',
        icon: '/firebase-logo.png'
    };
});


console.log(messaging);*/