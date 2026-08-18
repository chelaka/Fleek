# Fleek

**A live mirror for clothes you haven't bought yet.**

Fleek turns your webcam into a fitting-room mirror. Give it a photo of a garment — dropped in, picked from disk, pasted from a browser tab, or shot with the camera — and it renders that garment onto your live reflection.

The transformation is done by **Decart Lucy 2.1 VTON** via **fal.ai**, streamed over WebRTC. It is diffusion, not an AR overlay: there is no 3D mesh and no warping, so you get real drape, real shadow, and real occlusion when you cross your arms.

Windows only. Single user, own machine, own webcam.

---

## The one thing to understand before you run it

**Your camera feed leaves your machine, and live video costs $0.02 per second.**

Fleek's whole design bends around that number:

- Sessions are explicitly started, never ambient.
- The cost meter is always visible while live and cannot be hidden.
- Every session has a hard cap (default 3 minutes, configurable 60–600s). At the cap the session closes itself and tells you what it cost.
- Billing starts at the model's first generated frame and stops the instant the peer connection closes.

Uploading garment images and testing your API key are not billed. Only live video is.

## Setup

You need a [fal.ai](https://fal.ai) account and an API key. The key is yours and is billed to you.

```bash
npm install
npm run fonts
npm run dev
```

`npm run fonts` downloads Fraunces, Inter Tight, and Geist Mono into `src/renderer/public/fonts/`. They are gitignored. If the download fails, the app still runs — it falls back to a system serif, Segoe UI, and Cascadia Mono.

On first run you'll see a consent screen (non-skippable), then a setup screen for your fal key and camera. After that Fleek opens straight into the mirror.

## Using it

1. Add a garment: `+` in the tray, then drop a file, paste from the clipboard (Ctrl+V works anywhere in the sheet), or hold a physical item up to the camera and use **Shoot it**.
2. Pick it in the tray. The active garment is ringed in amber.
3. **Start fitting.** The band of light sweeping down the glass means the model has picked up the reference.
4. Swap garments mid-session by clicking another tile — the connection stays open, so the swap is a second or two, not a restart.
5. **Capture** writes a PNG to `Pictures/Fleek/`. Click the thumbnail that flies into the corner to open it in Explorer.
6. **Stop fitting**, or let the cap stop it for you.

Photos of the garment on a person work noticeably better than flat-lays.

## Slots

A garment is filed under what it is worn as: **Cap, Glasses, Top, Jacket, Bag, Bottoms, Shoes**. You can wear one garment per slot at once — picking a second top replaces the first, picking a cap leaves the top alone. Clicking the garment you are already wearing takes it off.

fal accepts exactly one reference image, so when more than one slot is filled Fleek composites them onto a single sheet and the prompt names each panel ("the cap in the top left panel"). That means quality degrades as you stack slots: two or three items are reasonable, seven is optimistic.

**What the camera can actually see is the real limit.** A chest-up webcam sees caps, glasses, tops, jackets, and the strap of a bag. It does not see bottoms or shoes, and the intake sheet says so in red when you file something under those slots. They are there because you may angle the camera down or step back — not because the default framing supports them.

## What it does not do

It is a *look* tool, not a *fit* tool. It will not tell you your size, and claiming otherwise would be dishonest.

No storefront, no cart, no price lookup, no accounts, no cloud sync, no video recording. One person in frame.

## The web build

Fleek runs as a static web app from the same sources. The only thing that differs is which platform adapter `@/platform` picks at runtime, decided by whether the Electron preload bridge exists.

```bash
npm run dev:web       # http://localhost:5174
npm run build:web     # static SPA into dist-web/
npm run preview:web
```

### Deploying to Vercel

```bash
vercel
```

`vercel.json` sets the build command, output directory, and a `Permissions-Policy` header that allows the camera on this origin only. There is nothing else to configure — **no environment variables, and no server secret.**

### Bring your own key

The web build is bring-your-own-key by design. Each visitor pastes their own fal key, it is kept in their browser's `localStorage`, and it is sent only to fal. The deployment holds no key of its own, so there is nothing of yours for a stranger to spend.

Be honest with yourself about what that storage is: `localStorage` is readable by any script on the origin. It is the right tradeoff for a tool where the key belongs to the person typing it, and the Settings copy says so rather than implying the key is protected.

### What differs from the desktop app

| | Desktop | Web |
|---|---|---|
| API key | `safeStorage`, OS-encrypted | `localStorage`, the visitor's own |
| Garment library | JSON index + files on disk | IndexedDB |
| Settings and consent | `userData/settings.json` | `localStorage` |
| Captures | `Pictures/Fleek` | browser download |
| Camera permission help | deep-links to Windows privacy settings | points at the address-bar icon |
| Session log | `sessions.log` | none |

Everything else — the state machine, the prompt builder, the composite sheet, the WebRTC connection, the whole UI — is the same code.

### If you later want multi-user

The seam is already there. `src/renderer/src/platform/` is the only place that knows where things are stored, and fal's client takes a `tokenProvider` — so a hosted build means a server route that mints short-lived scoped JWTs from a server-side `FAL_KEY`, plus auth and a **server-enforced** second budget. The 180s cap in the renderer is advisory the moment the key stops being the user's own; anyone can open devtools and stop it firing.

## Building an installer

```bash
npm run package
```

Produces `dist/Fleek-Setup-0.1.0.exe` (NSIS, x64, per-user install).

**The installer is unsigned.** Without a code-signing certificate, Windows SmartScreen will show a "Windows protected your PC" warning on first run — click **More info**, then **Run anyway**. Budget for a certificate before distributing this beyond personal use. Auto-update is deliberately not wired up.

## Development

```bash
npm run dev         # electron-vite with HMR in the renderer
npm test            # the session state machine (22 tests)
npm run lint        # the 4px-grid and token check
npm run typecheck   # main, preload, renderer
npm run build       # lint + typecheck + test + bundle
```

`npm run build` runs the checks first, so a broken grid or a stray hex value fails the build.

### Layout

```
src/
  main/         Window lifecycle, credentials, library on disk, capture
  preload/      contextBridge — the entire renderer/machine boundary
  shared/       Types and the typed IPC contract, used by all three processes
  renderer/src/
    app/          Screens: Consent, Setup, Mirror, Settings, the store
    features/
      camera/     Device enumeration, getUserMedia, one stream at a time
      session/    The state machine, the fal connection, the meter, the wipe
      garments/   Intake, library grid, active selection
      capture/    Stills from the output stream
    ui/           Button, Field, Sheet, Toast, Meter, StatusDot
    design/       tokens.css — the only file that names a colour
```

### Two rules worth keeping

**The state machine decides what is billing.** `features/session/machine.ts` is pure and tested; nothing else in the app is allowed an opinion about whether money is moving. Any new session behaviour goes there first, with a test, before any UI is wired to it.

**Nothing uses a colour, a font, or a spacing value that isn't in `tokens.css`.** `npm run lint` enforces both: every pixel value must be a multiple of 4 (with the type scale and hairlines exempted), and colour literals are only legal in `tokens.css`. If a design needs a new value, add it there and say why.

### Swapping providers

Every line of code that knows fal exists lives in `features/session/connect.ts` and `features/session/upload.ts`. Replacing the provider means rewriting those two files and nothing else.

## Your API key

The key is encrypted at rest with `safeStorage`, which uses Windows credential storage, and is decrypted only in the main process. It is handed to the renderer over IPC at session start and lives in memory for that session.

This is not a secret from its owner: anyone signed in to this Windows account can read it back through the app. That is the correct tradeoff for a single-user desktop tool with the user's own key, and pretending otherwise would be theatre.

**Settings → Reset Fleek** clears the key, the garment library, and your consent. Stills already written to disk are left alone.

## Troubleshooting

**"Windows isn't giving Fleek access to a camera."** Settings → Privacy & security → Camera, and allow desktop apps. There's a button in the app that opens that page.

**"Another app is using the camera."** Teams, Zoom, and OBS hold the device exclusively on some drivers. Close them.

**"fal rejected the API key."** Test it in Settings. Keys are per-account and billed to that account.

**Nothing happens for several seconds after Start fitting.** Connecting is not free of latency — the top bar shows `connecting` until the model's first frame lands, and the meter does not start until it does. If nothing arrives in 20 seconds, Fleek gives up and bills nothing.

**Session totals** are appended to `sessions.log` in the app's `userData` folder, one line per live-enter and live-exit.
