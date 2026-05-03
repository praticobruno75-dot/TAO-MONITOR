// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Inizializzazione diretta — necessaria per getToken() prima del postMessage
try {
  firebase.initializeApp({
    apiKey: "AIzaSyCAZzwAZK1UcSiImuLXVPEBM1cAvjqKr5U",
    authDomain: "tao-monitor-f7214.firebaseapp.com",
    projectId: "tao-monitor-f7214",
    storageBucket: "tao-monitor-f7214.firebasestorage.app",
    messagingSenderId: "308937352758",
    appId: "1:308937352758:web:083781574e2d578af3da97"
  });
} catch(e) { /* già inizializzato */ }

let messaging = firebase.messaging();

self.addEventListener('message', event => {
  if(event.data && event.data.type === 'FIREBASE_CONFIG') {
    try {
      messaging = firebase.messaging();
      console.log('[FCM SW] Firebase inizializzato');
    } catch(e) {
      console.warn('[FCM SW] Init error:', e);
    }
  }
});

self.addEventListener('install', event => {
  console.log('[FCM SW] Installato');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[FCM SW] Attivato');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  if(!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch(e) { return; }
  const notification = payload.notification || {};
  const data         = payload.data || {};
  const title = notification.title || '💊 Ora del Coumadin!';
  const body  = notification.body  || 'Ricorda di prendere il farmaco';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:               '/icon-192.png',
      badge:              '/icon-192.png',
      tag:                'tao-alarm',
      renotify:           true,
      requireInteraction: true,
      vibrate:            [300, 100, 300, 100, 300],
      data,
      actions: [
        { action: 'confirm',  title: '✅ Confermo assunzione' },
        { action: 'snooze15', title: '⏰ +15 minuti' }
      ]
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        clients.forEach(client => {
          if(event.action === 'confirm') {
            client.postMessage({ type: 'DOSE_CONFIRMED', date: data.date });
          } else if(event.action === 'snooze15') {
            client.postMessage({ type: 'SNOOZE_ALARM', date: data.date, minutes: 15 });
          }
        });
        const taoUrl = 'https://praticobruno75-dot.github.io/';
        const appClient = clients.find(c => c.url.includes('praticobruno75'));
        if(appClient) return appClient.focus();
        return self.clients.openWindow(taoUrl);
      })
  );
});
