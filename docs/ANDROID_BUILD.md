# Android Build, Install and Update Guide

**Applies to:** the Android app (Capacitor 8) built from `client/`.
**Verified:** 2026-10-21 on an Android 17 (API 37) emulator.

---

## 1. What the Android app is

The React app you already have, packaged for Android with **Capacitor**, with
one crucial difference:

| | Web build | Android build |
|---|---|---|
| Where the data lives | The Express server's SQLite database | **A SQLite database on the phone** |
| Network needed | Yes (for every request) | **No** — everything is on-device |
| Sign-in | Email + password against the server | None — the device owner is the user |
| Backups | Server-side tooling | In-app export/import (versioned JSON) |

The UI, the financial rules and the money model are **identical** in both. The
pure rules live in `<repo>/shared/` and are imported by both the server and the
client, so the two can never disagree about a number.

---

## 2. Prerequisites

| Requirement | Version used | Notes |
|---|---|---|
| Node.js | 24.4.0 | Capacitor 8 needs ≥ 22 |
| JDK | **21** (Temurin 21.0.12) | AGP 8.13 will not run on JDK 24/25 |
| Android SDK | platform `android-37`, build-tools `36.0.0` | `ANDROID_HOME` must point at it |
| Gradle | 8.14.3 (via the wrapper) | downloaded automatically on first build |

The JDK is the one thing that is easy to get wrong. If `gradlew` fails with
*"Android Gradle plugin requires Java 17 to run"* or an unsupported-class
error, set `JAVA_HOME` to a JDK 21:

```powershell
set JAVA_HOME=C:\Users\<you>\tools\jdk-21
```

A Temurin 21 JDK can be downloaded from
<https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse>
(unzip it anywhere; it does NOT have to live in the repository).

The Android SDK location is read from `client/android/local.properties`:

```properties
sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

That file is git-ignored (it is machine-specific).

---

## 3. Building the APKs

```powershell
# 1. Install dependencies
cd client
npm install

# 2. Build the web assets FOR ANDROID
#    (CAPACITOR_ANDROID/VITE_NATIVE_BUILD switch the asset paths to relative
#     and select the on-device data source)
$env:CAPACITOR_ANDROID = "true"
$env:VITE_NATIVE_BUILD = "true"
npm run build

# 3. Copy the assets into the Android project
npx cap sync android

# 4. Build the APKs
cd android
$env:JAVA_HOME = "C:\Users\<you>\tools\jdk-21"
.\gradlew.bat assembleDebug assembleRelease
```

### Output

| APK | Path | Size | Signing |
|-----|------|------|---------|
| Debug | `client/android/app/build/outputs/apk/debug/app-debug.apk` | ~13.6 MB | Android debug key |
| **Release** | `client/android/app/build/outputs/apk/release/app-release.apk` | **~11.9 MB** | The personal release key |

---

## 4. Release signing

The release keystore lives **outside the repository** so it can never be
committed by accident:

```
C:\Users\<you>\tools\finance-release.keystore
```

`client/android/keystore.properties` points at it and is **git-ignored**
(`*.jks`, `*.keystore`, `keystore.properties` are all excluded).

Current certificate:

```
CN=Finance Manager, OU=Personal, O=Finance Manager, L=, ST=, C=IN
SHA-256: d8:9a:4b:35:9a:ac:79:9a:05:87:58:2e:11:d0:57:4d:5a:b9:17:ec:2e:70:4d:4b:18:fc:f6:df:0b:67:0e:a0
```

> **Keep a copy of `finance-release.keystore` and its passwords somewhere
> safe.** Without the SAME keystore you cannot publish an update over an
> already-installed app — Android rejects a differently-signed update.

### Generating a new keystore

```powershell
& "C:\Users\<you>\tools\jdk-21\bin\keytool.exe" -genkeypair -v `
  -keystore "C:\Users\<you>\tools\finance-release.keystore" `
  -alias "finance" -keyalg RSA -keysize 4096 -validity 10950 `
  -storepass "<password>" -keypass "<password>" `
  -dname "CN=Finance Manager, OU=Personal, O=Finance Manager, C=IN"
```

Then write the matching `client/android/keystore.properties`:

```properties
storeFile=C:/Users/<you>/tools/finance-release.keystore
storePassword=<password>
keyAlias=finance
keyPassword=<password>
```

If `keystore.properties` is missing, the release build still succeeds but is
signed with the debug key — such an APK **cannot** update an installed app.
The build prints a warning when it falls back.

---

## 5. Installing on your phone

### Option A — by USB (adb)

```powershell
adb devices                                  # phone must show as "device"
adb install -r client\android\app\build\outputs\apk\release\app-release.apk
```

`-r` reinstalls over an existing copy (your data is preserved).

### Option B — copy the file and install it by hand

1. Copy `app-release.apk` to the phone (USB, Drive, email, …).
2. Open it on the phone.
3. Android asks you to allow installs from this source — allow it for your
   file manager, then confirm the install.

### Updating an existing install

Install the new APK over the old one (same command, same keystore). **The
database is not touched by an update** — it lives in the app's private
storage and is only migrated by the app's own schema versioning.

If Android refuses with *"App not installed"* / a signature conflict, the new
APK was signed with a different key. Uninstall the old app first — **and
export a backup before you do**, because uninstalling removes the database.

---

## 6. Where the data lives, and how to move it

The database is a private SQLite file:

```
/data/data/com.mohit.finance/databases/financeSQLite.db
```

It is created on first launch, owned by the app, and unreadable by other
apps. Android's cloud backup and device-to-device transfer are **disabled**
for this app (`allowBackup="false"` + `data_extraction_rules.xml`), so the
records are never copied by the system.

**The only way your data leaves the device is the export you trigger
yourself:**

> Sidebar → **Backup & Restore** → *Export backup*

This writes a versioned JSON file into the app's own directory and offers it
through the system share sheet, so you choose where it goes (Drive, Files,
e-mail, a USB cable). The file contains every account, transaction, category,
budget, goal, transfer and setting.

**Restore** (Sidebar → *Backup & Restore* → *Choose backup file*):

1. The file is validated — format, version, required fields, types, and that
   every monetary value is a whole number of minor units.
2. You see a **preview** of what it contains and whether it will *replace* or
   *merge*.
3. You confirm explicitly.
4. A **safety copy of your current data is exported first**, so a restore can
   always be undone.
5. The import runs in a single transaction: either everything lands or
   nothing does.

### Backup format

```json
{
  "format": "finance-manager-backup",
  "formatVersion": 1,
  "appVersion": "1.0.0",
  "schemaVersion": 1,
  "exportedAt": "2026-10-21T19:00:00.000Z",
  "counts": { "transactions": 2, "accounts": 1, "...": 0 },
  "data": {
    "accounts": [ { "id": "...", "name": "...", "balance": 500050 } ],
    "categories": [], "transactions": [], "transfers": [], "budgets": [],
    "savingsGoals": [], "savingsContributions": [], "recurringExpenses": [],
    "recurringOccurrences": [], "reportHistory": [], "notifications": [],
    "notificationPreferences": [], "settings": []
  }
}
```

Money is stored as **integer minor units (paise)** — `500050` is ₹5,000.50 —
so a backup round-trips with no floating-point drift. The format is versioned;
a file from a newer format version is rejected with a clear message rather
than half-imported.

### Moving data from the web app to the phone

The web app's records live in the server's database, not in the phone's. To
move them across:

1. On the machine running the server, export the SQLite database:
   ```powershell
   cd server
   npm run db:backup
   ```
2. Convert it to the JSON backup format and copy the file to the phone.
3. On the phone: *Backup & Restore* → *Choose backup file* → select it →
   confirm.

Nothing is deleted on either side by the import; the phone keeps its own data
until you explicitly choose **Replace**.

---

## 7. Rebuilding the app icons or splash screen

The source artwork lives in `client/assets/`:

| File | Purpose |
|---|---|
| `icon-only.svg` | The full-bleed launcher icon |
| `icon-foreground.svg` | The adaptive-icon foreground (on the brand green) |
| `splash.svg` | The splash screen |

Regenerate every Android density with:

```powershell
cd client
npx capacitor-assets generate --android `
  --iconBackgroundColor "#16a34a" --iconBackgroundColorDark "#15803d" `
  --splashBackgroundColor "#ffffff" --splashBackgroundColorDark "#ffffff"
```

The adaptive icon also needs the background colour resource
(`android/app/src/main/res/values/ic_launcher_background.xml`) — the asset
tool writes it, but the committed value is `#16A34A` (the brand green).

---

## 8. Debugging on a device

The release build has `webContentsDebuggingEnabled: false` (so nobody with
`adb` can inspect the WebView of a financial app). To debug, turn it on
temporarily:

```json
"android": { "webContentsDebuggingEnabled": true }
```

then `npm run build && npx cap sync android && .\gradlew.bat assembleDebug`.

With it on, the WebView exposes a DevTools socket:

```powershell
adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
# then open http://localhost:9222 in a desktop browser
```

The app also prints a start-up trace to the console (visible in that
DevTools console, and in `adb logcat`):

```
[finance] opening the local database
[finance:db] loading the plugin module
[finance:db] plugin module loaded
[finance:db] registering the connection
[finance:db] connection registered
[finance:db] opening the database
[finance:db] database opened
[finance] schema at version 1
[finance] data store ready
```

If the app ever hangs on the loading screen, that trace tells you exactly
where it stopped.

---

## 9. Known limitations

| Limitation | Detail |
|---|---|
| **The database is not encrypted** | The SQLite file is plain text on the device. The plugin ships SQLCipher (`libsqlcipher.so` is in the APK), but encryption is **not enabled** — the app is not claiming it is. See §10. |
| No biometric app lock | Deliberately not implemented yet, so there is no way to lock yourself out of your own data. |
| The screen is locked to portrait | Chosen for a phone-first personal finance app. |
| Backups are plain JSON | Readable by anyone who gets the file. Encrypt it if that matters to you. |
| The rate limiter is in-memory | Fine for one phone; irrelevant for a server. |
| `appId` is permanent | `com.mohit.finance` is baked into the install. Changing it makes a NEW app (your data would not carry over). |
| No recurring-transaction background processing | Occurrences are generated when the app is opened, not by an Android background job. |

---

## 10. If you want encryption later

The SQLite plugin supports SQLCipher and the app already ships the library.
Enabling it means:

1. `capacitor.config.json` → `"CapacitorSQLite": { "androidIsEncryption": true }`.
2. Generating a passphrase and storing it in the Android **Keystore** (not in
   the app's preferences) — the plugin's `setEncryptionSecret` API exists for
   this.
3. Passing the passphrase to `open({ encryptionKey })` on every launch.

**Until that is implemented and verified, the app must not claim that its
data is encrypted.** It is not.
