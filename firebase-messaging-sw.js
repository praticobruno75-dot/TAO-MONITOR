// firebase-messaging-sw.js
// Questo file è OBBLIGATORIO per Firebase Cloud Messaging
// Deve stare nella root del sito (stessa cartella di index.html)

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// La configurazione Firebase viene passata dall'app principale
// tramite postMessage dopo l'init
let messaging = null;

self.addEventListener('message', event => {
  if(event.data && event.data.type === 'FIREBASE_CONFIG') {
    try {
      const app = firebase.initializeApp(event.data.config);
      messaging = firebase.messaging(app);
      console.log('[FCM SW] Firebase inizializzato');
    } catch(e) {
      // App already initialized
      try {
        messaging = firebase.messaging();
      } catch(e2) {
        console.warn('[FCM SW] Init error:', e2);
      }
    }
  }
});

// Inizializzazione lazy — legge la config dal cache se disponibile
self.addEventListener('install', event => {
  console.log('[FCM SW] Installato');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[FCM SW] Attivato');
  event.waitUntil(self.clients.claim());
});

// Gestione messaggi in background (app chiusa o in background)
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
      icon:               '/TAO-MONITOR/icon-192.png',
      badge:              '/TAO-MONITOR/icon-192.png',
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

// Click sulla notifica
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        // Notifica l'app aperta
        clients.forEach(client => {
          if(event.action === 'confirm') {
            client.postMessage({ type: 'DOSE_CONFIRMED', date: data.date });
          } else if(event.action === 'snooze15') {
            client.postMessage({ type: 'SNOOZE_ALARM', date: data.date, minutes: 15 });
          }
        });

        // Apri o porta in primo piano l'app
        const taoUrl = 'https://praticobruno75-dot.github.io/TAO-MONITOR/';
        const appClient = clients.find(c => c.url.includes('TAO-MONITOR'));
        if(appClient) return appClient.focus();
        return self.clients.openWindow(taoUrl);
      })
  );
});
