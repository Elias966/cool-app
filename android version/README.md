# Prism for Android

The Android app is the same Prism (the same `src/` folder the desktop app
runs) inside a full-screen WebView, plus a small native shell. One code base,
two apps: every change to a module shows up in both.

- **Android 7.0 (API 24) and newer**, phones and tablets, portrait and landscape,
  multi-window. Needs an up-to-date *Android System WebView* (version 111+, the
  Play Store keeps it current, including on Android 7); on an outdated one Prism
  shows a screen with a button to update it.
- **UI** adapts to the screen: a bottom tab bar and single-column modules on phones,
  a slim side rail in landscape, the desktop-style layout on tablets, finger-sized
  buttons, and the keyboard never pops up by itself.
- **Sound** is re-tuned for small speakers (the low end is rebuilt as harmonics the
  speaker can play, a shorter, drier reverb, more compression), with haptic taps
  (Vibration toggle in the speaker menu). Typing clicks start off, since phone
  keyboards click on their own.
- **Local AI** (Braille Quest/Anywhere, Cipher Pact lessons) runs on the phone's CPU
  in a Web Worker (transformers.js + WebAssembly), using the smaller
  Qwen2.5-0.5B-Instruct (≈520 MB, downloaded once from Hugging Face the first time
  an AI mode is opened, then offline). Everything else works offline from the start.
- **Back** button/gesture: closes the open panel, then goes to Home, then leaves.
- Copy goes to the Android clipboard; key cards open the share sheet.

## Build

From the project root (needs the Android SDK with platform 35, and JDK 17+):

```bash
npm ci                 # once
npm run android        # = npm run android:web, then Gradle assembleRelease
```

The APK lands in `android version/app/build/outputs/apk/release/Prism-<version>.apk`.
Its version comes from the root `package.json`.

`npm run android:web` (`scripts/android.js`) builds the web part into
`app/src/main/assets/www/` (git-ignored): a copy of `src/`, `modules.json`,
`android/bridge.js`, the bundled AI worker and the WebAssembly runtime, and an
`index.html` with the bridge and an Android content security policy. Run it again
after changing anything in `src/`, then build with Gradle (or Android Studio: open
this folder).

Releases need nothing by hand: bumping the version in `package.json` makes the
GitHub workflow build the AppImage and this APK and attach both to the release.

## Layout

```
web/bridge.js        window.prism for Android (modules list, AI worker, share,
                     clipboard, safe areas, WebView version check)
web/ai-worker.js     the local AI, same protocol as electron/ai-host.mjs
app/src/main/java/com/theking/prism/MainActivity.java
                     the WebView: serves assets/www from
                     https://appassets.androidplatform.net/ with cross-origin
                     isolation headers (multi-threaded AI), edge-to-edge
                     insets, back button, haptics, share sheet, external links
                     open in the browser, recovers if the page runs out of memory
keystore/            the signing key (see below)
```

## Signing

`keystore/prism-release.jks` (alias `prism`, password `prism-android`) signs every
build, local and CI, so a new APK installs over the old one and keeps your data.
It lives in this private repository for convenience; anyone with access to the
repository can sign an APK that updates your installed copy. To use your own key
instead, set `PRISM_KEYSTORE`, `PRISM_KEYSTORE_PASSWORD`, `PRISM_KEY_ALIAS` and
`PRISM_KEY_PASSWORD` (as environment variables or GitHub secrets passed to the
build step). Changing the key means uninstalling the old app once.

## Debugging

Debug builds (`./gradlew assembleDebug`, package `com.theking.prism.debug`) can be
inspected from desktop Chrome at `chrome://inspect`. Errors from the page are also
logged to logcat under the tag `Prism`.
