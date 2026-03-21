# Configurazione GitHub Actions per gli allarmi FCM

## Cosa fa
GitHub Actions esegue `alarm-checker.js` ogni minuto.
Lo script legge gli allarmi da Firestore e invia notifiche FCM
al telefono — anche a schermo spento.

## Passo 1 — Ottieni le credenziali Firebase Admin

1. Vai su https://console.firebase.google.com
2. Seleziona il progetto `tao-monitor`
3. Clicca l'icona ⚙️ (Impostazioni progetto)
4. Tab **"Account di servizio"**
5. Clicca **"Genera nuova chiave privata"**
6. Salva il file JSON scaricato (es. `tao-monitor-firebase-adminsdk-xxxxx.json`)
7. Apri il file con Blocco Note — ti servono 3 valori:
   - `"project_id"` → es. `tao-monitor-f7214`
   - `"client_email"` → es. `firebase-adminsdk-xxx@tao-monitor-f7214.iam.gserviceaccount.com`
   - `"private_key"` → la stringa lunga che inizia con `-----BEGIN RSA PRIVATE KEY-----`

## Passo 2 — Aggiungi i Secrets su GitHub

1. Vai su https://github.com/praticobruno75-dot/TAO-MONITOR
2. Clicca **Settings** (in alto)
3. Menu laterale → **Secrets and variables** → **Actions**
4. Clicca **"New repository secret"** per ognuno di questi 3 secrets:

   | Nome secret | Valore |
   |---|---|
   | `FIREBASE_PROJECT_ID` | il valore di `project_id` dal JSON |
   | `FIREBASE_CLIENT_EMAIL` | il valore di `client_email` dal JSON |
   | `FIREBASE_PRIVATE_KEY` | il valore COMPLETO di `private_key` dal JSON (inclusi i `-----BEGIN...-----`) |

## Passo 3 — Carica i file su GitHub

Carica questi file nel repository TAO-MONITOR:
- `.github/workflows/alarm-checker.yml`
- `alarm-checker.js`
- `package.json`

## Passo 4 — Abilita FCM nell'app

1. Vai su https://console.firebase.google.com → progetto tao-monitor
2. Menu laterale → **"Impostazioni progetto"** → tab **"Cloud Messaging"**
3. Copia la **"Chiave server"** (Server key)
4. Aprila l'app → Strumenti → sezione Firebase → incolla la chiave

## Passo 5 — Verifica che funzioni

1. Vai su GitHub → tab **"Actions"**
2. Clicca su **"TAO Monitor — Alarm Checker"**
3. Clicca **"Run workflow"** per testarlo manualmente
4. Controlla che il log mostri `[TAO] Completato.` senza errori

## Note importanti

- GitHub Actions nel piano gratuito ha un limite di **2000 minuti/mese**
  Con esecuzioni ogni minuto = 1440 esecuzioni/giorno = 43.200/mese
  Ogni esecuzione dura ~30 secondi = circa 21.600 minuti/mese
  ⚠️ Questo supera il limite gratuito di 2000 minuti!

### Soluzione: usa la frequenza ogni 5 minuti
Nel file `alarm-checker.yml` cambia:
  `- cron: '* * * * *'`
con:
  `- cron: '*/5 * * * *'`

Questo usa solo 4.320 minuti/mese — abbondantemente nel limite gratuito.
L'allarme suonerà con al massimo 5 minuti di anticipo/ritardo.

Se vuoi precisione al minuto, considera il piano GitHub Pro (4$/mese)
che include 3000 minuti/mese — sufficienti per esecuzioni ogni minuto.
