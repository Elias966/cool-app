# Module checker

```bash
npm run check -- <module id | all> [--devices desktop,phone,small,landscape,tablet,tabletLand]
                                  [--fuzz 300] [--ai] [--out <dir>] [--verbose]
```

One command that tests a module from every side, using only what the project
already has (Electron). It builds the Android web assets first, then:

1. **Static rules**: `module.json` (fields, files, accent), every CSS class
   starts with the module's prefix, entrance animations use `backwards` fill,
   and the shared phone / landscape / keyboard-open / touch media queries exist.
2. **Round trips**: if `specs/<id>.mjs` exists, each of its cases encodes and
   decodes the samples plus random text (accents, emoji, line breaks, double
   spaces…). Anything that doesn't come back exactly is a failure.
3. **The module running for real**, on each device: the desktop app
   (`electron/main.js`) and the Android build on phone and tablet sizes (touch
   and no-hover emulation, a fake native bridge that records haptics, shares
   and copies). It opens the module and waits for the intro, then checks:
   - layout: nothing sticks out sideways, and touch targets are at least 32px on touch screens;
   - use: it types into every text box and presses Enter, then clicks every button, tab and switch;
   - leaving: it leaves and comes back twice, then looks for intervals, listeners, animation loops and stylesheets the module left behind;
   - errors: it collects every console error.

Everything runs hidden in a throwaway user-data folder. The local AI is stubbed
unless `--ai` (then the models already in `~/.config/Prism/models` are used).
Screenshots (`<device>-1-open.png`, `<device>-2-used.png`), downloads and
`report.json` go to `--out` (default: `<tmp>/prism-check`). The exit code is
non-zero when anything failed.

## A spec for a new module

`specs/<id>.mjs` exports the module's own encode/decode functions as cases:

```js
import { encode, decode } from '../../../src/modules/<id>/<id>.js';

export default {
  samples: ['Hello World'],          // always tried
  fuzz: 300,                         // random texts per case (optional)
  generate: (rand) => '…',           // custom random text (optional)
  cases: {
    'text → code → text': (text, rand) => decode(encode(text)),
  },
};
```
