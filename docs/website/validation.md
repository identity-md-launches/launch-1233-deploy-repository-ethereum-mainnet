# Keel website delivery validation

Completed locally on 2026-10-10. This is the worker's report, not independent certification. Nothing was deployed, signed or sent on chain.

## Scope and assumptions

Added a React/TypeScript/Vite static website under `web/` and the complete production export under root `dist/`. The first route is the walkable chrome island; the remaining hash routes are market, launch, mechanics and individual launched tokens. The implementation includes direct public-RPC reads, fallback/retry behavior, injected-wallet launch/trade/claim paths, live pool/basket/run/close state and responsive layouts.

The supplied Ethereum deployment and network define the single config. The exact source commit was already checked out. No backend or private credentials were introduced. A signed launch permit is pasted into the requested disclosure because no launch-gate API endpoint was supplied. Ordinary design choices followed the requested chrome/black direction and the pinned Better Interface workflow/core principles in all six domains.

The real chain was paused and empty throughout the checked snapshots. The live UI consequently shows the specified empty state. Synthetic records were used only in local test harnesses to validate future token states; no sample token data or fixture screenshots ship in the app, export or review evidence.

## Commands and actual results

| Check | Result |
| --- | --- |
| `npm install --prefix web --cache /tmp/keel-npm-cache --no-audit --no-fund` | Passed; created the frontend lockfile with pinned dependencies. npm reported esbuild's postinstall script blocked; the packaged platform binary worked for all following builds. |
| `npm run --prefix web typecheck` | Passed: `tsc --noEmit`, exit 0. |
| `npm run --prefix web build` | Passed after final source corrections: typecheck + Vite, 194 modules transformed, exit 0. |
| `forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache` | Passed on unchanged pinned Solidity source, Solidity 0.8.26. Existing contract/test lints were reported. |
| `node web/scripts/generate-abis.mjs` | Passed: all four canonical ABI hashes and all four creation-code hashes match deployment pins. Hook ABI and runtime fingerprints derived from the same build. |
| `node web/scripts/check-chain.mjs --live` | Final rerun: **12 checks passed**, exit 0. Includes decoded event aggregation, prices, run pulse, closes, holder reads, fallback and unavailable-state behavior. |
| `node web/scripts/check-wallet.mjs` | Final rerun: **13 checks passed**, exit 0. Exercises the real ethers/chain helpers against a local EIP-1193 provider; no network transaction requests, signing keys or broadcasts. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/keel-browsers node test/scratch/audit.mjs` | **16 live-interface checks passed**, exit 0. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/keel-browsers node test/scratch/audit-fixtures.mjs` | **14 outage/fixture checks passed**, exit 0; token interaction data stays in scratch. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/keel-browsers node test/scratch/audit-contrast.mjs` | Passed; measured computed solid text/focus pairs and phone field sizes. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/keel-browsers node test/scratch/island-validation.mjs` | Passed at 320×568, 360×640, 390×844 and 1440×1000, including all five visits, HQ entry, keyboard/D-pad, classified message, pause and Escape. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/keel-browsers node test/scratch/final-how-check.mjs` | Passed after the final mechanics-copy correction: rendered wording, 390px reflow and no page errors. |
| Static-export URL inspection | Passed: every HTML and CSS asset URL is relative and resolves to a local file in `dist/`. Browser also served the real export from nested `/preview/`. |
| Protected-path diff and submodule inspection | Passed: no modifications to `src/`, existing build/dependency files, `lib/`, `.github/` or ignore files; no Git submodules. No `.env` files were created or changed. |

The final build emitted one advisory: its minified JS chunk is 568.26 kB (184.45 kB gzip), above Vite's 500 kB advisory threshold. It is not a build failure. CSS is 55.43 kB (12.44 kB gzip). The complete export is **13 files / 757,456 bytes**, including local fonts, SVGs and notices. No source maps or dependency/cache directories are in the export.

The final independent chain read reached block **26162346**, with chain ID 1, `paused = true`, zero launches/runs/basket IMD, and `runPrice = 0.5 IMD`. Runtime bytecode and wiring verification passed for all five deployed Keel contracts. The data is observed, not hard-coded. Full ABI/wallet detail is in `web/chain-verification.md`.

## Better Interface coverage

[The full browser review](validation-browser.md) records exact source references, rendered evidence and measurements. All six domains were applied during construction, reviewed and rechecked:

| Domain | Coverage |
| --- | --- |
| Accessibility | Native controls, meaningful names, visible focus, keyboard/touch-equivalent paths, nonmodal dialog focus return, error association, reduced motion; eight axe states had **zero violations**. |
| Layout | Shared grids and spacing, 320px reflow, single-column phone layouts, mobile trade priority, whole-island fit and responsive dialog placement. |
| Writing | Short action/recovery text, exact empty state, genuine unavailable states, contract-grounded fees/repayment/close/claim wording, sealed classified message. |
| Typography | Locally loaded required font families, numeric stability, wrapping, hierarchy; phone text-entry controls measured at 16px. |
| Colors | Requested monochrome palette, status text in addition to visual cues, measured solid text/focus contrast; composite gradient/image limitations recorded. |
| UI | Cards, chrome logo/avatars/forest, pressed/selected/disabled/loading/empty states, permit disclosure, quote review/reset/expiry, motion pause and reduced-motion variant. |

## Findings repaired

The main browser report describes eight findings and their individual rechecks: post-close fee allocation, quote timestamp units, clipped phone foliage, missing group roles, undersized phone fields, route scroll/focus behavior, linked form validation and an emoji-capable decorative symbol. Two transaction-layer findings were also repaired:

- **Medium — actionable contract errors:** `web/src/App.tsx`, `errorMessage`, now uses decoded reasons and recovery text for invalid signatures, slippage, expired deadlines and related errors. Wallet integration tests execute the real formatter and verify the corrected paths.
- **High — verification cache invalidation:** `web/src/chain/index.ts`, `verifyDeployment`, now clears a previous successful cache after a failed recheck. A dedicated mock test confirms that a subsequent write cannot reach wallet access until verification succeeds.

The active implementation was rebuilt after the final source changes. Final real-data screenshots were inspected after the behavioral corrections. The last change only refined the mechanics supply wording to avoid implying rounding dust enters the pool; that page was rebuilt and directly rechecked afterward. The six pictured routes/states were unchanged. Documentation describes those files, not an earlier draft.

## Evidence and packaging

[Desktop island](desktop-island.webp), [market](desktop-market.webp), [launch](desktop-launch.webp), [phone island](mobile-island.webp), [market](mobile-market.webp), and [launch](mobile-launch.webp) show only the real paused/empty deployment. Fixture token layouts were inspected in scratch and are not submitted.

The repository's pre-existing `.git/info/exclude` excludes `artifacts/`. Therefore this review, the browser review and six screenshots are retained under `docs/website/` for Git submission, with delivery copies also under `artifacts/`. No exclusion or ignore file was edited. Temporary browser outputs, dependency directories and package caches are removed or confined to disposable scratch/outside-repository paths.

The final path/byte audit is recorded in `docs/website/submission-audit.json`. It includes both the tracked project and new deliverables, excludes the supplied inputs, `.git/`, ephemeral artifacts and scratch, and requires the conservative uncompressed file sum to fit below **8,388,608 bytes**. The runtime export, source, frontend manifest/lockfile, fonts, art, licenses and documentation are retained.

## Limits

- No live launch, approval, swap or claim was attempted. There were no real launched tokens, no funded signing wallet and no valid permit for a new launch. Mainnet settlement and wallet-extension/mobile-wallet rendering are not claimed as tested. Local mocks exercised argument encoding, exact approvals, preflight, rejects, expired deadlines, receipts and claims.
- Run events expose a one-way hash of a job UUID. The UI verifies a visitor-supplied original UUID before linking its actual IMD job page; arbitrary run links cannot be recovered automatically from these contracts. This is documented instead of fabricating explorer routes.
- Public RPCs returned intermittent HTTP 403/400 responses during one earlier run. The UI preserved unknown values, exposed retry, and recovered. Final live browser validation had no network failures. Future endpoint uptime, CORS policy and historical-log limits remain external dependencies.
- Screen-reader sessions, physical phones, browser-native 200% zoom, forced-colors rendering, RTL/localization and slowed animation replay were not performed. No full accessibility-compliance claim is made. Image/gradient/transparency contrast was visually reviewed but not exhaustively pixel-measured.
- User-hosted token images and links may become unavailable; the chrome first-letter fallback remains usable. The site's own runtime assets are local.
- No IPFS CID was published and no ENS record changed. Publishing instructions are in the root README.

**Complete for the stated website implementation and local-validation scope**, with these explicit limits. The verifier's path/byte checks do not certify browser behavior or contract safety.
