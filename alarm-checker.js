// TAO Monitor — Alarm Checker
// Gira su GitHub Actions ogni minuto
// Controlla Firestore e invia notifiche FCM

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

// ---- INIT Firebase Admin ----
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if(!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
  console.error('[TAO] Credenziali Firebase mancanti. Controlla i GitHub Secrets.');
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  privateKey,
  })
});

const db        = getFirestore();
const messaging = getMessaging();

// ---- HELPERS ----
function formatDate(d) {
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatTime(d) {
  const hh  = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

// ---- MAIN ----
async function checkAlarms() {
  const now      = new Date();
  const dateStr  = formatDate(now);
  const timeStr  = formatTime(now);

  console.log(`[TAO] Controllo allarmi: ${dateStr} ${timeStr} (UTC: ${now.toISOString()})`);

  try {
    // Leggi allarmi per oggi, non ancora inviati, con orario == adesso
    const snap = await db.collection('alarms')
      .where('date',  '==', dateStr)
      .where('time',  '==', timeStr)
      .where('sent',  '==', false)
      .get();

    if(snap.empty) {
      console.log('[TAO] Nessun allarme da inviare adesso.');
      return;
    }

    console.log(`[TAO] Trovati ${snap.size} allarmi da inviare.`);

    const batch = db.batch();

    for(const doc of snap.docs) {
      const alarm = doc.data();
      console.log(`[TAO] Invio a userId: ${alarm.userId}, data: ${alarm.date} ${alarm.time}`);

      try {
        await messaging.send({
          token: alarm.fcmToken,
          notification: {
            title: '💊 Ora del Coumadin!',
            body:  `Ricorda di prendere il farmaco — ${alarm.date} alle ${alarm.time}`
          },
          data: {
            type:   'DOSE_ALARM',
            date:   alarm.date,
            time:   alarm.time,
            userId: alarm.userId || ''
          },
          android: {
            priority: 'high',
            notification: {
              channelId:              'tao_alarms',
              priority:               'max',
              defaultSound:           true,
              defaultVibrateTimings:  true,
              visibility:             'public',
              notificationCount:      1
            }
          },
          webpush: {
            headers: { Urgency: 'high' },
            notification: {
              title:              '💊 Ora del Coumadin!',
              body:               `Ricorda di prendere il farmaco — ${alarm.date} alle ${alarm.time}`,
              icon:               'https://praticobruno75-dot.github.io/TAO-MONITOR/icon-192.png',
              badge:              'https://praticobruno75-dot.github.io/TAO-MONITOR/icon-192.png',
              requireInteraction: true,
              vibrate:            [200, 100, 200, 100, 200],
              actions: [
                { action: 'confirm',  title: '✅ Confermo assunzione' },
                { action: 'snooze15', title: '⏰ +15 minuti' }
              ]
            },
            fcmOptions: {
              link: 'https://praticobruno75-dot.github.io/TAO-MONITOR/'
            }
          }
        });

        // Segna come inviato
        batch.update(doc.ref, {
          sent:   true,
          sentAt: now.toISOString()
        });

        console.log(`[TAO] ✅ Notifica inviata per ${alarm.date} ${alarm.time}`);

      } catch(fcmErr) {
        console.error(`[TAO] ❌ Errore FCM:`, fcmErr.message);
        if(
          fcmErr.code === 'messaging/registration-token-not-registered' ||
          fcmErr.code === 'messaging/invalid-registration-token'
        ) {
          batch.update(doc.ref, { sent: true, error: 'token_invalid' });
        }
      }
    }

    await batch.commit();
    console.log('[TAO] Batch completato.');

    // Gestisci anche gli snooze pendenti
    await checkSnooze(now);

  } catch(err) {
    console.error('[TAO] Errore generale:', err);
    process.exit(1);
  }
}

async function checkSnooze(now) {
  const dateStr = formatDate(now);
  const timeStr = formatTime(now);

  const snap = await db.collection('snooze')
    .where('processed', '==', false)
    .where('sendAt',    '==', `${dateStr} ${timeStr}`)
    .get();

  if(snap.empty) return;

  console.log(`[TAO] Snooze: ${snap.size} da inviare`);
  const batch = db.batch();

  for(const doc of snap.docs) {
    const s = doc.data();
    try {
      await messaging.send({
        token: s.fcmToken,
        notification: {
          title: '💊 Promemoria Coumadin!',
          body:  `Hai posticipato. Ora di prendere il farmaco — ${s.date}`
        },
        data: { type: 'DOSE_ALARM', date: s.date, time: timeStr, userId: s.userId || '' },
        android: {
          priority: 'high',
          notification: { channelId: 'tao_alarms', priority: 'max', defaultSound: true }
        },
        webpush: {
          headers: { Urgency: 'high' },
          notification: {
            title: '💊 Promemoria Coumadin!',
            body:  `Hai posticipato. Ora di prendere il farmaco!`,
            icon:  'https://praticobruno75-dot.github.io/TAO-MONITOR/icon-192.png',
            requireInteraction: true,
            actions: [
              { action: 'confirm',  title: '✅ Confermo' },
              { action: 'snooze15', title: '⏰ +15 min' }
            ]
          },
          fcmOptions: { link: 'https://praticobruno75-dot.github.io/TAO-MONITOR/' }
        }
      });
      batch.update(doc.ref, { processed: true, sentAt: now.toISOString() });
      console.log(`[TAO] ✅ Snooze inviato per ${s.date}`);
    } catch(e) {
      console.error(`[TAO] ❌ Errore snooze FCM:`, e.message);
      batch.update(doc.ref, { processed: true, error: e.message });
    }
  }
  await batch.commit();
}

// ---- ESEGUI ----
checkAlarms()
  .then(() => {
    console.log('[TAO] Completato.');
    process.exit(0);
  })
  .catch(err => {
    console.error('[TAO] Errore fatale:', err);
    process.exit(1);
  });
