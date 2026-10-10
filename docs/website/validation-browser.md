# Browser and Better Interface review

Reviewed the final production `dist/` at a local `/preview/` subpath on 2026-10-10. The pinned Better Interface workflow and all six core domains were read and applied. The browser tool backend timed out twice; local Playwright 1.64.0 with Chromium 156 and axe-core 4.13.0 provided the rendered checks instead.

## Commands and results

Run from the repository root after the production build:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/keel-browsers node test/scratch/audit.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/keel-browsers node test/scratch/audit-fixtures.mjs
PLAYWRIGHT_BROWSERS_PATH=/tmp/keel-browsers node test/scratch/audit-contrast.mjs
```

All three commands exited 0. Test tools, scripts, mock records, temporary servers and raw logs stayed in `test/scratch/` or `/tmp`; the assignment removes scratch before submission. No synthetic token data exists in the production source, export or submitted screenshots.

- **16/16 live-interface checks passed.** Island first route and visible Skip; arrow/D-pad movement; complete stall dialog and visited count; classified gate; menu/Escape; Skip navigation; filters/search; desktop leaf pause; missing-wallet recovery; launch navigation, slider, preview and permit disclosure; mechanics/contract links; phone hero arrangement; top-positioned low-player dialog; reduced motion.
- **14/14 additional outage/fixture checks passed.** Both RPC fallbacks attempted during a forced outage; unknown stats stayed `—`, with a distinct unavailable state; Retry recovered against real Ethereum. Browser-only RPC fixtures exercised cards, all three filters, search/clear, Buy route, quote/minimum, input reset, Sell units, 60-second expiry through the browser clock, verified job-link matching, active/cancelled close notice and the later of the two deadlines, closed fee split and claim connection, phone token layout, failed pool price/retry, and launch validation before wallet connection. No unhandled fixture RPC requests occurred.
- **0 axe violations across eight states:** desktop island/market/launch/mechanics; phone island/market/launch; fixture token page. Axe still marks image/gradient contrast for manual review; these are not counted as passed contrast checks.
- **No document overflow:** 1440px island/market, 390px island/market/launch, 320px market/launch/mechanics, and fixture token pages at 390px and 320px. Desktop viewport was 1440 × 1000; main phone viewport was 390 × 844; narrow flow checks used 320 × 740.
- **Final live run:** no JavaScript, console, local-resource or network failures. All three local WOFF2 faces reported `loaded`. The real empty market showed block **26,162,337**, zero launches/runs/baskets, and the launch form showed factory-paused preview. The separate recovery check reached block **26,162,339**.
- **Form validation:** malformed permit JSON opened/focused the permit field; a 130-byte UTF-8 name focused the name field; unsafe links focused the links field. Each had `aria-invalid` and a linked error. These three invalid submissions made **zero wallet connection requests**.

## Rendered evidence

The following final screenshots contain real chain data only:

- [Desktop island](desktop-island.webp), [market](desktop-market.webp), [launch](desktop-launch.webp).
- [Phone island](mobile-island.webp), [market](mobile-market.webp), [launch](mobile-launch.webp).

All six were opened and visually inspected. The complete island now fits the phone camera; the main phone hero shows its title and one CTA; market controls and the empty card begin on the first screen. The desktop forest/title and form/preview hierarchy remain legible. Fixture token screenshots were inspected in scratch only and are not delivered.

## Six-domain coverage

| Domain | Coverage and evidence |
| --- | --- |
| Accessibility | **Checked:** native controls, names, live messages, keyboard movement/dialogs, Escape, focus, form error linkage, reduced motion, and axe scans. Focus measured as 2px white with a 4px offset. Screen readers, native iOS/Android and forced-colors rendering were not exercised. |
| Layout | **Checked:** desktop, phone and 320px reflow, card/form grouping, phone trade-first order, island camera and dialog placement. Route navigation preserves `scrollY = 0`. Native browser zoom, RTL and localization were not exercised; a CSS-zoom experiment was not treated as equivalent evidence. |
| Writing | **Checked:** short action labels, contract economics, closed fee split, empty/error distinction, quoted-output expiry, recorded-only runs, close/claim wording, and the unrevealed classified gate. |
| Typography | **Checked:** loaded Syncopate 700, Manrope 400–800 and JetBrains Mono 400–600; title wrapping, token labels/numbers and body hierarchy in screenshots. Phone search and permit input fonts were measured at 16px. Non-Latin creator metadata relies on system fallbacks and was not tested. |
| Colors | **Checked:** implemented monochrome tokens and computed solid contrast pairs below. Image/gradient/translucent text combinations were visually reviewed but not exhaustively pixel-measured. |
| UI | **Checked:** 20px cards, chrome logo/forest/avatars, selected filters, unavailable/empty/loading controls, quote expiry/reset, fallback avatar, paused launch, native disclosure, motion pause and reduced motion. Animation replay at 10% speed was not performed. |

## Findings and rechecks

Current source references identify the final corrected implementation.

| Finding | Correction and recheck |
| --- | --- |
| High: closed fees initially displayed as all team. `web/src/TokenPage.tsx:337`, `web/src/HowItWorks.tsx:65`. | Corrected to 10% team, 90% creator, 0% basket after close, matching `KeelVault.accrue`. Fixture UI assertion passed. |
| High: quote timestamp units prevented the 60-second age check. `web/src/TokenPage.tsx:416`. | Milliseconds now compare directly. Browser-clock fast-forward produced “Quote expired” and “Refresh quote.” |
| Medium: phone island edge foliage was clipped. `web/src/Island.tsx:359`, `web/src/island.css:767`. | Adjusted mobile projection and fit. Final phone screenshot inspected with all edge trees inside the frame. |
| Medium: island labels were on unnamed-role generic containers. `web/src/Island.tsx:539`, `web/src/Island.tsx:1054`. | Added group roles. The two earlier axe ARIA manual-review findings disappeared. |
| Medium: phone search and permit inputs used 12–13px text. `web/src/styles.css:2496`, `web/src/styles.css:2674`. | Both now compute to 16px. No claim of physical Safari testing. |
| Medium: route focus scrolled away from the header. `web/src/App.tsx:106`. | Route focus uses `preventScroll`; intentional skip-to-content still scrolls. Navigation assertion confirmed `scrollY = 0`. |
| Medium: launch errors needed field linkage and validation before connecting. `web/src/Launch.tsx:29`, `web/src/Launch.tsx:62`. | Invalid permit/name/links now announce, mark and focus the relevant field before wallet connection. Three browser cases passed. |
| Low: the IMD pill used an emoji-capable Unicode symbol. `web/src/Market.tsx:36`. | Replaced it with monochrome SVG; inspected in final screenshots. |

## Contrast measurements

Computed browser foreground/background colors were converted to WCAG relative luminance. These solid pairs exceed 4.5:1 for ordinary text; the white focus pairs exceed 3:1.

| Pair | Colors | Ratio |
| --- | --- | --- |
| Body / page | `#ededf0` / `#050505` | 17.44:1 |
| Muted hint / launch card | `#a4a4ad` / `#0d0d0f` | 7.85:1 |
| Input text / field | `#ededf0` / `#15151a` | 15.57:1 |
| Field label / card | `#cdccd6` / `#0d0d0f` | 12.21:1 |
| White focus / card | `#ffffff` / `#0d0d0f` | 19.42:1 |
| White focus / field | `#ffffff` / `#15151a` | 18.20:1 |
| Enabled silver button, darkest declared stop | `#111115` / `#babac4` | 9.78:1 |

The silver-button value is a declared-stop lower bound for its enabled, fully opaque state. It is not a measurement of every composited gradient pixel. Gradient display text, image backgrounds, transparency, anti-aliased edges and every hover/focus composite were not exhaustively sampled. Disabled controls are not represented as passing text-contrast checks.

## Limitations and completion

An earlier live run received intermittent HTTP 403/400 responses from the public RPCs. The interface correctly separated that failure from an empty chain; the final clean run and Retry recovery succeeded. Public endpoint uptime remains external to this static site.

There were no real launched tokens in the observed chain snapshot. Token detail/trade/close/claim rendering was therefore exercised with browser-only RPC fixtures, not represented as live token evidence. No mainnet transaction was signed or sent. Production launch authorization, transaction settlement and wallet-extension/mobile-wallet compatibility were not end-to-end tested. The available injection-error and invalid-form paths were tested.

**Complete for the stated browser-review scope**, with the limits above. Build, ABI/source integrity and bundle-size results are recorded separately by the main validation report. This document records worker-side checks; it is not independent certification.
