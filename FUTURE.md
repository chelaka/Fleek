# Future

Things noticed while building v1 that are deliberately not in v1. Nothing here is a commitment.

## Cost shape

**A static try-on path.** The per-second price makes browsing unappealing; live is the right tool for *confirming* a garment, not for flipping through twelve of them. A cheap still-image try-on for browsing, with the live mirror reserved as the last step, would change the economics of casual use. This is the single biggest thing v1 leaves on the table.

**Session budgets rather than session caps.** The cap is per-session. A daily or monthly ceiling would be a different, and probably better, safety rail.

## Garments

**Reference-photo quality hints.** Flat-lays measurably underperform on-model shots, and v1 only says so in a line of copy. Detecting which one was dropped in — and saying "this one will probably come out muddy" before a dollar is spent — is worth doing.

**Background removal on intake.** Product photos with busy backgrounds appear to confuse the reference. Worth measuring before building.

**Garment naming and search.** The tray is fine at twenty garments and would not be at two hundred.

## Mirror

**Bottoms and full outfits.** Blocked by framing, not by the model. It needs a full-length camera position, which is a different product posture — a phone on a tripod, not a webcam at a desk.

**Side-by-side compare.** Two stills next to each other, or a before/after wipe against the raw feed. Cheap to build, and the obvious thing to want after capturing two stills.

**Multiple people in frame.** Explicitly out of scope in v1 and unverified against the model.

## Web

**Multi-user hosting.** The web build is bring-your-own-key. Hosting it with the operator's key needs, in this order: a `/api/fal/token` route minting short-lived scoped JWTs from a server-side `FAL_KEY`; auth; and a server-side seconds budget per user. The client-side cap cannot be trusted once the key is not the user's own.

**Garment originals are not kept on the web.** IndexedDB stores metadata and the tray thumbnail; the full image lives only at fal's `remoteUrl`, which is what the composite fetches back. If fal ever expires those URLs, web libraries go stale in a way desktop ones do not.

## Craft

**A `degraded` recovery that is smarter than a re-offer.** Right now an ICE restart re-offers once and fails hard after that. A bounded retry with backoff would survive a flaky café connection.

**The swap has no acknowledgement.** The model does not announce that it picked up a new reference, so `swapping` settles back to `live` on a 480ms timer that matches the wipe. If the endpoint ever emits a per-reference event, key the transition off that instead.

**Fraunces' SOFT and WONK axes.** The Google Fonts variable build exposes `opsz` and `wght`; the other two axes in the design spec are set in `tokens.css` and silently ignored unless the full upstream build is vendored.

**Latency measurement.** The NFR is under 4s from button press to `generation_started`. There is a first-frame timeout but no instrumentation of the typical case.
