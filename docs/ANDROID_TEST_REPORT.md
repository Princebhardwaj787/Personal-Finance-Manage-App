# Android Conversion — Verification Report

**Date:** 2026-10-21
**Test environment:** Android 17 (API 37) emulator, `Medium_Phone_API_37.0` (x86_64, 1080×2400)
**Builds tested:** `app-debug.apk` (13.6 MB) and `app-release.apk` (11.89 MB, signed)
**Node:** v24.4.0 · **JDK:** Temurin 21.0.12 · **Gradle:** 8.14.3 · **AGP:** 8.13.0

---

## 1. Summary

| Area | Result |
|---|---|
| Web build (unchanged behaviour) | ✅ PASS |
| Server build + tests | ✅ PASS (39 tests) |
| Client build + lint + tests | ✅ PASS (62 tests) |
| Android debug APK | ✅ BUILT |
| Android release APK (signed) | ✅ BUILT + SIGNATURE VERIFIED |
| App launches on a device | ✅ PASS |
| On-device database created with the correct schema | ✅ PASS |
| Financial write path (create account + transaction via the real UI) | ✅ PASS — exact to the paisa |
| Balance reconciliation | ✅ PASS |
| Offline operation (airplane mode) — read **and** write | ✅ PASS |
| Data survives an app restart | ✅ PASS |
| Security hardening in the APK | ✅ PASS (verified with `aapt`/`apksigner`) |
| Backup export / import on the device | ⚠️ PARTIAL — format and restore logic covered by automated tests; the SAF picker was not exercised on the device |
| Physical phone (real hardware) | ⚠️ NOT TESTED — only an emulator was available |
| App lock / biometric unlock | ❌ NOT IMPLEMENTED (deliberate — see limitations) |
| Database encryption | ❌ NOT ENABLED (deliberate — see limitations) |

---

## 2. Financial correctness (on the device, through the real UI)

Data was entered by driving the actual on-screen form (via the Chrome
DevTools Protocol against the WebView), then the database was pulled off the
device and inspected with an independent SQLite reader.

| Step | Stored (minor units) | Decimal | Expected |
|---|---|---|---|
| Account created with balance 5000.50 | `500050` | ₹5,000.50 | ✅ exact |
| Expense of 250.75 created | `25075` | ₹250.75 | ✅ exact |
| Balance after the expense | `474975` | ₹4,749.75 | ✅ 500050 − 25075 |
| Second expense of 99.99 (offline) | `9999` | ₹99.99 | ✅ exact |
| Final balance | `464976` | ₹4,649.76 | ✅ 500050 − 25075 − 9999 |

Reconciliation computed independently from the transaction history:

```
stored=464976  netTx=-35074  opening=500050   →  500050 - 35074 = 464976  ✅
```

`PRAGMA integrity_check` on the on-device file returned **ok**.

The same arithmetic is covered by the automated suites:

- `server/tests/integration/balance.test.js` — 7 tests over create / update /
  delete / duplicate / transfer / bulk-delete
- `client/src/data/services/services.test.js` — 27 tests over the same
  operations against a real SQLite database
- `client/src/data/backup.test.js` — 17 tests over export / validate / restore
- `client/src/data/schema.parity.test.js` — 6 tests proving the on-device
  schema matches the server's Prisma schema table-for-table and
  column-for-column

---

## 3. Persistence

| Check | Result |
|---|---|
| Database file created in the app's private storage | ✅ `/data/data/com.mohit.finance/databases/financeSQLite.db`, mode `-rw-------` (owner only) |
| Schema applied on first launch | ✅ 16 tables + `_LocalMigrations` |
| Migration recorded | ✅ `_LocalMigrations` = version 1 |
| Local user + default categories seeded | ✅ 1 user (`local@device`), 15 categories |
| Data survives an app restart | ✅ the account and both transactions were still present after force-stop + relaunch |
| Schema versioning | ✅ pending migrations are applied in order; applied versions are recorded so a re-run is a no-op |

---

## 4. Offline operation

Airplane mode was enabled on the device (`Active default network: none`,
`navigator.onLine === false`).

| Operation | Result |
|---|---|
| App launch with no network | ✅ dashboard rendered from the local database |
| Read the transaction history | ✅ "Showing 1 of 1 transactions" |
| Read the dashboard totals | ✅ balance, income and expense cards populated |
| **Write** a transaction while offline | ✅ created and persisted (`9999` minor units) |
| No network requests attempted | ✅ the app makes none — the data source is local |

The only external request the app could ever make is the Google Fonts
stylesheet, and that was **removed**: Inter is now bundled locally
(`@fontsource/inter`), and a scan of the built bundle found **no**
`googleapis`/`gstatic` reference.

---

## 5. Android behaviour

| Behaviour | Result |
|---|---|
| Launches to the dashboard (no login screen) | ✅ the native build has no account system |
| Off-canvas navigation drawer | ✅ opens, closes on navigation |
| Safe-area insets | ✅ `env(safe-area-inset-*)` applied to the header, drawer and content |
| Display cutout | ✅ `windowLayoutInDisplayCutoutMode=shortEdges` |
| Status bar | ✅ styled and overlaid; content pads around it |
| Keyboard | ✅ `setScroll` enabled so forms are not covered |
| Hardware back button | ✅ registered through `@capacitor/app`; closes the topmost dialog, then the drawer, then navigates, then exits |
| Portrait orientation | ✅ `android:screenOrientation="portrait"` |
| Deep links / reload inside the WebView | ✅ the SPA route is read from the WebView URL |
| Startup / resume / pause | ✅ handled by the Android activity; the database is reopened on launch and the UI re-reads on focus |

---

## 6. Security posture of the shipped APK

Verified directly against the packaged APK with `aapt` and `apksigner`:

| Check | Result |
|---|---|
| `android:allowBackup` | `false` — Android cloud backup and device transfer are off |
| `android:fullBackupContent` | `false` |
| `android:dataExtractionRules` | present — cloud backup **and** device transfer excluded for every domain |
| `android:usesCleartextTraffic` | `false` — no plaintext HTTP |
| Permissions requested | `INTERNET` only (required by the WebView's local origin) — no storage, camera, contacts, location or microphone |
| `X-Powered-By` | removed (framework version not advertised) |
| CSP / nosniff / frame-ancestors / referrer-policy | set by helmet, verified on a live response |
| Release signature | `CN=Finance Manager`, SHA-256 `d8:9a:4b:…:0e:a0`, verified with `apksigner` |
| Keystore / passwords in Git | ❌ none — `*.jks`, `*.keystore`, `keystore.properties` are git-ignored and the keystore lives outside the repository |
| `webContentsDebuggingEnabled` | `false` in the release build |
| Financial data in logs | ❌ none — the app logs only the start-up shape, never amounts, descriptions or account names |

---

## 7. Bugs found and fixed during the conversion

These were real defects, found by running the app on the device — none of them
were visible from the code or the automated tests alone.

| # | Bug | Impact | Fix |
|---|---|---|---|
| 1 | `getPlugin()` was an `async` function that **returned the Capacitor plugin proxy**. A Capacitor plugin is a Proxy that answers *every* property access, including `then` — so resolving a promise with it made the runtime treat it as a thenable and call `CapacitorSQLite.then()`, which throws. | **The app hung on the loading screen forever.** The promise never settled, so the error screen never appeared either. | The plugin is now always returned **wrapped** in a plain object. The same latent bug was fixed in `fileExport.js` (Filesystem, Share) before it could bite. |
| 2 | The plugin's `run(statement, { transaction: true })` only **commits** when the statement returns a `lastId` (an INSERT). An UPDATE or DELETE would be silently **rolled back** by the plugin's `finally` block. | Balance updates and deletes would have been silently lost. | Every statement is sent with `transaction: false`; real transactions are managed explicitly with `begin` / `commit` / `rollback`. |
| 3 | The connection is registered **in memory per process**, but `isDBExists` checks the **file**. Skipping `createConnection` when the file exists left `open()` with no connection → *"No available connection"*. | The second launch of the app would fail. | The connection is always registered; "already exists" is tolerated. |
| 4 | The schema is ~50 DDL statements, sent one native round trip at a time. | A visibly slow first launch. | The statements are sent as one batch (`executeBatch`). |
| 5 | `Keyboard.setAccessoryBarVisible` is **iOS-only** and logged an error on Android. | A red error in the console on every start. | Removed; only the Android-relevant call remains. |
| 6 | Money was displayed rounded to the nearest rupee ("₹251" for ₹250.75). | **Misstated a financial figure** on every screen. | The formatter now shows paise whenever the amount is not a whole rupee. |

A defensive **15-second timeout** was also added around every native database
call, so a future hang surfaces as a clear error with a *Try again* button
instead of an endless spinner.

---

## 8. Not tested / not implemented

Stated plainly, as required:

| Item | Why |
|---|---|
| **A physical phone** | Only an emulator was available. The APK installs and runs on the emulator; behaviour on real hardware (notably the SAF file picker and the share sheet) should be confirmed on the device. |
| **Backup export/import through the Android file picker** | The backup *format*, validation, preview, confirmation, safety copy and atomic restore are covered by 17 automated tests against a real database, and the export/import code paths run the same service code. The **Storage Access Framework picker** itself was not exercised on the device. |
| **App lock / biometric unlock** | Not implemented. It was left out deliberately so there is no way to lock yourself out of your own financial data. |
| **Database encryption** | Not enabled. SQLCipher ships in the APK, but until the passphrase is stored in the Android Keystore and the flow is verified, the app must not claim its data is encrypted. |
| **Background processing of recurring transactions** | Occurrences are generated when the app is opened, not by an Android background job. A `WorkManager` job would be the next step. |
| **Play Store release** | Out of scope — direct APK installation only. |

---

## 9. Reproducing the verification

```powershell
# Automated suites
cd server && npm test && npm run lint
cd client && npm test && npm run lint

# Build the APKs
cd client
$env:CAPACITOR_ANDROID = "true"; $env:VITE_NATIVE_BUILD = "true"
npm run build
npx cap sync android
cd android
$env:JAVA_HOME = "C:\Users\<you>\tools\jdk-21"
.\gradlew.bat assembleDebug assembleRelease

# Install and launch on a device/emulator
adb install -r app\build\outputs\apk\release\app-release.apk
adb shell am start -n com.mohit.finance/.MainActivity

# Check the on-device database
adb exec-out run-as com.mohit.finance cat databases/financeSQLite.db > device.db
```
