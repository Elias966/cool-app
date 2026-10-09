# Prism

A modular desktop workspace with a live 3D background, built on Electron and
three.js and packaged as an AppImage. Every page is a **module**: a
self-contained folder the shell finds when it starts. Nothing in the shell is
tied to one feature.

It ships with eight modules: **Text to Braille**, **Text to Base64**, **Text to Dingbats**, **Ancient Scripts**,
**Esoteric Languages**, **Layered Encoding**, **Japanese Scripts** and **Cipher Pact**.

## Run the AppImage

```bash
chmod +x dist/Prism-1.0.0-x86_64.AppImage
./dist/Prism-1.0.0-x86_64.AppImage
```

The AppImage uses the static type 2 runtime (`build.toolsets.appimage: "1.0.3"`),
so it doesn't need the old `libfuse2`/`fuse2` package. It runs as-is on Ubuntu
22.04+ and on Arch, Fedora and other current distros. The system only needs the
`fusermount3` helper from FUSE 3, which desktop installs already have. On a very
minimal system without it, either install it (`sudo pacman -S fuse3` /
`sudo apt install fuse3`) or run with `--appimage-extract-and-run`.

When it runs as an AppImage, Prism registers itself for the current user
(`~/.local/share/applications/prism.desktop` plus an icon in
`~/.local/share/icons/hicolor/512x512/apps/prism.png`). This gives it its icon
in the dock/taskbar and an entry in the app menu. The entry's launch path is
updated whenever you start the AppImage from a new location. To remove it,
delete those two files.

## Develop

Node.js is installed locally in `.tools/node` (nothing is installed system-wide).

```bash
export PATH="$PWD/.tools/node/bin:$PATH"
npm start          # run the app
npm run dist       # build dist/Prism-<version>-x86_64.AppImage
```

Shortcuts: `F12` / `Ctrl+Shift+I` open DevTools, `Ctrl+R` reloads, `Esc` returns to Home.

## Project layout

```
electron/main.js        window, app:// protocol, module discovery
electron/preload.js     the small, safe API exposed as window.prism
src/index.html          the shell
src/core/app.js         router, dock, transitions, the context handed to modules
src/core/scene.js       three.js background (stars, core artifact, grid, bloom)
src/core/fx.js          reusable effects: tilt, magnetic, ripple, scramble, burst
src/core/home.js        launcher page
src/core/ai.js          ctx.ai: local text generation for modules
src/core/sound.js       ctx.sound: synthesized sound effects (Web Audio, no files)
electron/ai-host.mjs    background process that downloads and runs AI models
src/modules/<id>/       built-in modules
build/                  icon + AppImage launcher hook
```

## Writing a module

A module is a folder containing a `module.json` and an ES module entry file.
Modules are loaded from two places:

- `src/modules/` — bundled with the app
- `~/.config/Prism/modules/` — **your own modules; no rebuild needed.** Click
  the folder button in the dock to open it, drop a module folder in, then click
  reload. A user module with the same `id` as a built-in one replaces it.

**`module.json`**

```json
{
  "id": "hello",
  "name": "Hello",
  "description": "Shown on the Home card.",
  "icon": "icon.svg",
  "accent": "#ff5c8a",
  "entry": "index.js",
  "style": "style.css",
  "order": 20
}
```

`icon` can be an image file in the folder or a short text/emoji. `style` can be
one file or a list, and is removed again when the user leaves the module.

**`index.js`**

```js
export default {
  mount(root, ctx) {
    root.innerHTML = `<h1 class="hello-title">Hello</h1><button class="hello-btn">Boom</button>`;
    const btn = root.querySelector('.hello-btn');
    const offTilt = ctx.fx.tilt(btn);
    btn.onclick = (e) => {
      ctx.fx.burst(e.clientX, e.clientY);
      ctx.scene.pulse();
      ctx.toast('Hello from a module');
    };
    return () => offTilt(); // cleanup when the user leaves
  },
};
```

**The `ctx` object**

| Member | What it does |
| --- | --- |
| `ctx.meta` | the module's manifest, plus `baseUrl` and `source` |
| `ctx.scene.pulse(n)` / `warp(n)` / `setAccent(hex)` / `setFocus('home' \| 'module')` | drive the 3D background |
| `ctx.fx.tilt(el, opts)` | 3D tilt that follows the pointer; sets `--mx`/`--my` for glare effects |
| `ctx.fx.magnetic(el)`, `ctx.fx.ripple(el)` | pointer effects |
| `ctx.fx.scramble(el, text)` | decode-style text reveal (returns a promise) |
| `ctx.fx.burst(x, y, { color, count, target })` | particle sparks, optionally streaming to a point |
| `ctx.sound.play(name, { x, ... })` | a synthesized sound effect (`x` pans it to that screen position); `ctx.sound.sequence([{ at, name }])` plays a timeline and returns `{ stop() }` |

Sound comes for free with the shared effects: `burst`, `scramble`, `scene.pulse` and `scene.warp` play matching sounds (pass `silent: true` to `burst`/`scramble` to skip them), and the shell adds sounds for clicks, hovers, typing and navigation. The presets live in `src/core/sound.js`.
| `ctx.toast(message)` | notification pill |
| `ctx.storage.get/set/remove(key)` | JSON storage kept separate for each module |
| `ctx.navigate(id)` | go to another module (or `'home'`) |
| `ctx.url(path)` | resolve a file inside the module's folder |
| `ctx.ai.load(spec, { onProgress })` | download (first time) and load a Hugging Face ONNX model, e.g. `{ model: 'onnx-community/Qwen2.5-1.5B-Instruct', dtype: 'q4f16' }` |
| `ctx.ai.generate(spec, { messages, prefill }, { onToken })` | stream text from the local model; returns `{ done, cancel }` |

Prefix your CSS classes (as the braille module does with `br-`) so modules don't
clash. The shell's CSS variables (`--accent`, `--text`, `--muted`, `--glass`,
`--line`, `--ease-out`, …) are available for a consistent look.

## Text to Braille

The module translates in both directions. Use the switch in its header to pick
**Text → Braille** or **Braille → Text**. Your choice is remembered.

**Text → Braille**
- Converts using **Unified English Braille, Grade 1** (uncontracted): capital
  and capital-word indicators, numeric mode (`⠼`), the grade 1 indicator after
  numbers (`3a` → `⠼⠉⠰⠁`), decimals, and UEB punctuation.
- Each result is drawn as 3D dot cells. Indicator cells are teal and dashed, and
  hovering a cell shows its dot numbers. The copyable Unicode braille string is
  shown under the cells.
- Characters with no braille form (such as emoji) are kept unchanged and listed
  under the result.

**Braille → Text**
- Three ways to enter braille:
  - paste **Unicode braille** (`⠠⠓⠑⠇⠇⠕`)
  - type **Braille ASCII** (`,hello`)
  - chord cells on the **Perkins keypad**: tap the on-screen dots, or hold the
    physical keys **F D S** (dots 1 2 3) and **J K L** (dots 4 5 6) together and
    release. Keys are read by position, so any keyboard layout works. Use the
    *Perkins keys* button to turn this off if you want to type Braille ASCII
    letters.
- Results show each cell with its decoded letter, then the text decodes in.
- Cells that aren't Grade 1 braille (for example Grade 2 contractions such as
  `⠿` "for") are shown in amber and listed under the result.

**Braille Quest** (AI) and **Braille Anywhere** (AI)
- A small local AI writes a different random format every time. In
  **Quest**, your braille is the goal: an adventure, a heist plan, a game level
  objective, a recipe, a prophecy, a letter to Santa, a treasure map and so on.
  In **Anywhere**, it turns up where it doesn't belong: a pizza menu, a
  weather forecast, a parking ticket, an error log, a receipt and so on.
- The AI never sees your text or your braille. It only ever writes about a
  made-up word ("Glyph"), and the app swaps your braille in afterwards, so the
  AI can't translate or explain it. Each format starts with a line the app
  writes itself, so the braille always lands somewhere sensible even with a
  tiny model.
- Leave the box empty for a surprise word. **New random** rewrites a card in a
  fresh format, and **Stop** keeps whatever has been written so far.
- The model is [Qwen2.5-1.5B-Instruct](https://huggingface.co/onnx-community/Qwen2.5-1.5B-Instruct)
  (Apache-2.0, 4-bit/fp16, about 1.2 GB). It downloads automatically from
  Hugging Face the first time you open an AI mode, then runs fully offline on
  the CPU in a background process.
- **Where it's stored:** an AppImage is read-only, so the model goes in the
  app's data folder, `~/.config/Prism/models/`. To keep everything next to the
  AppImage instead (portable mode), create a folder named
  `Prism-1.0.0-x86_64.AppImage.config` beside the AppImage before starting it.
  All app data, including the model and history, then lives in that folder.

In both modes, press `Enter` or **Send** to translate and `Esc` to clear the box;
in Text → Braille mode, `Shift+Enter` adds a new line. History from both modes
is kept between sessions.

## Text to Base64

- Encodes text to Base64 (RFC 4648). Text is turned into UTF-8 bytes first, so
  any language and emoji work. It encodes only; there's no decoding.
- A live pipeline shows the first 9 bytes as you type: each byte (8 bits), the
  same bits regrouped into 6-bit groups, and the character each group becomes.
  Added zero bits and `=` padding are marked.
- A 3D ring of all 64 Base64 characters spins in the header, and the ones in
  your current output light up.
- Options: **URL-safe** (`-` and `_` instead of `+` and `/`) and **Padding**
  (`=` at the end). Both are remembered.
- Each result card shows the size change (Base64 is about 33% bigger), with
  **Copy Base64**, **Copy as data URI**, **Edit** and **Remove**. History is
  kept between sessions.

## Text to Dingbats

- Turns text into four classic symbol fonts: **Wingdings**, **Webdings**,
  **Symbol** (Greek and math) and **Zapf Dingbats**. Pick one from the deck in
  the header.
- Fonts like Wingdings just draw a picture where a letter would be ("A" is ✌).
  Most systems don't have them, so each character is swapped for the Unicode
  symbol the font draws. The result is plain text you can paste anywhere.
  **Copy original** gives you the source text, which shows the same symbols if
  you set it in the real font.
- The character maps come from the published Unicode mapping tables (the Zapf
  map follows Apple's DINGBATS.TXT). Characters a font doesn't cover are kept
  unchanged and shown dimmed.
- Live tiles flip over on hover to show the original key and its code. A
  symbol keyboard shows what every key becomes and lights up as you type;
  click its keys to type. Hovering a symbol shows its Unicode name.
- The module bundles Noto Sans Symbols, Noto Sans Symbols 2 and Noto Sans Math
  (SIL Open Font License, see `src/modules/dingbats/fonts/OFL.txt`) so every
  symbol renders the same on any machine.

## Ancient Scripts

- Carves text into six historical writing systems: **Elder Futhark** runes,
  **Egyptian hieroglyphs**, **Ogham**, **cuneiform** (the Ugaritic alphabet),
  and **Ancient Greek** and **Latin** inscriptions.
- These are letter-by-letter or sound-by-sound spellings, the way names are
  written in these scripts today, not translations into the ancient languages.
  Each script's panel explains exactly how it maps letters.
- Script details: runes get ᚦ for TH and ᛜ for NG; hieroglyphs use the
  one-sound signs Egyptologists use, with each word in a cartouche and real
  Egyptian numerals; Ogham lines start with ᚛ and end with ᚜; Ugaritic uses its
  word divider 𐎟; Greek uses Θ Φ Χ Ψ Ξ and ΓΓ for NG, Greek numerals and an
  optional boustrophedon layout; Latin uses V for U, I for J, interpuncts (·)
  and Roman numerals.
- The Rosetta panel shows your text in all six scripts at once. Hover a glyph
  to see which letter it stands for and its name (for example ᚱ raidō,
  "ride").
- Every character was checked against the Unicode database. The module bundles
  Noto Sans Runic, Ogham, Egyptian Hieroglyphs and Ugaritic, plus Noto Serif
  Display (SIL Open Font License, see `src/modules/ancient/fonts/OFL.txt`).

## Decode modes

Every module can translate both ways. Braille has Braille → Text, and the
others have a switch in their console bar:

- **Base64 → Text:** accepts standard or URL-safe Base64, missing padding,
  spaces and line breaks, and `data:` URIs. The live pipeline runs in reverse
  (characters → 6-bit groups → bytes). Binary data is shown as hex with a note.
- **Symbols → Text:** detects which of the four fonts the symbols come from
  (click a font to force it, click it again for auto-detect). Each font maps
  every symbol to exactly one key, so decoding is exact.
- **Script → Text:** reads runes, hieroglyphs, Ogham, Ugaritic, Greek and
  Latin capitals, even mixed together, including Egyptian, Greek and Roman
  numerals. Where several letters share one sign (ᚲ is C, K and Q), it uses the
  letter most common in English, so the result is how the inscription reads
  rather than always the exact original spelling. The Rosetta panel shows the
  decoded words in all six scripts.
- **Program → Text:** paste a Brainfuck, Ook!, Whitespace, Malbolge, Befunge or
  Unary program: the language is detected (click a tab to force one), the
  virtual machine runs it, and you read its output. The Whitespace and Befunge
  interpreters support their full instruction sets. Programs run for at most
  3,000,000 steps, so endless loops are caught.

## Esoteric Languages

- Compiles text into a program that prints it, in six esoteric languages:
  **Brainfuck** (with multiplication loops), **Ook!**, **Whitespace** (shown
  with · → ↵ markers; copying gives the real invisible program), **Malbolge**,
  **Befunge** and **Unary** (too long to ever store, so you get its exact
  length).
- A built-in virtual machine runs the program step by step: the Brainfuck
  tape, the Whitespace stack, Malbolge's registers in base 3, and the Befunge
  playfield and stack, with the running instruction highlighted in the code.
- Every program is checked by running it: the badge only says "verified"
  when its output matches your text. The Malbolge interpreter was checked
  against the published Malbolge "Hello, world" program.
- Malbolge limit: without jumps it can only reach 201 of the 256 byte values,
  which covers all of ASCII but not the bytes UTF-8 needs, so accents are
  dropped and other non-ASCII characters become "?" (the app says so).
