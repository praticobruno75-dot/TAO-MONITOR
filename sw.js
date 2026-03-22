// TAO Monitor — Service Worker
// Versione cache: aggiorna questo numero ad ogni deploy
const CACHE_VERSION = 'tao-v2';
const CACHE_NAME = `tao-monitor-${CACHE_VERSION}`;

// File da mettere in cache per funzionamento offline
const ASSETS_TO_CACHE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // CDN libraries (cache on first use via network-first strategy)
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/chartjs-plugin-zoom/2.0.1/chartjs-plugin-zoom.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&family=DM+Sans:wght@300;400;500;600&display=swap',
];

// =============================================
// INSTALL: cache all static assets
// =============================================
self.addEventListener('install', event => {
  console.log('[SW] Installing TAO Monitor SW...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache app files (required)
      const appFiles = ['./index.html', './manifest.json'];
      return cache.addAll(appFiles).then(() => {
        // Try to cache CDN libs (best effort, ignore failures)
        const cdnFiles = ASSETS_TO_CACHE.filter(u => u.startsWith('http'));
        return Promise.allSettled(cdnFiles.map(url =>
          fetch(url, { mode: 'cors' })
            .then(res => res.ok ? cache.put(url, res) : null)
            .catch(() => null)
        ));
      });
    }).then(() => {
      console.log('[SW] Install complete');
      // Don't skipWaiting automatically - wait for user to click "Aggiorna"
      // self.skipWaiting() is called only when user confirms update
    })
  );
});

// =============================================
// ACTIVATE: delete old caches
// =============================================
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('tao-monitor-') && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => {
      console.log('[SW] Activated.');
      // Don't call clients.claim() - it triggers controllerchange
      // and causes the update banner to loop
    })
  );
});

// =============================================
// FETCH: Cache-first for app files, Network-first for CDN
// =============================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if(event.request.method !== 'GET') return;

  // Skip Google Drive API calls (always need network)
  if(url.hostname.includes('googleapis.com') || url.hostname.includes('google.com')) return;

  // Skip chrome-extension and non-http requests
  if(!event.request.url.startsWith('http')) return;

  // Strategy: Cache-first for same-origin app files
  if(url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Strategy: Network-first for CDN (fall back to cache if offline)
  if(url.hostname.includes('cdnjs.cloudflare.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(networkFirst(event.request));
    return;
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if(cached) return cached;
  try {
    const response = await fetch(request);
    if(response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch(e) {
    return new Response('<h1>Offline</h1><p>Connettiti per caricare l\'app.</p>', {
      headers: { 'Content-Type': 'text/html' }
    });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if(response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch(e) {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}

// =============================================
// PUSH NOTIFICATIONS (future use)
// =============================================
self.addEventListener('push', event => {
  if(!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'TAO Monitor', {
      body:  data.body  || 'Promemoria assunzione farmaco',
      icon:  './icon-192.png',
      badge: './icon-192.png',
      tag:   'tao-alarm',
      renotify: true,
      requireInteraction: true,
      actions: [
        { action: 'confirm', title: '✅ Confermo assunzione' },
        { action: 'snooze',  title: '⏰ +15 minuti' }
      ],
      data: data
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if(event.action === 'confirm') {
    // Notify app to mark as taken
    self.clients.matchAll({ type: 'window' }).then(clients => {
      clients.forEach(client => client.postMessage({
        type: 'DOSE_CONFIRMED',
        date: event.notification.data?.date
      }));
    });
  } else if(event.action === 'snooze') {
    // Re-schedule notification in 15 minutes
    const date = event.notification.data?.date;
    setTimeout(() => {
      self.registration.showNotification('TAO Monitor — Promemoria', {
        body: 'Hai posticipato. Ora di prendere il Coumadin!',
        icon: './icon-192.png',
        tag: 'tao-alarm-snooze',
        requireInteraction: true,
        data: { date }
      });
    }, 15 * 60 * 1000);
  } else {
    // Click on notification body: open app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        if(clients.length) return clients[0].focus();
        return self.clients.openWindow('./index.html#terapia');
      })
    );
  }
});

// =============================================
// MESSAGE HANDLER (from main app)
// =============================================
self.addEventListener('message', event => {
  if(event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// =============================================
// FCM BACKGROUND MESSAGES
// =============================================
self.addEventListener('push', event => {
  if(!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch(e) { return; }

  const title = payload.notification?.title || '💊 Ora del Coumadin!';
  const body  = payload.notification?.body  || 'Ricorda di prendere il farmaco';
  const data  = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:             '/icon-192.png',
      badge:            '/icon-192.png',
      tag:              'tao-alarm',
      renotify:         true,
      requireInteraction: true,
      vibrate:          [300, 100, 300, 100, 300],
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

  if(event.action === 'confirm') {
    // Notify open windows to mark dose as taken
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'DOSE_CONFIRMED', date: data.date }));
        if(clients.length) return clients[0].focus();
        return self.clients.openWindow('/');
      })
    );
  } else if(event.action === 'snooze15') {
    // Write snooze to be picked up by alarm-checker.js
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
        clients.forEach(client => client.postMessage({
          type: 'SNOOZE_ALARM', date: data.date, minutes: 15
        }));
      })
    );
  } else {
    // Open app
    event.waitUntil(
      self.clients.matchAll({ type: 'window' }).then(clients => {
        if(clients.length) return clients[0].focus();
        return self.clients.openWindow('/');
      })
    );
  }
});
