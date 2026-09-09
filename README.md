# Fleek

**A live mirror for clothes you haven't bought yet.**

Fleek turns your webcam into a fitting-room mirror. Give it a photo of a garment — dropped in, picked from disk, pasted from a browser tab, or shot with the camera — and it renders that garment onto your live reflection.

The transformation is done by **Decart Lucy VTON 3.5** (`lucy-vton-3.5`), streamed over WebRTC. It is diffusion, not an AR overlay: there is no 3D mesh and no warping, so you get real drape, real shadow, and real occlusion when you cross your arms.

There is a second, much cheaper way to look. **Photo mode** dresses a stored photo of you with **Lucy Image 2** (`lucy-image-2`) and hands back a still, for a fixed price per garment and no running clock. The mirror is for confirming one garment; photo mode is for getting down to one.

Windows only. Single user, own machine, own webcam.

---

## The one thing to understand before you run it

**Your camera feed leaves your machine, and live video costs $0.02 per second.**

Fleek's whole design bends around that number:

- Sessions are explicitly started by default, and never ambient without you saying so (see **Start and stop** below).
- The cost meter is always visible while live and cannot be hidden.
- Every session has a hard cap (default 3 minutes, configurable 60–600s). At the cap the session closes itself and tells you what it cost.
- Billing starts at the model's first generated frame and stops the instant the peer connection closes.

Uploading garment images and testing your API key are not billed. Only generation is.

**Photo mode is billed differently, and that is the point.** A still costs $0.02 per garment worn, charged once when it is generated, with the price printed on the button before you press it. A second of the mirror and a whole photograph cost the same, so browsing is the cheap way to look and the mirror is what you spend on once you have decided. Wear three garments at once and a still costs $0.06, because the model dresses one garment at a time and Fleek runs it once per garment.

## Setup

You need a [Decart](https://platform.decart.ai) account and an API key (`dct_...`). The key is yours and is billed to you.

```bash
npm install
npm run assets
npm run dev
```

`npm run assets` fetches two things, both gitignored, and neither fatal if it fails:

- **Fonts** — Fraunces, Inter Tight, and Geist Mono into `src/renderer/public/fonts/`. Without them the app falls back to a system serif, Segoe UI, and Cascadia Mono.
- **The face detector** — the MediaPipe runtime (copied out of `node_modules`) and a 230KB BlazeFace model into `src/renderer/public/vision/`. Without them presence detection reports itself unavailable and the mirror stays on Manual.

Run them separately with `npm run fonts` and `npm run models` if you only want one.

On first run you'll see a consent screen (non-skippable), then a setup screen for your Decart key and camera. After that Fleek opens straight into the mirror.

## Using it

1. Add a garment: `+` in the tray, then drop a file, paste from the clipboard (Ctrl+V works anywhere in the sheet), or hold a physical item up to the camera and use **Shoot it**.
2. Pick it in the tray. The active garment is ringed in amber.
3. **Start fitting.** The band of light sweeping down the glass means the model has picked up the reference.
4. Swap garments mid-session by clicking another tile — the connection stays open, so the swap is a second or two, not a restart.
5. **Capture** writes a PNG to `Pictures/Fleek/`. Click the thumbnail that flies into the corner to open it in Explorer.
6. **Stop fitting**, or let the cap stop it for you.

Photos of the garment on a person work noticeably better than flat-lays.

### Photo mode

Switch **Mirror / Photo** next to the primary button. The tray, the slots and the selection all behave the same; only what happens when you press the button changes.

1. Open **Photos of you** and add up to six photos of yourself, by the same four routes garments use. Full length against a plain wall generates best.
2. Pick which photo to generate onto. The choice persists between runs.
3. **Generate**. The button carries the price. Garments are applied innermost first, so a jacket goes on after the shirt.
   - **Still size** in Settings picks the output resolution: Full (720p) or Draft (480p). Unlike the old three-way quality control this is a real trade — draft is quicker and cheaper — so it defaults to Full.
4. **Save this image** writes the PNG to the same place captures go.

Photos of you are stored separately from the garment library — their own folder on desktop, their own object store in the browser — so the two can be cleared independently.

**A still can now wear everything the mirror can.** The still path used to be a try-on model that knew tops, bottoms and one-pieces and nothing else, so caps, glasses, bags and shoes were dropped from the run. `lucy-image-2` is a general image editor handed the garment as a reference image, so every slot is fair game and the apology is gone.

**Stacking garments degrades the image.** The still path dresses one garment per call, so the second garment is applied to a generated image rather than to your photo. Two is usually fine; by three the result starts to look synthetic. One garment on a good full-length photo is what the still path does best.

**The still is not a preview of the mirror.** They are different models, so drape, lighting and fit will differ. Photo mode is for narrowing the field, not for predicting what the mirror will show.

### Start and stop

The webcam runs from the moment the app opens and costs nothing — only the mirror is billed. **Start and stop** in Settings decides whether the camera noticing you is allowed to move money:

| Mode | Starts the mirror | Stops it |
| --- | --- | --- |
| **Manual** (default) | you press | you press |
| **Auto-stop** | you press | walking out of frame, after ~6s |
| **Auto** | stepping into frame, after ~1.5s | walking out of frame, after ~6s |

The two delays are deliberately not the same number. Leaving is forgiving because getting it wrong drops a session you wanted; arriving is strict because getting it wrong starts spending on an empty room. Detection is jittery by nature — it loses you when you turn your head or reach for a jacket — and the grace period is what stops that from opening and closing paid connections all minute.

**Only Auto can begin billing on its own.** A poster, a housemate walking past, or a photograph on the wall all read as a person. Auto-stop can only ever end a session, never start one, which is why it is the safe half of the feature and Manual is still the default.

Detection is a BlazeFace model running on-device through MediaPipe. It is not billed and no frame is sent anywhere — it watches the same local stream the preview already shows. The runtime is a ~12MB lazy download (~3.4MB gzipped) fetched the first time you select Auto or Auto-stop; on Manual it is never fetched at all, and the JS for it is code-split into its own chunk. It needs `wasm-unsafe-eval` in the CSP, which is why that directive is there.

One thing worth knowing: MediaPipe tries to POST usage telemetry to `odml.pa.googleapis.com` when it initialises. Fleek's `connect-src` does not list that host, so the request is refused by the browser and you will see it logged as a CSP violation. That is the CSP doing its job, not a fault — detection works regardless, and the refusal is what keeps "nothing leaves this machine" true rather than merely intended.

## Slots

A garment is filed under what it is worn as: **Cap, Glasses, Top, Jacket, Bag, Bottoms, Shoes**. You can wear one garment per slot at once — picking a second top replaces the first, picking a cap leaves the top alone. Clicking the garment you are already wearing takes it off.

Decart's realtime state holds exactly one reference image, so when more than one slot is filled Fleek composites them onto a single sheet and the prompt names each panel ("the cap in the top left panel"). That means quality degrades as you stack slots: two or three items are reasonable, seven is optimistic.

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

The web build is bring-your-own-key by design. Each visitor pastes their own Decart key, it is kept in their browser's `localStorage`, and it is sent only to Decart. Nothing else is uploaded at all: garments and photos stay in IndexedDB and are sent as bytes on the request that uses them. The deployment holds no key of its own, so there is nothing of yours for a stranger to spend.

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

The seam is already there, and the Decart move closed most of the gap. `src/renderer/src/platform/` is the only place that knows where things are stored, and every live session already runs on an ephemeral client token minted through `client.tokens.create()` — scoped to one model, to this origin, and to a `maxSessionDuration` equal to your cap. So the second budget is **already server-enforced**: a tab that dies mid-session cannot leave a meter running, which is exactly what the old renderer-side `setTimeout` could not promise.

What a hosted build still needs is auth and a server route that mints those tokens from a server-side `DECART_API_KEY`, so visitors never hold a permanent key at all. The SDK supports that directly via `createDecartClient({ proxy })`.

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
      presence/   On-device face detection, and when it may move money
      session/    The state machine, the Decart connection, the meter, the wipe
      generate/   The still path: the lucy-image-2 call, the plan, the order
      garments/   Intake, library grid, active selection
      models/     Photos of the user, which only the still path needs
      intake/     The four ways an image gets in, shared by both libraries
      capture/    Stills from the output stream
    ui/           Button, Field, Sheet, Toast, Meter, StatusDot
    design/       tokens.css — the only file that names a colour
```

### Two rules worth keeping

**The state machine decides what is billing.** `features/session/machine.ts` is pure and tested; nothing else in the app is allowed an opinion about whether money is moving. Any new session behaviour goes there first, with a test, before any UI is wired to it.

**Nothing uses a colour, a font, or a spacing value that isn't in `tokens.css`.** `npm run lint` enforces both: every pixel value must be a multiple of 4 (with the type scale and hairlines exempted), and colour literals are only legal in `tokens.css`. If a design needs a new value, add it there and say why.

### Swapping providers

Every line of code that knows Decart exists lives in `features/session/decart.ts`, `features/session/client.ts` and `features/generate/still.ts`. Replacing a provider means rewriting one of those and nothing else — the live path and the still path share no provider code, deliberately, because a WebRTC stream billed by the second and a request billed by the image have nothing useful in common.

## Your API key

The key is encrypted at rest with `safeStorage`, which uses Windows credential storage, and is decrypted only in the main process. It is handed to the renderer over IPC at session start and lives in memory for that session.

This is not a secret from its owner: anyone signed in to this Windows account can read it back through the app. That is the correct tradeoff for a single-user desktop tool with the user's own key, and pretending otherwise would be theatre.

**Settings → Reset Fleek** clears the key, the garment library, and your consent. Stills already written to disk are left alone.

## Troubleshooting

**"Windows isn't giving Fleek access to a camera."** Settings → Privacy & security → Camera, and allow desktop apps. There's a button in the app that opens that page.

**"Another app is using the camera."** Teams, Zoom, and OBS hold the device exclusively on some drivers. Close them.

**"Decart rejected the API key."** Test it in Settings. Keys are per-account and billed to that account.

**Nothing happens for several seconds after Start fitting.** Connecting is not free of latency — the top bar shows `connecting` until the model's first frame lands, and the meter does not start until it does. If nothing arrives in 20 seconds, Fleek gives up and bills nothing.

**Session totals** are appended to `sessions.log` in the app's `userData` folder, one line per live-enter and live-exit.
