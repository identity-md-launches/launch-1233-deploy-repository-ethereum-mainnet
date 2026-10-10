# Keel

Ethereum mainnet launchpad contracts and a static Keel website. Each project has a permanently locked TOKEN/IMD Uniswap v4 position. A 1% IMD swap fee funds the team, creator and continued IMD work. The website reads Ethereum directly and uses the visitor’s chosen installed wallet for transactions. This website task did not change or deploy any contract.

## Website

The ready-to-publish site is in **[dist/](dist/)**. React/TypeScript source, its package manifest, lockfile and Vite configuration live under **[web/](web/)**. The existing Solidity configuration and `src/` are unchanged. The initial route is a walkable island; Skip opens the market. Direct links use hash routes: `#/market`, `#/launch`, `#/how` and `#/token/<launched-token-address>`.

### Install, preview and rebuild

Use Node **22.12 or newer** and npm. This delivery was built with **Node 24.21.0** and **npm 11.19.0**. From the repository root:

```sh
npm --prefix web ci
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run preview
```

Preview opens at `http://localhost:4173/`. For development, run `npm --prefix web run dev`. To serve the committed export without installing dependencies:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

`build` runs `tsc --noEmit`, then Vite, replacing root `dist/`. Rebuild after source changes and include the entire export in the submission alongside `web/package.json` and `web/package-lock.json`. `base: './'`, relative asset references and hash navigation support IPFS gateway subpaths without rewrite rules. All site art, font files and font licenses are bundled locally. There are no environment variables, keys, bundled backend services or runtime package downloads.

Keep generated dependencies outside the submission. No ignore file was changed. After local checks, remove `web/node_modules` before collecting changed files; `npm ci` restores it. Do not include caches, browser binaries, temporary verification artifacts or npm archives. Browser/Foundry scaffolding in `test/scratch/` is disposable.

### Publish on IPFS

Publish the **contents represented by the root `dist/` directory**, not the source tree. With a running Kubo node:

```sh
ipfs add -r --cid-version=1 dist
```

Use the resulting directory CID, pin it with your node or pinning service, and open its gateway path ending in `/ipfs/<directory-CID>/`. Keep the trailing slash. An ENS name can point its contenthash to that same CID. Upload `index.html`, `assets/`, the SVGs, `fonts/` and notices together. The publisher serves this export; it does not need to rebuild it. This task produced and locally served the export; it did not publish a CID or change an ENS record.

### Chain and wallet behavior

[web/src/config.ts](web/src/config.ts) is the single frontend address/network configuration. It pins Ethereum chain 1, deployment block 26162060, both public RPC endpoints, the launch contracts, IMD, PoolManager and StateView. Reads retry the other endpoint with bounded timeouts. Launch/run/accounting event scans begin at the deployment block, use adaptive block windows and rewind 12 blocks on refresh. A loaded market uses one block for events, balances and pool state. Failed reads show an unavailable state, never fabricated zeros. Refresh runs every minute and is also available manually.

The market is populated exclusively from `Launched`; builds from `RunVerified`; baskets and close terms from the vault; spot prices from the canonical pool's `sqrtPriceX96`. FDV uses actual total supply. Hook fees awaiting distribution are shown separately. Quotes use KeelRouter and exact integer units. UI price/FDV figures are spot estimates, distinct from transaction quotes.

Connect opens an EIP-6963 chooser with each installed wallet’s name and icon; `window.ethereum` is used only when none announce. The last choice is remembered, and Disconnect clears the connection without forgetting that preference. A phone without an injected wallet gets the wallet-browser instruction and a Copy link action. Account reads, subscriptions and all writes use the chosen provider.

Before wallet writes, the client verifies deployed runtime bytecode and immutable wiring against the pinned source. Wallets must be on Ethereum mainnet. Buy/sell use IMD and KeelRouter; approvals cover only the exact input when existing allowance is insufficient. The UI disables an amount above the wallet balance, and the write helper rechecks the balance before approval. The review shows an editable minimum output and absolute deadline. Quotes become stale after 60 seconds. Launches, approvals, swaps and claims are simulated before wallet submission and report receipt status.

The island uses the same block snapshot as the market: verified-run count and last-run time; launches minus `Closed` for live pools; `FeeAccrued` totals and their emitted historical split; remaining baskets and `Reimbursed` totals; and the factory’s pause state. Pool IMD sums locked position principal plus its uncollected IMD fee growth at that block, including closed projects whose pools remain locked. This excludes protocol fees, hook fees and any PoolManager-wide balance; per-position rounding dust is not assigned to a project. Runs, pools, fees and repayments retain integer precision until display. A pool read failure is unavailable, never zero. Each stall opens with its figures before the existing guide text.

Creator wallets have a Claim action for accrued creator IMD and a strict decrease-only share control. Both simulate through the vault before submission. FDV is spot price × actual total supply. A card’s Buy link scrolls to the trade card and focuses its amount field. Close-notice copy explains both snapshots and warns buyers that new purchases do not add basket rights.

When `factory.paused()` is true, the launch form remains an editable preview and its launch button is disabled. A signed response can be pasted into **Launch permit** (`projectRef`, `startTick`, `deadline`, `signature`). No launch-gate endpoint was supplied, so no API endpoint or permit is invented. The UI validates the response and contract field limits before asking for a wallet.

The launch form has separate optional Website, X and Telegram links. All require HTTPS, X allows x.com/twitter.com, and Telegram allows t.me. Metadata contains only the filled `links` object keys and remains limited to 1,024 UTF-8 bytes.

Image picking and drag-and-drop accept PNG/JPG/WEBP/GIF up to 2 MiB, center-crop to 512×512 and encode WEBP locally. GIFs become still images. Both previews update before upload; Replace and Remove are available. `config.uploadUrl` is intentionally empty: no server is assumed. When configured, launching sends `POST` multipart field `file`, expects `{ "cid": "<IPFS CID>" }`, stores `ipfs://<cid>`, and rechecks metadata size after upload. A selected file cannot launch while the endpoint is empty. HTTPS/IPFS image links remain a secondary option. `config.ipfsGateway` defaults to `https://ipfs.io/ipfs/`; cards, token pages and previews use it with the chrome-letter fallback on failure. Configure the upload endpoint and its CORS policy before enabling uploads.

`RunVerified` contains a **hash of the job UUID**, not the UUID itself. The run feed links the verification transaction and offers an original-job-ID input. It verifies the supplied UUID against the emitted hash before exposing the real `explorer.imd.fun/jobs/<uuid>` link. Arbitrary hashes cannot automatically resolve without additional published data. No nonexistent `/jobs/<hash>` links are fabricated.

### Validation and source pins

Use `node web/scripts/check-chain.mjs` for deterministic chain/metadata checks and add `--live` for read-only RPC/code verification. Wallet simulation checks also need the existing contract build outputs:

```sh
forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache
node web/scripts/generate-abis.mjs
node web/scripts/check-wallet.mjs
```

The ABI generator checks canonical Keccak hashes and creation-code hashes against the deployment pins. The committed ABIs and immutable-masked fingerprints are sufficient for a normal frontend build. No dependency or Solidity configuration changes are needed.

The current delivery's actual checks and six-domain Better Interface review are recorded below. See [DESIGN.md](DESIGN.md) for implemented design tokens and components. Font origins/licenses are in [web/public/fonts/](web/public/fonts/); runtime notices are in [web/public/THIRD_PARTY_LICENSES.txt](web/public/THIRD_PARTY_LICENSES.txt).

### Delivery checks and interface review

Checked on 2026-10-10 using Node 24.21.0, npm 11.19.0, Vite 7.1.7 and the provided Firefox browser runtime. This is a worker-side check record, not an independent audit. No on-chain transactions were sent.

| Check | Actual result |
| --- | --- |
| `npm --prefix web ci --cache /tmp/keel-npm-cache --no-audit --no-fund` | Passed; existing manifest and lockfile preserved. |
| `npm --prefix web run typecheck` | Passed after final source changes. |
| `npm --prefix web run build` | Passed; rebuilt root `dist/` with relative asset URLs. Vite reports one 588.27 kB JS chunk (190.74 kB gzip), above its advisory 500 kB threshold. |
| `forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache` | Passed; existing Solidity/lint warnings, no Solidity or build-configuration edits. Used solely to derive/compare ABIs and exercise wallet mocks. |
| `node web/scripts/generate-abis.mjs` | All four pinned ABI and creation-code hashes match. KeelHook is derived from the pinned factory source, with its runtime fingerprint checked separately. Committed ABI files were unchanged. |
| `node web/scripts/check-chain.mjs --live` | 14 checks passed: amount/metadata bounds, social links, exact pool math, HTTP-400 range recovery, RPC fallback/failure, wallet fallback, live code/wiring, accounting/event decoding and refresh deduplication. At block 26,162,910 the factory was paused; launches, runs, pools, accrued fees, repayments and basket balances were all zero; run price was 0.5 IMD. |
| `node web/scripts/check-wallet.mjs` | 17 checks passed with local EIP-1193 mocks: exact approvals, balance rejection, router/launch/claim simulation, receipt failures, both creator actions, strict share decrease, and chosen-provider isolation. No real wallet, key or broadcast. |
| `/opt/imd-mcp/python/bin/python test/scratch/check-browser.py` | 72 interaction assertions passed against the production export at a nested `/dist/` URL. Main pages checked at 390×844 and 1440×1000, plus island reflow at 320/700/1000px. No page JavaScript errors or failed live resource requests were recorded. |
| `/opt/imd-mcp/python/bin/python test/scratch/check-extra.py` | 19 additional assertions passed: image crop/format/size/upload behavior, drop/replace, 320px page reflow and input sizes, modal focus trapping/return, motion pause and measured solid text contrast. |

Browser scripts and their fixtures lived only in disposable `test/scratch/`; they are not runtime code or submitted assets. The export was served locally with `python3 -m http.server 4173 --bind 0.0.0.0`. The supplied browser tool also opened and inspected the production island. The live mainnet state has no launched token, so live token routes correctly showed “Token not found”; populated token, quote, wallet and creator states were exercised through isolated, ABI-encoded responses. No fixture token or synthetic numbers are bundled or included in the retained screenshots. The runtime's request-interception API failed internally; the isolated tests replaced `fetch` before app startup instead, without changing production source.

Retained screenshots of real mainnet/empty states: [mobile island](docs/website/mobile-island.webp), [desktop island](docs/website/desktop-island.webp), [mobile market](docs/website/mobile-market.webp), [desktop market](docs/website/desktop-market.webp), [mobile launch](docs/website/mobile-launch.webp), [desktop launch](docs/website/desktop-launch.webp), [mobile token unavailable](docs/website/mobile-token-unavailable.webp), [desktop token unavailable](docs/website/desktop-token-unavailable.webp). These files were opened for visual review, alongside disposable screenshots of populated token/creator/image states.

The pinned Better Interface workflow and core principles of all six domains were applied during implementation, followed by one consolidated review:

| Domain | Coverage and outcome |
| --- | --- |
| Accessibility — Checked | Native controls and modal dialog, wallet focus trap/Escape/return, D-pad focus recovery, Enter/Space/A, named file and link fields, inline validation, 44px stall/robot targets and visible focus. Screen-reader and physical-device sessions were not performed. |
| Layout — Checked | Island, market, launch and token routes at both required widths; 320px reflow; phone scene enlargement, edge trees, unobscured robots/player, visible proximity prompt, stacked form/trade layouts, creator-card spacing and no horizontal overflow. Native 200% zoom was not tested. |
| Writing — Checked | Real-zero/loading/unavailable distinctions, direct Retry and Disconnect actions, HTTPS/domain hints, image availability/error copy, irreversible-share note, FDV labels and exact requested close-notice wording. All changed text is English. |
| Typography — Checked | Existing Syncopate/Manrope/JetBrains Mono preserved and loaded; numeric data remains monospaced; long fields and labels wrap; phone text inputs measure at least 16px. Chrome signs retain compact 11px titles/10px figures in the game’s existing visual language. |
| Colors — Checked, limited | Existing monochrome tokens retained. Browser-computed solid pairs measured: `#a4a4ad` on `#050505` 8.24:1; `#a4a4ad` on `#0d0d0f` 7.85:1; input `#ededf0` on `#15151a` 15.57:1. All exceed 4.5:1. Gradient/image-backed text and every hover/focus adjacency were not exhaustively measured. |
| UI — Checked | Chrome signs and press/hover/nearby states, native wallet modal, shared social icons, file preview/replace/remove/drop/error states, trading/creator disabled and pending states, RPC retry, image fallback and ambient-motion pause. Reduced-motion CSS was inspected; browser emulation failed with `Page.setEmulatedMedia: imposti is not defined`. Slow-motion replay was not performed. |

Findings fixed and rechecked in the final source/export:

| Severity | Source | Finding, correction and evidence |
| --- | --- | --- |
| High | `web/src/Island.tsx:359`, `web/src/Island.tsx:1173` | Enter reactivated a focused D-pad button. Pointer presses now release focus to the scene and scene keys talk/advance. D-pad→Enter, Space and A passed at both required widths. Header/menu controls retain normal keyboard activation. |
| High | `web/src/island.css:974`, `web/src/island.css:1076` | Small mobile stalls and foreground trees obscured interaction; short-screen rules hid the prompt. Enlarged projection, back/side trees, actors above trees and 44px hit areas passed rendered/geometry checks. |
| High | `web/src/chain/index.ts:174`, `web/src/Island.tsx:193` | Island stops had no market-backed figures. One block snapshot now supplies events, pool state and pause status, with explicit loading/error/Retry states. Encoded accounting and live-zero checks passed. |
| High | `web/src/chain/wallet.ts:84`, `web/src/WalletChooser.tsx:14` | The global injected provider prevented reliable multi-wallet choice. Discovery, remembered choice, disconnect, scoped listeners and chosen-provider writes passed two-wallet browser and write-helper tests. |
| High | `web/src/TokenPage.tsx:464`, `web/src/chain/index.ts:483` | Approval could be requested despite insufficient balance. UI and a fresh pre-approval read now reject it. Buy and sell tests confirm no approval is sent. |
| Medium | `web/src/Launch.tsx:76`, `web/src/ImagePicker.tsx:6` | A generic link list and image URL lacked requested validation/upload behavior. Typed social fields and square WEBP preparation/upload now keep the 1,024-byte guard, reject invalid domains/files and show immediate previews. Browser and metadata checks passed. |
| Medium | `web/src/TokenPage.tsx:437`, `web/src/TokenPage.tsx:551`, `web/src/HowItWorks.tsx:100` | Buy links did not focus trading; claim wording overstated the effect of selling. Scroll/focus and the requested snapshot/buyer notices were verified. |
| Medium | `web/src/TokenPage.tsx:722`, `web/src/chain/index.ts:549` | Missing creator controls. Creator-only rendering, accrued Claim and irreversible strict share decrease were tested, including simulation before each send. |
| Medium | `web/src/chain/rpc.ts:42` | An RPC HTTP-400 log-range response lost its recovery message. JSON error details now reach adaptive scanning; the HTTP-400 regression and live reads passed. |
| Low | `web/src/island.css:974`, `web/src/styles.css:3201` | Render review found an inherited selector hiding the HQ title and adjacent trade/creator cards touching. Removed the selector and added 24px creator-card separation; screenshots were rechecked. |

Submission cleanup removed generated dependencies and browser caches without changing any ignore file. The complete standalone snapshot measured approximately **2.59 MB as a Git bundle** and **5.60 MB as raw files**, below the 8,388,608-byte limit. `dist/` contains 783,721 bytes of complete runtime assets. The source, unchanged frontend manifest/lockfile, fonts and notices remain present.

Complete for the stated implementation and local-check scope. Upload-server CORS/persistence and genuine installed-wallet/mainnet confirmations remain untested because the endpoint is intentionally empty and this task authorizes no on-chain changes. Browser emulation does not establish iOS/Safari behavior, native zoom, screen-reader compatibility or full accessibility compliance. Dark mode is the existing sole theme; alternate themes/RTL/localization are not applicable to this English-only assignment.

## Contract build and test

```sh
forge build
forge test
forge fmt --check
```

`foundry.toml` pins Solidity **0.8.26**, the Cancun EVM, the optimizer and IR compilation. All Solidity dependencies are ordinary files in `lib/`; no submodules, package install, RPC, environment variables, FFI or filesystem permissions are needed to build or test. Foundry and the pinned compiler must be installed by the runner. See [dependency provenance](docs/dependencies.json) for exact commits and the vendored license files for their terms.

Tests execute the real vendored v4 `PoolManager`, including its flash accounting, hook return deltas and ERC-6909 claims. A test-only IMD ERC-20 replaces the mainnet token at its fixed address. `deployCodeTo` executes constructors at the target addresses, preserving PoolManager's immutable no-delegatecall address. No fork is required. Live IMD behavior beyond the standard ERC-20 model is an external integration assumption.

## Contracts

| Contract | Responsibility |
| --- | --- |
| `KeelToken` | Fixed supply of `1e27` raw units (1 billion tokens, 18 decimals), EIP-1167 clone initialization and `Trace208` balance checkpoints. No further mint, public burn, tax, privileged transfer or upgrade. The implementation itself cannot initialize. |
| `KeelVault` | Per-project IMD accounting, verification payments, creator status/share, close notices and historical holder claims. |
| `KeelHook` | Only-factory pool initialization/liquidity addition, 1% swap fees and permissionless distribution. Deployed by the factory constructor. |
| `KeelFactory` | EIP-712 launch authorization, canonical job IDs, token cloning, pool creation and permanent liquidity locking. Starts paused. |
| `KeelRouter` | Exact-input routes between native ETH, IMD and launched tokens; deadlines, minimum outputs and read-only execution quotes. |

The vault, factory and router each receive the supplied `$owner` and use OpenZeppelin 5 `Ownable2Step`. Ownership changes require `transferOwnership(newOwner)` followed by `acceptOwnership()` from the proposed owner. Their ownership is separate: transfer each contract individually. Inherited `renounceOwnership()` permanently gives up that contract's administrative powers; renouncing the vault also makes future team withdrawals unavailable.

## Deployment parameters

Only constructor deployments belong to deployment. Deploy in this order, supplying actual addresses/references:

| Solidity contract | Constructor arguments |
| --- | --- |
| `KeelToken` | None |
| `KeelVault` | `$owner` |
| `KeelFactory` | `$owner`, `$KeelVault`, `$KeelToken`, `hookSaltStart` (`uint256`) |
| `KeelRouter` | `$owner`, `$KeelFactory` |

The factory deploys the hook through CREATE2 in its constructor. Do not deploy a separate hook. Constructors do not call existing contracts or require mainnet code to be present. An empty-chain deployment test covers this constraint. No linked external libraries are needed.

`hookSaltStart` is a public search offset, not an identity, secret or service configuration. Starting at **0** is supported. The on-chain search increments the salt until all 14 hook permission bits match exactly `0x28cc`. It reuses one 85-byte CREATE2 buffer and does no allocation or code lookup per candidate. The expected length is 16,384 candidates; the actual length and deployment gas depend on the factory address, vault address, compiler output and offset. The factory exposes `hookSalt` and `hookSaltAttempts`, and emits `HookDeployed`. The candidate count is geometric with probability `2^-14` per candidate and depends on the factory's own address: about 6% of addresses need more than 50,000 candidates, and a few need more than 150,000 (roughly 118 gas per candidate on top of about 4.6 million gas of fixed cost). Simulate the exact constructor, with the exact salt and factory address the deployment will use, and set the transaction gas ceiling from the observed candidate count rather than from the test measurement below. `hookSaltStart` is a constructor argument, so changing it changes the factory's init code and therefore its CREATE2 address: it re-rolls the search from a new factory address, it does not resume the previous search. The constructor still performs the search itself. [Validation notes](docs/VALIDATION.md) record measurements from the tests.

The fixed mainnet addresses from the assignment are:

- PoolManager: `0x000000000004444c5dc75cB358380D2e3dE08A90`
- IMD: `0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7`
- Excluded dust/burn recipient: `0x000000000000000000000000000000000000dEaD`

IMD units use 18 decimals. Read-only mainnet calls during development returned `symbol() = "IMD"` and `decimals() = 18`; PoolManager had code (RPC head observed at block 26,158,416). These checks are not part of the offline test suite. Deploy only on Ethereum mainnet, and recheck contract identity and token transfer behavior before enabling launches.

## After launch

These are post-deployment owner transactions. No requester-owned signer, verifier or market is guessed or embedded in the constructors.

| Setter / operation | What the owner supplies and where it comes from |
| --- | --- |
| `vault.wire(factory)` | The deployed KeelFactory address from the deployment record. One use only; validates `factory.vault()`, takes `factory.hook()`, and checks the hook's factory/vault references. No registration is possible beforehand. |
| `factory.setSigner(signer)` | The IMD launch authorization operator's EOA or EIP-1271 signer contract, obtained from that operator. `revokeSigner()` disables authorization until replaced. |
| `factory.setStartTickBounds(minimum, maximum)` | Reviewed economic bounds selected by the owner. Ticks express IMD per TOKEN in v4's sorted currency order; both currencies use 18 decimals. Bounds must permit a nonempty range above the start tick. Extremely large implied liquidity is rejected by v4's per-tick capacity check. |
| `vault.setVerifier(verifier)` | The trusted swarm verification service address, obtained from that service. It may be revoked with `revokeVerifier()`. Payment and run recording revert while unset. |
| `vault.setRunPrice(price)` | Optional adjustment to the default **0.5 IMD**; allowed range is **0.1–2 IMD** inclusive. Amounts are raw 18-decimal units. |
| `router.setEthPool(fee, tickSpacing)` | The parameters of an existing, liquid, **hookless native ETH/IMD** pool verified with its liquidity provider. Defaults are fee `10000` (1% in v4 pips) and spacing `200`, but ETH routing remains disabled until the owner selects an initialized pool. The router neither creates nor funds it. |
| `factory.setPaused(false)` | Enable launches after all required setup and operational checks. `setPaused(true)` stops new launches; existing token trading and vault claims continue. |

ETH uses v4's canonical `address(0)` native-currency representation. It is not WETH. The router supports hookless ETH pools so its view quotes can reproduce execution; arbitrary third-party swap hooks and dynamic LP fees are not supported. The owner can change the fee/spacing to another existing hookless ETH/IMD pool. Minimum output and deadline protect each submitted swap against changed market conditions.

## Launch authorization and liquidity

Call:

```text
launch(name, symbol, jobRef, projectRef, creatorBps, startTick, deadline, signature, metadata)
```

The caller is the creator and must match the signed creator. `jobRef` and `projectRef` must each be 36-byte lowercase hexadecimal UUID strings with hyphens at positions 8, 13, 18 and 23. The signer must check that they identify real IMD records; syntax checking does not establish their existence. One token may ever be launched per job hash. A creator may have only one Building token; closing it permits another launch with a new job ID.

EIP-712 domain: name `KeelFactory`, version `1`, current chain ID, and the deployed factory address. The exact primary type is:

```text
Launch(address creator,bytes32 jobRef,bytes32 projectRef,bytes32 nameHash,bytes32 symbolHash,int24 startTick,uint256 deadline)
```

`jobRef`, `projectRef`, `nameHash` and `symbolHash` in this typed message are Keccak-256 hashes of the UTF-8 strings supplied to `launch`. `launchDigest(...)` exposes the digest for integration. The one-time job registry provides replay protection. Changing creator, job, project, name, symbol, tick, deadline, chain or factory invalidates the signature. The permit intentionally does not bind `creatorBps` or metadata, matching the requested signed fields; the authenticated creator chooses those at submission.

Names are 1–128 bytes, symbols 1–32 bytes. Metadata is a JSON object of at most 1,024 bytes with nonempty string fields `description` and `image`, plus `links` (an object of string URLs or an array of string URLs). Extra JSON fields are allowed, with bounded nesting. Duplicate required keys and malformed JSON are rejected. Required key names must be literal unescaped strings. Metadata is emitted only in `Launched`, with no storage copy. URLs are untrusted creator text; future clients must escape content and apply their own URL/display policy.

Clones use CREATE2 salts derived from the launch job hash until the address sorts **below IMD**. Thus TOKEN is always currency0. The v4 pool has LP fee zero, spacing 200, and the deployed Keel hook. Initial price is `TickMath.getSqrtPriceAtTick(startTick)`. The position starts at the first usable tick **strictly above** `startTick`, including when `startTick` is already aligned, and ends at tick `887200`. The whole supply is offered as token0-only liquidity; unused integer-rounding dust goes to the excluded dead address. No IMD is required from the creator to launch. The position is owned by the factory, and no factory function can remove, transfer, modify or collect it after launch. Other addresses cannot add liquidity to these pools. Donations and any position fees also remain locked.

## Fees and solvency

The Keel fee applies to the canonical hooked TOKEN/IMD pool only. The PoolManager is permissionless and launched tokens have no transfer restriction, so anyone may open a second TOKEN/IMD pool without the Keel hook and trade there; such swaps pay no fee to the team, creator or basket. The fee is a property of the Keel pool, not of the token. The Keel fee is 1% of the gross IMD side of a swap, collected in IMD in both directions:

| Swap mode | Hook accounting |
| --- | --- |
| Exact-input IMD → TOKEN | `floor(input / 100)` in `beforeSwap`; the remaining input reaches the pool. |
| Exact-input TOKEN → IMD | `floor(gross IMD output / 100)` in `afterSwap`; the recipient receives the remainder. |
| Exact-output TOKEN → IMD | The requested net IMD output is grossed up by `ceil(output / 99)` in `beforeSwap`. |
| Exact-output IMD → TOKEN | The pool's IMD input cost is grossed up by `ceil(pool input / 99)` in `afterSwap`. |

Rounding is in IMD wei. Exact-output gross-up rounds against the trader by at most one wei. Swaps with a specified IMD amount must fill that adjusted amount completely or revert, so a fee is never taken on an unfilled IMD budget. External v4 callers remain responsible for slippage checks on their own swaps. KeelRouter supports exact input only and requires full input consumption, positive output, nonzero minimum output and an unexpired deadline; otherwise the entire transaction reverts. Any Uniswap protocol fee, and the ETH pool's LP fee, is additional to the Keel hook fee.

During swaps the hook mints fully backed PoolManager ERC-6909 IMD claims to itself. `pending(token)` attributes them to each project, and `totalPending` tracks their sum. Anyone can call `hook.distribute(token)` after the PoolManager lock is released: it zeros pending accounting, burns the claims in its authenticated unlock callback, takes IMD, transfers it to the vault and calls `vault.accrue`. The whole operation is atomic on failure. A keeper should distribute regularly; there is no keeper reward.

For a Building token, each distributed fee is split as follows:

- Team: `floor(amount * 1000 / 10000)`.
- Active creator: `floor(amount * creatorBps / 10000)`, with launch share in `[0, 8000]`.
- Basket: the exact remainder. An inactive creator's share is redirected here.

`lowerCreatorShare(token, newBps)` is creator-only and requires a strict decrease. `setCreatorActive(token, active)` is owner-only. Both flush pending fees under the old configuration before changing it. The settings apply to the specific Building project. After closing, newly distributed fees pay 10% team and the full remainder to the creator, regardless of its former status or share.

Anyone may `deposit(token, amount)` into a Building basket. Creator and team balances are separate liabilities, withdrawn with `claimCreator(token)` by that creator and `claimTeam()` by the current vault owner. These functions withdraw already accrued amounts; distribute pending fees first when needed. No owner sweep or emergency basket withdrawal exists. Direct unsolicited IMD transfers are unallocated surplus and cannot be recovered by the contracts.

`totalOwed` is the sum of all basket balances (including closed, unclaimed pools), creator balances and the team balance. The vault requires backing before crediting accrued fees and checks the exact amount received on deposits. Outgoing payments decrement the corresponding liability before transferring. All IMD-moving entry points use reentrancy protection. `accrue` itself transfers no tokens and is restricted to the immutable wired hook; it deliberately remains callable during guarded share/status/close operations. The contracts assume IMD does not rebase, tax transfers or change standard ERC-20 transfer semantics.

## Verified work

Only the configured verifier can submit either function:

- `reimburse(token, jobRef, commit, amount)`: Building, active creator, globally unused nonzero job hash, nonzero commit, `0 < amount <= runPrice`, and sufficient basket. Pays the registered creator, never the verifier/caller. Emits both `Reimbursed` and `RunVerified`.
- `recordRun(token, jobRef, commit)`: Building, globally unused nonzero job hash and nonzero commit. Moves no funds and emits `RunVerified` with amount zero. It reverts when the creator is active **and the basket covers the full runPrice**.

The two methods share a global `jobUsed` registry across all launched tokens. Pass `keccak256(bytes(lowercaseUuid))` as a run's `jobRef`; this run registry is separate from launch-job uniqueness. `commit` is a nonzero bytes32 commitment chosen by the verifier's documented commit encoding (for example, a hash of the canonical commit identifier). Commit encoding must be consistent across its service and consumers.

The specified `recordRun` threshold is the full `runPrice`: an active creator with a smaller positive basket can either receive a partial reimbursement or have a zero-payment run recorded. Pending hook fees are not automatically distributed by the two verification methods. The verifier should distribute first when deciding whether a funded reimbursement is available. The verifier is trusted to verify real swarm work and commits; the contract proves authorization, uniqueness and payment limits, not off-chain work quality.

## Closing and holder claims

The vault owner calls `announceClose(token)`, may call `cancelClose(token)`, and may close only once both deadlines have passed: seven days after the most recent notice and thirty days after launch. Cancelling removes the notice and its snapshot; a new notice starts a new seven-day period with a new snapshot.

`announceClose(token)` fixes the holder snapshot at `block.number - 1`, the block before the notice, and reverts if the PoolManager held no tokens at that block (a notice in the launch block). `close(token)` distributes pending fees under Building rules, freezes `poolAtClose = basket`, and records a second snapshot, `closeBlock = block.number - 1`, the block before the close. Circulating supply is the smaller of the two supplies, where each supply is fixed total supply minus the PoolManager's and dead address's balances at that block. The creator's Building slot is released. The token and permanently locked pool continue trading.

Each holder calls `claim(token)` for itself once. Payment is:

```text
floor(poolAtClose * min(balanceAt(holder, snapshotBlock), balanceAt(holder, closeBlock)) / circulating)
```

A claim therefore needs the tokens at both snapshots. Purchases in the notice block or later carry no rights, and tokens sold or given away between the notice and the close forfeit their share, which stays locked in the basket; the sum of all claims never exceeds `poolAtClose`. Transferring tokens after the close does not transfer the claim. A buyer who enters while the notice is pending in the public mempool and exits as soon as it is visible collects nothing; to profit, a transient buyer would have to hold through the whole notice period, at least seven days, until an owner-chosen close block it cannot predict, paying the 1% fee each way. Send the notice through a private relay where possible so that the pre-notice snapshot is final before the notice is visible. Custodians and wrappers receive the rights associated with their own ERC-20 balances; the vault does not look through to beneficial owners. PoolManager and the dead address are explicitly excluded from claiming. If circulating supply is zero, no claims are available and the pool remains locked. Integer claim dust, forfeited shares and never-claimed allocations also remain locked: there is no expiry, redistribution or administrative sweep. `claimable(token, holder)` reports current unpaid entitlement; zero entitlements cannot submit a successful claim.

The owner chooses when to announce and when to close: there is no earliest notice time after launch and no latest close time after a notice. Fees distributed between the notice and the close accrue to the basket and are paid to the snapshot holders, not to later buyers. An early notice followed by a long wait therefore directs later traders' basket share to the snapshot set. Operate `announceClose` from a reviewed multisig and publish the project's notice policy.

## Integration events and quotes

Index `Launched` and `Registered` for creator/project/job/pool/token metadata; `FeePending`, `FeesDistributed`, `FeeAccrued` and `Deposited` for funding; `CreatorShareLowered` and `CreatorStatusChanged` for creator terms; `Reimbursed` and `RunVerified` for work; `CloseAnnounced`, `CloseCancelled`, `Closed` and `Claimed` for the close lifecycle; and `CreatorClaimed`, `TeamClaimed`, configuration and ownership events for payouts and administration. Standard ERC-20 transfers/approvals remain available. See the source ABIs for complete indexed fields. Indexers should process finalized receipts and handle chain reorgs.

`router.quoteExactInput(tokenIn, tokenOut, amountIn)` is a view that reads v4 state, traverses tick bitmaps, crosses initialized liquidity and reproduces v4 swap rounding and directional protocol/LP fees, then applies Keel fees. It supports direct IMD routes, ETH routes through the configured pool, and TOKEN → IMD → TOKEN routes. Quotes revert on insufficient liquidity or more than 4,096 traversal steps. They are execution estimates at the current state, **not price oracles** or guaranteed future outputs. Callers must choose minimum output and deadline; no economic decisions in the vault depend on a DEX quote.

For v4 integration background, see Uniswap's [custom accounting documentation](https://developers.uniswap.org/docs/protocols/v4/guides/custom-accounting) and the pinned source under `lib/v4-core`. The shipped tests, rather than a remote quote service, check quote equality with actual execution.

## Operational trust and release review

The owner selects launch authorization, tick bounds, ETH market, verifier and run price; can stop new launches, redirect inactive creators' future shares to their baskets, and initiate closing subject to the public delays. It cannot raise a creator's chosen share, withdraw a basket, alter a closed snapshot, remove liquidity or upgrade these contracts. It does choose the notice and close timing, and with it which holders are in the basket snapshot (see "Closing and holder claims"). The signer controls launch admission; the verifier controls which eligible work is paid. Operate these roles with separately reviewed access controls and a documented key-rotation/revocation process.

Before production use, independently review the contracts and the exact deployment, verify source/bytecode and role ownership on the explorer, check IMD behavior and ETH/IMD liquidity, simulate gas for the exact constructor, and exercise the post-deployment setup. The local tests and adversarial checks are not an independent security audit. No keys, live transactions or funded wallet operations were used in this assignment.
