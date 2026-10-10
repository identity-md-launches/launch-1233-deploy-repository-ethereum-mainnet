# Chain integration verification

Performed 2026-10-10. No transaction was broadcast. Contract source and existing Foundry configuration were not changed.

## Pinned source and ABIs

The checkout HEAD was `b33b5572550632fa7512dd5eddb6ef589223bc08`, matching the deployment handoff. Ran from the repository root:

```sh
forge build --out test/scratch/forge-out --cache-path test/scratch/forge-cache
node web/scripts/generate-abis.mjs
```

Foundry compiled 121 files with Solidity 0.8.26 in 244.02 seconds, successfully. Existing source/test lints and the existing test helper's `selfdestruct` deprecation warning were reported. No Solidity edits were made. Generated build artifacts and cache stay under the disposable `test/scratch/` directory.

Canonical JSON sorts object keys recursively and preserves array order. Hashing the UTF-8 canonical ABI with Keccak-256 exactly matched all four pinned `abiHash` values:

| Contract | canonicalKeccak(abi), without `0x` |
| --- | --- |
| KeelToken | `800183d3da06e4e75d79226a78abe75460d613f9e8bd3d452ea94bc5d021cf07` |
| KeelVault | `18b1ec006b627bccc85a18db8a4fc53e093925ef659d25fd3a6d7f567ad092d6` |
| KeelFactory | `ec56a1be7838cecab487d637cd8b3220d912799958209bd91a656fbb913a4c24` |
| KeelRouter | `1f250d1582b262e244c80d263358eabbfc7d8b02f8923fedbd7d1683009674d3` |

All four creation bytecode hashes also exactly matched the handoff. The generator checks both ABI and creation bytecode hashes and refuses mismatches. `KeelHook` has no separate ABI hash in that handoff; it was compiled from the same pinned source, and its creation code is embedded in the matching factory creation code. Its generated ABI hash is `54d9a27ddc618b47c0ba773bcbc82febdc69a77265e2551a52fd4e0d842da2d1`.

## Live reads

Both pinned public RPC endpoints returned Ethereum mainnet block numbers. The deployed transaction receipt's `HookDeployed` event at block 26162060 matched the hook in the single address config. It reported salt `0x2028` (left-padded to bytes32), 8233 attempts.

The application verified deployed code for KeelToken, KeelVault, KeelFactory, KeelRouter and KeelHook against the compiled runtime bytecode. Comparison masks only the immutable byte ranges explicitly reported by Solidity. It separately checks the factory's vault, implementation and hook; router's factory; hook's factory and vault; chain ID; and the presence of IMD bytecode. Successful verification is cached for five minutes, and every write path requires it.

At mainnet block **26162273**, the read-only application returned:

- `paused = true`.
- Zero `Launched` events and zero `RunVerified` events since deployment.
- Zero IMD in project baskets.
- `runPrice = 500000000000000000` wei, or 0.5 IMD.
- `verified = true`.

These are observed state values, not fixed display defaults. Failed RPC reads throw and cannot become false zero stats. Each market load pins its event and project reads to one block. Event windows shrink when a provider imposes smaller limits, and refreshes rewind 12 blocks to replace recently reorganized events.

## Repeatable checks

After `cd web && npm ci`, run from the repository root:

```sh
node web/scripts/check-chain.mjs
node web/scripts/check-chain.mjs --live
```

The deterministic suite passed 10 scenarios. The optional live check and encoded-event integration passed too, for **12 passing checks** total: seven-day build decay/counts/full-bar cap; exact 18-decimal amounts and invalid inputs; untrusted metadata URL filtering; launch UUID/UTF-8/share/expiry/metadata bounds; public RPC fallback; unavailable RPC error behavior; adaptive event scanning and removed logs; injected-wallet absence and chain switching; pre-wallet expired-deadline rejection; and exact event decoding for recorded-only runs. After successful live code verification, a local encoded-event scenario exercises actual `Launched`/`RunVerified` decoding, one-token market aggregation, canonical-pool price and market cap, unresolvable run hashes, close-notice timing, holder claim reads and a failed pool read retaining unavailable price instead of zero. The last live observation was block 26162285 with the same paused/empty state. Local fixtures are limited to the check script and disposable compiled test modules. They are never imported by the app or included in `dist`.

## Wallet interaction integration

After generating the pinned Foundry artifacts with the command above, ran:

```sh
node web/scripts/check-wallet.mjs
```

**13 checks passed.** The harness bundles and executes the real `executeTrade`, `launchToken`, `claimToken` and app error-formatting functions. It intercepts all public reads and supplies a local EIP-1193 provider. Public request methods are allowlisted to chain ID, code and call reads; transaction requests never reach a network. No wallet key or raw signed transaction is used.

Checked exact input approval followed by a buy; sell with sufficient allowance and no approval; correct router token order, amount, minimum output, absolute deadline and connected recipient; preflight before each send; a deadline expiring during approval; rejected account access; rejected approval; router simulation rejection; paused launch; exact signed launch fields, basis-point share and metadata; invalid launch signature; zero claimable amount; eligible claim; reverted receipt; and a failed deployment recheck preventing subsequent wallet access. Some scenarios include several related assertions.

The tests found and fixed two issues: the app preferred ethers' generic short message over its decoded custom-error reason, so slippage and invalid signatures were not actionable; and an explicitly failed deployment recheck needed to invalidate a previous cached success. The final app maps those custom errors to short recovery guidance, and failed verification clears cached trust. The harness exercises both fixes. Config-parsing scripts also accept formatted double-quoted strings and multiline hash values.

After these changes, `npm run typecheck` passed, ABI/creation-hash generation passed again, and the 12-check chain suite passed again with live mainnet block 26162308 still paused and empty.

## Behavior and limits

- `web/src/chain/index.ts`, `verifyDeployment`: writes require a matching mainnet deployment. Injected wallets must switch to chain 1. ERC-20 approvals use the exact input amount, not an unlimited allowance; the router receives explicit minimum output, absolute deadline and connected-wallet recipient. Launch, approval, swap and claim are simulated before prompting the wallet to send them.
- `web/src/chain/index.ts`, `loadMarket`: display price comes from the canonical pool's `sqrtPriceX96`, in IMD per token; market capitalization multiplies that spot price by actual total supply. Values are display estimates, not execution quotes. Quotes come from KeelRouter, including its fee logic, using integer amounts. If a price read fails, the price remains unavailable.
- `web/src/chain/index.ts`, `loadMarket`: basket amounts are the vault's actual recorded balance. Hook fees awaiting distribution are read separately and are not counted as already-distributed basket funds.
- `web/src/chain/utils.ts`, `launchArguments`: launch fields match the existing contract, including nonempty image and description, 1,024-byte metadata, lowercase UUIDs and 0–80% creator share. The site accepts a pasted signed launch gate response because no gate URL or API was supplied. It does not fabricate a permit or call a private backend.
- `RunVerified` contains `keccak256(bytes(jobUuid))`, not the original UUID. A hash cannot be reversed into an explorer job URL. The [live explorer](https://explorer.imd.fun/) was inspected and uses `/jobs/<uuid>` routes. The UI provides the event transaction and accepts an original UUID, checking its hash locally before opening that job page. A run reference that matches a known launch UUID can also resolve directly. No guessed `/jobs/<hash>` routes are emitted. Automatic resolution of arbitrary run hashes would require additional published data or a lookup service; neither exists in these contracts.
- No live launch, approval, buy, sell or claim was sent. The factory was paused and had no launched tokens, and no funded signing account or valid launch permit was provided. Mainnet transaction success, wallet-extension rendering and post-launch liquidity behavior are consequently not claimed as live-tested by this report.
- Public RPC availability, browser CORS policy, provider history limits and externally hosted token images remain external dependencies. The static site's own runtime assets are local; no backend or private credentials are used.
