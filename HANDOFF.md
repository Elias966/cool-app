# Prism: handoff

State as of 2026-10-09. Read this before changing anything; `README.md` is the
user-facing description, this file is for whoever works on the code next.

## ▶ Where the work stopped (read first)

The user asked for an Android version ("android version" folder, UI and sound
optimized for phones and tablets, Android 7+, released next to the AppImage),
then asked to stop and write this handoff before it was finished. Branch:
`claude/vigilant-cray-k2tw4d` on GitHub `Elias966/cool-app` (all pushed).
**Version is still 1.1.0, so no Android release has been published yet.**

Done and verified:
- `android version/` Gradle project, `scripts/android.js`, bridge and AI worker
  (details in "Android app" below). `npm run android` builds a signed
  `Prism-<version>.apk` (~30 MB, minSdk 24, targetSdk 35); checked with
  `aapt2 dump badging` and `apksigner verify`.
- Shell (title bar, bottom tab bar / side rail, home, safe areas, back button,
  no auto-raised keyboard, tap sounds), phone sound chain + haptics, 3D
  background at a lower render scale on touch devices.
- In Chromium phone emulation with a fake bridge: back button, native clipboard,
  key-card share, haptics, sound menu (`tests/mobile/feature-test.mjs`); the
  phone AI end to end (download → load with 4 threads → Braille Quest story,
  `tests/mobile/ai-int.mjs`); phone sound is ~2x more audible above 250 Hz (up
  to 4x for deep sounds) without clipping (`tests/mobile/phone-sound.mjs`).
- Desktop: shell/sound test still passes (sounds, mute, saved settings).
- Module layouts reviewed on phone, landscape and tablet: **Braille**,
  **Layered Encoding**, **Japanese Scripts**.
- Release workflow builds the APK too and attaches it (+ .sha256) to the same
  release; `release-notes/1.2.0.md` is written.

Done in the next session (on the user's machine, 2026-10-09):
1. **Remaining module layouts reviewed**: Base64, Esoteric Languages, Dingbats,
   Ancient Scripts, Cipher Pact, on phone/small/landscape/tablet/tablet-landscape,
   with real use (encode, long text, decode, Cipher make/read/practice) and the
   keyboard-open size; no sideways overflow anywhere. Fixed:
   - Dingbats and Ancient: the side column (symbol keyboard, Rosetta stone, notes)
     had collapsed to 0px on phones (and mostly on tablets), so it was unreachable.
     `.X > * { flex: none }` misses it (it sits inside the `display: contents`
     main), and as a touch scroller it shrank. Now `flex: none; overflow: visible`.
   - Ancient, keyboard open: the empty live tablet shrank to its padding and the
     hint overlapped the label (min-height 64px now).
   - Base64: the history now sits between pipeline and console (it was below the
     console, so on small phones new cards landed off screen); on short phones
     (≤720px tall) the pipeline moves below the console.
   - Cipher Pact: the tablet-portrait console was cut off (`--cp-rest` 350px);
     on landscape phones the console now fits on the first screen (`--cp-min`
     130px, smaller flip card, idle hint line hidden); the placeholder no
     longer gets clipped on small phones.
   Desktop computed styles compared before/after at 1320x840 and 1000x700: same.
   Left as is: Dingbats symbol-keyboard keys are ~22px wide on phones (a full
   13-key row); "Hover a tile/glyph" hint texts say hover on touch devices.
2. Desktop smoke test re-run in Electron (hidden window, temp user data, AI
   stubbed): all 8 modules boot with intro sounds, Cipher forge → type → seal
   works, mute is saved, no errors. The earlier empty result was just load.

Not finished:
3. `npm run android` could not be run locally (no JDK/Android SDK on the user's
   machine); the release workflow builds the APK. Bump `package.json` to **1.2.0**, commit,
   push, and watch the "Release AppImage and APK" workflow until `v1.2.0` has the
   AppImage, the APK and both .sha256 files. The APK build step is new and has
   never run on GitHub yet (setup-java 17 + `./gradlew assembleRelease`; the
   runner's preinstalled Android SDK is expected to have platform 35).
4. Not possible in the container: a real device or emulator test (no KVM). Ask
   the user to try the APK on their phone after the release.

Decisions to mention to the user:
- The signing key `android version/keystore/prism-release.jks` (password
  `prism-android`) is committed so every build can update an installed copy;
  anyone with repo access could sign an update. Env vars allow a private key.
- Android uses the smaller Qwen2.5-0.5B model (~520 MB) for the AI modes.

## What it is

**Prism** is a modular Electron desktop app, shipped as a Linux AppImage and
(since 1.2.0) as an Android app built from the same `src/`. A
three.js 3D background plus a shell (dock, home launcher, page transitions)
hosts **modules**: self-contained pages discovered at startup. Eight modules
exist, each translating text both ways with heavy visual effects.

- Project: `/home/theking/cool-app` on the user's machine; git repo on GitHub
- Build output: `dist/Prism-<version>-x86_64.AppImage` (~144 MB) and
  `android version/app/build/outputs/apk/release/Prism-<version>.apk` (~30 MB).
  1.1.0 = Layered Encoding, Japanese Scripts, Cipher Pact, Clear buttons and
  sound. 1.2.0 = the Android app (phone/tablet layouts, phone-tuned sound, haptics).
- Git: GitHub `Elias966/cool-app` (private); releases are published there.
- Target: Ubuntu-family (the user's machine is Zorin OS / GNOME on X11) and Arch

## Run and build

Node is installed only inside the project (`.tools/node`, v24); there is no
system Node.

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
npm start        # dev run (runs scripts/vendor.js first)
npm run dist     # build the AppImage (also runs scripts/vendor.js first)
```

- `scripts/vendor.js` copies the parts of three.js the renderer imports into
  `src/vendor/three/` (git-ignored). Needed because electron-builder silently
  drops any `examples/` folder inside `node_modules`.
- Electron 44.7, electron-builder 26.15, three 0.186, @huggingface/transformers 4.3.1.
- DevTools: F12 or Ctrl+Shift+I. Ctrl+R reloads. Esc returns home.
- Releases: `.github/workflows/release.yml` builds the AppImage and the APK on
  GitHub and publishes release `v<version>` (both + .sha256) whenever `package.json`
  changes and that version has no release yet; also runnable by hand from the
  Actions tab. Release text = `release-notes/<version>.md` + install steps.
- If `npm ci` fails in `onnxruntime-node`'s postinstall (it downloads optional
  CUDA libraries, which the build excludes anyway), install with
  `ONNXRUNTIME_NODE_INSTALL=skip npm ci`; the CPU runtime is in the package.
- The project-local npm doesn't run install scripts it hasn't been told to
  allow, so after `npm ci` Electron has no binary: run
  `node node_modules/electron/install.js` (and `node node_modules/esbuild/install.js`).

## Architecture

```
electron/main.js       window (frameless), app://prism protocol, module discovery,
                       AI utility process bridge, AppImage desktop integration
electron/preload.js    window.prism: listModules, openModulesFolder, ai.*, win.*
electron/ai-host.mjs   utility process: downloads + runs ONNX models (transformers.js)
src/index.html         shell markup + import map for three
src/core/app.js        router, dock, transitions, builds the ctx handed to modules
src/core/scene.js      three.js background (stars, wireframe core, grid, bloom)
src/core/fx.js         tilt, magnetic, ripple, scramble, burst (particle canvas)
src/core/ai.js         ctx.ai (load / generate / status), cancels jobs on unmount
src/core/sound.js      ctx.sound: synthesized sound effects, volume/mute settings
src/core/home.js       launcher page
src/modules/<id>/      one folder per module
build/after-pack.js    wraps the binary to add --no-sandbox inside AppImages
build/icon.png         app icon (generated with Python, 512 px)
```

- Everything is served from one origin, `app://prism/`: `/…` → `src/`,
  `/user/…` → `~/.config/Prism/modules/` (user-installed modules, no rebuild).
- **Module contract:** a folder with `module.json` (`id`, `name`,
  `description`, `icon`, `accent`, `entry`, `style`, `order`) and an ES module
  whose default export is `{ mount(root, ctx) }`; `mount` returns a cleanup
  function. `ctx` = `{ meta, scene, fx, sound, toast, ai, storage, navigate, url }`.
  `window.prism` comes from `electron/preload.js` on desktop and from
  `android version/web/bridge.js` on Android (`window.prism.platform`).
  `storage` is namespaced localStorage per module. Prefix module CSS classes
  (`br-`, `b64-`, `dg-`, `an-`, `es-`, `ly-`, `jp-`, `cp-`).
- Each module follows the same page pattern: canvas intro effect, header,
  live preview, history feed of cards (saved in `ctx.storage`, max ~40), a
  console with textarea + send button, a mode switch, and a Clear button that
  wipes the history (in the header for Braille, in the console bar elsewhere).

## Modules

| Module | Folder | Modes | Core logic |
|---|---|---|---|
| Text to Braille | `braille/` | Text→Braille, Braille→Text, Braille Quest (AI), Braille Anywhere (AI) | `braille.js` (UEB Grade 1), `ai-modes.js` |
| Text to Base64 | `base64/` | encode, decode | `base64.js` |
| Text to Dingbats | `dingbats/` | encode, decode (font auto-detect) | `dingbats.js`, `maps.js` |
| Ancient Scripts | `ancient/` | encode, decode (mixed scripts) | `scripts.js` |
| Esoteric Languages | `esolang/` | text→program, program→text (runs it) | `esolangs.js` |
| Layered Encoding | `layers/` | text→layers, layers→text (Auto-peel or My chain) | `layers.js` |
| Japanese Scripts | `japanese/` | text→日本語 (5 styles), 日本語→text (style auto-detect, romaji) | `japanese.js` |
| Cipher Pact | `cipher/` | Make (AI lesson + sealed secret), Read, Practice | `cipher.js`, `cipher-ai.js` |

Notes per module:

- **Braille:** UEB Grade 1 only (no contractions). Perkins keypad chords use
  physical key codes (F D S J K L), so any keyboard layout works.
- **Braille AI modes:** the user went through many iterations and then asked
  to return to the **first version** of both modes while keeping the large
  model. Current state = original prompts (16 Quest formats, 18 Anywhere
  formats, each pre-filling an opening line containing the placeholder word
  "Glyph"; the model never sees the user's text; "Glyph" is swapped for
  braille afterwards; one generation of ≤120 tokens). Model:
  `onnx-community/Qwen2.5-1.5B-Instruct`, dtype `q4f16` (1.2 GB, ~8.6 tok/s on
  CPU, ~5 s load). Change the model only via `AI_SPEC` in
  `braille/ai-modes.js`; the UI label is derived from it (`AI_LABEL`).
- **Base64:** decoder accepts URL-safe, missing padding, whitespace, `data:` URIs;
  binary results shown as hex.
- **Dingbats:** maps generated from Wikipedia's Unicode mapping tables
  (Zapf follows Apple's DINGBATS.TXT). No font maps two keys to one symbol, so
  decoding is exact. Bundles Noto Sans Symbols / Symbols 2 / Math (OFL, license
  in `fonts/OFL.txt`).
- **Ancient:** 6 scripts (Elder Futhark, Egyptian hieroglyphs, Ogham, Ugaritic
  cuneiform, Ancient Greek, Latin). Every code point was checked against
  Python's `unicodedata`. Decoding picks the most common English letter for
  shared signs (`PREFER` in `scripts.js`), so it reads well but isn't always
  the exact original spelling. Bundles 5 Noto fonts (OFL).
- **Esolang:** generators + step-by-step interpreters for Brainfuck, Ook!,
  Whitespace (full), Malbolge (reference semantics), Befunge-93 (full), Unary.
  Every generated program is verified by running it. The Malbolge interpreter
  was validated against the published "Hello, world." program. Malbolge
  generation is straight-line (no jumps) and can only reach 201 of 256 byte
  values, so non-ASCII text is reduced to ASCII with an on-screen note.
- **Layered Encoding:** encoding chains (a.k.a. String Compositions /
  Mixture-of-Encodings): up to 8 invertible layers stacked on one string, in
  any order. 13 layers: Base64, Base32, Ascii85, Hex, Binary, Percent, HTML
  entities, Unicode escapes, ROT13, ROT47, Atbash, Reverse, Fullwidth
  (Fullwidth swaps ASCII and wide forms both ways, so it is its own inverse).
  Chain built in the side panel (click tiles, drag or ↑↓ to reorder, presets,
  Shuffle = random order and depth). Decoding: *My chain* undoes the current
  chain exactly; *Auto-peel* is a beam search over decodings scored by
  `readability()` (format decodes earn a bonus, blind cipher steps cost, at
  most 4 ciphers in a row). Random chains of depth 1–5: 100% exact round trip,
  ~98.5% auto-peel; misses are inherently ambiguous (reversed CJK, 2–3 letter
  messages). Intermediate strings are capped at 400k chars (Binary is 9x per
  layer).
- **Japanese Scripts:** five styles. *Katakana*: English → loanword katakana
  (`WORDS` dictionary of ~280 real loanwords, then spelling rules in
  `englishToPseudo()`; rule order matters, see the comments); decodes known
  words back to English, the rest to romaji, so it is approximate. *Hiragana*:
  letter cipher (uppercase → katakana, digits → 〇一二…). *Romaji mix*: romaji
  syllables → kana, other letters stay Latin, Capitalised words in katakana;
  each word is kept only if it reads back exactly. *Hankaku*: halfwidth
  katakana cipher. *Kanji-look*: look-alike kanji (case not kept). Decoding
  auto-detects the style (`detectStyle()`); clicking a style forces it, as in
  Dingbats. Real kana is transliterated with Hepburn (`kanaToRomaji()`), with
  spaces at script changes. Furigana (`<ruby>`) and vertical (tategaki)
  toggles. Fonts: `japanese/fonts/` holds Noto Sans JP 400/700 and Noto Serif
  JP 900 cut down to 458 characters (kana, halfwidth forms, CJK punctuation,
  the Kanji-look glyphs, kanji digits and the UI kanji 日本語文字混書漢風縦横印桜),
  about 80 KB each. They were built from the `@fontsource/noto-sans-jp` /
  `noto-serif-jp` 5.3.0 npm packages: fontTools subset of each `*-400/700/900`
  woff2 piece, merged with `fontTools.merge`. Any new kanji in the UI must be
  added the same way, or it falls back to a system font.
- **Cipher Pact:** a private cipher between the user and a friend. Every
  forged message gets a new key code (`ADJ-NOUN-123`, ~2M combinations); the
  code alone seeds the alphabet (`keyFor()`: hash → mulberry32 → random theme
  of 9 → shuffle onto a–z0–9), so any text also works as a shared passphrase.
  Flow: Forge (wheel spins, the local AI streams a lesson note in one of 10
  formats) → the user types the secret → Seal. The model never sees the
  alphabet or the secret; clues (3 letters) and a warm-up word are added by
  code and never use letters of the secret (`lessonFor()`). Typing the secret
  before forging seals it automatically once the note is done. Without the AI
  (or on error) a built-in note is typed out instead. Read mode finds the key
  in the key ring by symbol coverage + the clue line (`findKey()`), or uses a
  typed code. Practice mode: flashcards with per-key mastery. Key card: copy
  as image (ClipboardItem), save as PNG, or copy as text. The AI model comes
  from `braille/ai-modes.js` (`AI_SPEC`, re-exported by `cipher-ai.js`).
  Fonts in `cipher/fonts/` are cut from the Runic, Symbols, Symbols 2 and Math
  fonts already in `ancient/` and `dingbats/`, plus `@fontsource/noto-color-emoji`
  (SVG table dropped, so it is a monochrome fallback; systems with a colour
  emoji font use that). Changing a theme's symbol list changes the alphabet of
  every existing code, so old messages would no longer decode.
  Message styles (picker in the Make bar, `STYLES` in `cipher.js`): 🔑 Clues
  (key sent separately, the most private), and four key-inside styles taken
  from the user's own examples: 🔤 Letter code (`code: A=✦, B=✧.` + symbols),
  🍎 Word swap (`When I say 'apple' I mean 'cool'. … Now: apple`), 🔢 Number
  map (`mapping: 1=y, 2=i.  1-2-3`), 🟢 Emoji words (`Our secret language:
  🔴=hide. 🔴🔵`). 🎲 Surprise (default) picks one per message. Key-inside
  messages can be read by anyone who sees them; cards say so (yellow tag).
  `buildStyle()` makes them with a generator seeded by the key code, so the
  live preview matches the sealed result; `parseInline()` reads them back,
  also when typed by hand, and Read mode tries it before the key ring.

## Sound

`src/core/sound.js` synthesizes every sound with the Web Audio API
(oscillators and filtered noise → compressor + generated reverb); there are
no audio files. Notes come from one pentatonic scale (A minor; the koto uses
the Japanese in-scale) so overlapping sounds stay in tune; `x` pans a sound to
where its animation is; fast repeats are throttled per preset (`THROTTLE`).

- Automatic, for every module: `fx.burst` → sparkle, `fx.scramble` → one
  shared stream of ticks ending on a settle note, `ctx.scene.pulse/warp` →
  thump/whoosh (modules get a wrapped scene; the shell's own warps are silent),
  toasts → ding / error buzz. The shell adds: navigation whooshes, a click for
  every button/tab press (toggles play on/off), dock and home-card hovers, and
  key ticks in text fields. `silent: true` on `burst`/`scramble` skips the
  sound where a module plays its own (Ancient's chisel dust, Esolang output).
- Per module: each intro has a timed `ctx.sound.sequence` matching its
  animation (Japanese and Cipher start theirs from the intro's first frame,
  because they wait for fonts), stopped when the intro is skipped. Plus
  signature moments: Braille dot chimes in step with the cell animation and
  AI token ticks; Base64 ring arpeggio; Dingbats font shuffle; Ancient chisel
  per carved glyph; Esolang boot ticks/beeps and a bleep per output character;
  Layered Encoding drops, plucks and dice; Japanese koto, brush and hanko stamp;
  Cipher Pact whir, spoke ticks, a chime per sealed letter (pitched by the
  letter), stamp, flashcard flips. Every empty-send shake buzzes.
- Title bar speaker: volume slider, sound on/off, typing clicks on/off
  (scroll on the icon changes volume); saved in localStorage `prism:sound`.
- `main.js` sets `autoplayPolicy: 'no-user-gesture-required'` so intros
  sound before the first click.
- Tests: `sound.measure(name)` renders a preset offline (peak/RMS);
  setting `window.__prismSoundLog = []` records every sound name played.

## Android app

`android version/` (see its README) wraps the same `src/` in a WebView;
`scripts/android.js` (`npm run android:web`) copies it into the APK's assets
and `npm run android` builds `Prism-<version>.apk` (minSdk 24 = Android 7.0,
targetSdk 35, versionCode = major·10000 + minor·100 + patch, signed with the
committed `keystore/prism-release.jks`).

- **Serving:** `MainActivity` serves `assets/www` at
  `https://appassets.androidplatform.net/` itself (not WebViewAssetLoader, so
  `.mjs`/`.wasm` get the right MIME types) with COOP/COEP headers →
  `crossOriginIsolated`, so the AI uses several threads. Absolute paths like
  `/vendor/three/...` work because the site root is the asset root.
- **Bridge:** `web/bridge.js` (plain ES2015 so an ancient WebView can still show
  the "update Android System WebView" screen) defines `window.prism` with
  `platform: 'android'`, `listModules()` from the generated `modules.json`, no
  `openModulesFolder` (so no user modules, reload/folder dock buttons or "Add a
  module" card), `ai.*` backed by `web/ai-worker.js` in a module Worker,
  `shareFile(blob, name)` (share sheet; `<a download>` clicks on blob URLs are
  routed there too), `clipboard.writeText` → native clipboard.
  Native side: `window.AndroidBridge` (`insets`, `copyText`, `shareFile`,
  `haptic`, `openUrl`, `appVersion`).
- **AI:** `AI_SPEC` switches to `onnx-community/Qwen2.5-0.5B-Instruct` `q8`
  (≈520 MB) on Android; WASM runtime = onnxruntime-web's
  `ort-wasm-simd-threaded.asyncify.*` copied to `www/android/ort/`. Models live
  in the WebView's Cache Storage (`transformers-cache`). Measured in desktop
  Chromium: ~5 tok/s with 4 threads; phones vary. If the renderer dies (out of
  memory), MainActivity recreates the WebView instead of crashing.
- **Screen:** edge to edge; the native side reports bar sizes as CSS vars
  `--safe-top/right/bottom/left` and shrinks the WebView above the keyboard.
  Body classes: `platform-android`, and `handheld` (touch device, set from
  `sound.handheld`). Back → `window.prismBack()` (closes the sound panel, then
  goes Home, else Android leaves the app).
- **Responsive CSS** (shell in `core/styles.css`, each module at the end of its
  `style.css`), shared breakpoints:
  - phone: `(max-width: 599px), (max-width: 760px) and (orientation: portrait)`
    → bottom tab bar, compact list cards on Home, compact module heads;
  - landscape phone: `(max-height: 520px) and (min-width: 600px)` → slim rail;
  - stack: `(max-width: 1000px) and (hover: none), (max-width: 760px), (max-height:
    520px) and (min-width: 600px)` → two-column modules become one column;
  - keyboard open: `(max-width: 760px) and (orientation: portrait) and
    (max-height: 560px)` → tab bar and module heads hide;
  - `(pointer: coarse)` → finger-sized targets. Desktop is untouched.
- **Touch:** on handhelds `focus()` on text fields only works while the keyboard
  is already up (modules focus their inputs after intros, which would pop the
  keyboard); click sounds play on tap (`click`), not on touch-down, so scrolling
  is silent; tilt/magnetic/hover sounds ignore touch.
- **Sound on handhelds** (`sound.handheld`): highpass at 110 Hz plus a
  "virtual bass" path (lowpass → asymmetric soft-clip → bandpass ~520 Hz) so
  low tones are heard on phone speakers, a shorter drier reverb, harder
  compression, highshelf −4 dB at 7.5 kHz. Haptics via `AndroidBridge.haptic`
  (`HAPTICS` map in sound.js: clicks/toggles tick, press, stamp heavy,
  error/success patterns), toggle "Vibration" in the speaker menu. Typing
  clicks default off. The AudioContext suspends while the app is hidden.
- **Testing:** serve `src/` with the generated `index.html`/`modules.json`/
  `android/` and COOP/COEP headers to Playwright Chromium with phone/tablet
  emulation (`isMobile`, `hasTouch`) and a fake `window.AndroidBridge`.
  Building the APK needs the Android SDK (platform 35) and JDK 17+.

## Packaging details (each one fixed a real problem)

- `build.toolsets.appimage: "1.0.3"`: static AppImage runtime, so no
  `libfuse2`/`fuse2` is needed (works on Arch). Still needs `fusermount3` from
  FUSE 3, which desktop installs have.
- `build/after-pack.js`: AppImages can't ship a setuid sandbox helper, so the
  launcher adds `--no-sandbox` when running as an AppImage.
- `asarUnpack` for `onnxruntime-node`, `sharp`, `@img`; the CUDA/TensorRT
  libraries and other platforms' binaries are excluded via `build.files`.
- `main.js` `integrateDesktop()`: on AppImage launch it writes
  `~/.local/share/applications/prism.desktop` (`StartupWMClass=prism`) and the
  icon to `~/.local/share/icons/hicolor/512x512/apps/prism.png`. `Icon=` is an
  **absolute path** because the user's stale `icon-theme.cache` hid the icon
  (dock showed a gear).
- Portable mode: a folder named `Prism-1.1.0-x86_64.AppImage.config` next to
  the AppImage makes all data (models, history) live there.

## Where data lives

- `~/.config/Prism/`: app data, history (Local Storage), downloaded models in
  `models/`. The AI model downloads automatically the first time an AI mode is
  opened (not at launch); it's already downloaded on the user's machine.
- `~/.config/Prism/models/HuggingFaceTB/SmolLM2-360M-Instruct` (350 MB) is the
  old, unused model. Offered to delete it; the user hasn't answered.

## Gotchas learned the hard way

- CSS entrance animations must use `backwards` fill, not `forwards`/`both`, or
  they lock `transform` and break hover tilt.
- three.js: set `scene.background` rather than `renderer.setClearColor` with the
  bloom/OutputPass composer (otherwise the background is sRGB-encoded twice and
  looks grey).
- Base64 live preview: don't use `direction: rtl` tricks; `=` padding jumps to
  the wrong end. It now trims the front and shows `…` instead.
- Coding fonts merge `->` into arrows; the esolang module disables `calt`/`liga`.
- Esolang: clear the pending live-recompile timer before starting a run, or the
  run gets reset.
- Noto Sans Math reports huge line metrics: Dingbats cards use flex rows and
  only scroll when content is really long.
- Text-presentation selector `U+FE0E` is appended to displayed symbols so they
  don't render as colour emoji; it is not included in copied text.

## How things were verified

Mobile/Android test scripts are in `tests/mobile/` (see its README; on the
user's machine: playwright installed in any scratch folder via `PW_MODULES`, and
`CHROMIUM=/opt/brave.com/brave/brave`). Other
tests so far were ad hoc scripts (not saved in the repo):

- **Node unit checks** of the pure files (`braille.js`, `base64.js`,
  `dingbats.js`, `scripts.js`, `esolangs.js`): round trips, edge cases, and
  every generated esolang program run back to its input.
- **In-app checks:** an Electron harness that `require`s `electron/main.js`
  after `app.setPath('userData', <temp dir>)`, drives the page with
  `webContents.executeJavaScript`, and saves `capturePage()` screenshots.
- **The packaged AppImage:** launched with `--remote-debugging-port` and
  `--user-data-dir=<temp>`, then driven over the DevTools protocol.
- Always use a temporary user-data dir so the user's real history isn't touched.
- In the previous session, Claude Code's auto mode sometimes blocked shell
  commands mid-conversation; the Edit tool kept working when that happened.

## Open items / ideas

- Finish the Android version: see "Where the work stopped" at the top.
- Electron's spellchecker downloads an English dictionary from Google once
  (`~/.config/Prism/Dictionaries`). Offered to disable it (`spellcheck: false`
  in `webPreferences`) so the app is fully offline; not done.
- The esolang font-ligature fix wasn't visually re-checked (a screenshot run
  was blocked).
- The verification scripts could become a real `tests/` folder.

## Working with this user

- Writes short messages, sometimes ambiguous; when a request could mean two
  different things, ask with concrete options before building. The Braille AI
  modes were redone several times because of misread requests.
- Wants "cool" UIs: 3D effects, intros, animations, and everything modular.
- Prefers things to just work automatically (auto downloads, auto detection).
- Asked for changes to be reverted when they didn't fit. Keep changes scoped
  to what was asked.
