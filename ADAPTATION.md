# Adaptation for the Ethereum mainnet launch

The project arrived already shaped for an `evm_contracts` launch: four constructor-only deployments
(`KeelToken`, `KeelVault($owner)`, `KeelFactory($owner, $contract:KeelVault, $contract:KeelToken, 0)`,
`KeelRouter($owner, $contract:KeelFactory)`), no initializers, no proxies among the deployed contracts,
no `DELEGATECALL`/`CALLCODE`/`SELFDESTRUCT` in their runtime, `bytecode_hash = "none"`, every library
function internal, and constructors that touch no other contract (the factory's constructor only runs
the pure salt search and CREATE2-deploys `KeelHook` itself). No launch rule required a code change.
The changes below come from the imported audit and from the independent review of the first
accepted round: the findings that reproduce are fixed with tests, the others are left as they are
and explained. Review responses are in `.imd-responses.json`.

Protected files (`foundry.toml`, `remappings.txt`, `lib/`, `.gitmodules`, package files) are untouched.
`launch.json` is not written; it belongs to the manifest step.

## Changes

### 1. Holder snapshot fixed at the close notice (audit `aab3704d…`, high) — reproduced, fixed

- Files: `src/KeelVault.sol` (`announceClose`, `cancelClose`, `close`).
- Reproduction: the audit's proof, run unmodified against the original code, fails as reported:
  basket at close 11,206 IMD, bob claims 10,917 IMD after buying one block before the close, alice's
  entitlement falls to 288.98 IMD, bob ends 6,937 IMD richer after selling back.
- Cause: `close()` snapshotted `block.number - 1`, while `CloseAnnounced` publishes the earliest
  close time seven days ahead and the zero-LP-fee pool makes a buy/sell round trip cost about 2%.
- Fix: `announceClose` now records `snapshotBlock = block.number - 1` (the block before the notice
  lands, so front-running the notice in the same block gains nothing) and `close()` uses that stored
  block. `cancelClose` clears the snapshot; a new notice takes a new one. `announceClose` reverts with
  the existing `CloseNotReady` error when the PoolManager held no tokens at the snapshot block, which
  only happens when the notice is sent in the launch block itself (the snapshot would predate the
  token and misreport circulating supply). The `block.number == 0` guard moved from `close` to
  `announceClose` with the snapshot. Entitlement formula, `Closed`/`Claimed` events, timers,
  exclusions, rounding and the `Project` struct are unchanged; `snapshotBlock` is simply set earlier.
- Tests: `testLateBuyerCannotCaptureHolderBasket` (the audit scenario: bob's claim reverts with
  `NothingToClaim`, alice keeps the whole basket, bob loses IMD),
  `testNoticeSnapshotRejectsLaunchBlockAndResetsOnCancel`,
  `testCloseAtExactThirtyDaysWithMatureNotice` (snapshot equals notice block minus one).
  `test/helpers/KeelTestBase.sol` (`_matureClose`), `test/KeelInvariant.t.sol` (`noticeOrClose`) and
  `testCloseRequiresBothTimingThresholdsAndCancellationRestartsNotice` advance one block before the
  notice because the tests launch and trade in the same block; this encodes the new rule, not a
  behaviour the launch forbids.
- Docs: README "Closing and holder claims" and `docs/VALIDATION.md` describe the notice-time snapshot.

### 1b. Claims need the tokens at the close as well (review `eef2109a…`, medium) — reproduced, fixed

- File: `src/KeelVault.sol` (`close`, `claimable`, new private view `_circulating`, new `Project`
  field `closeBlock`).
- Reproduction: the reviewer's proof, run unmodified against the round-one code, fails as reported.
  The notice-time snapshot only closes the same-block race: a notice pending in the public mempool
  for one block lets a buyer land in the snapshot block, sell right after the notice and still claim
  pro rata (attacker claim 12,074 IMD of a 12,394 IMD basket, pre-notice holder 319 IMD).
- Fix (the reviewer's third remedy, which keeps `announceClose(token)`, every event and every role):
  `close()` records a second snapshot `closeBlock = block.number - 1` and sets `circulating` to the
  smaller of the circulating supplies at `snapshotBlock` and `closeBlock`; `claimable()` pays
  `floor(poolAtClose * min(balanceAt(holder, snapshotBlock), balanceAt(holder, closeBlock)) / circulating)`.
  The sum of per-holder minima never exceeds the minimum of the sums, so total claims stay within
  `poolAtClose`. Tokens sold or given away between the notice and the close forfeit that share, which
  stays locked like any other unclaimed amount. A transient buyer must now hold through the whole
  notice period to an owner-chosen close block to profit, instead of across one block boundary. The
  other remedies (an owner-chosen or fixed 32-block-old snapshot) were not taken: both change the
  notice signature or reject the proof's own layout (notice two blocks after launch).
- Tests: `testTransientBuyerAroundNoticeForfeitsClaim` (the reported scenario: claim 0, holder keeps
  the whole basket), `testPartialExitBetweenNoticeAndCloseKeepsOnlyRetainedShare` (claims proportional
  to retained balances, within the pool), and `testClaimNeedsTokensAtNoticeAndCloseSnapshots`, which
  replaces `testSnapshotExcludesTransferAndPurchaseAfterNotice`: that test asserted that a transfer
  between notice and close keeps the sender's full claim, which is the behaviour the finding exploits.
  The invariant campaign (transfers and trades at any time around notice and close) still holds
  `totalClaimed <= poolAtClose`.
- Docs: README "Closing and holder claims" gives the new formula, the forfeiture rule and the
  private-relay recommendation; `docs/VALIDATION.md` lists the new coverage.

### 2. `setStartTickBounds` rejects maxima that can never launch (audit `02328646…`, low) — reproduced, fixed

- File: `src/KeelFactory.sol` (`setStartTickBounds`, new private pure `_position`).
- Reproduction: with `SUPPLY = 1e27` the whole-supply liquidity exceeds
  `Pool.tickSpacingToMaxLiquidityPerTick(200)` from start tick 349,200 upward; the original setter
  accepted any maximum below `MAX_TICK - 200`, so a signed launch inside accepted bounds reverted
  with `InvalidLiquidity`.
- Fix: the lower-tick/liquidity computation used by `launch` is factored into `_position` (same
  arithmetic, no behaviour change for `launch`), and `setStartTickBounds` additionally reverts with
  the existing `InvalidTick` when the liquidity at `maximum` exceeds the per-tick cap. Liquidity is
  monotonic in the start tick, so checking the maximum covers the whole range. Previously valid
  bounds are still accepted; `launch` keeps its own check.
- Tests: `testStartTickBoundsRejectMaximaAboveLiquidityCap` (349,200 and the 880,000–886,999 region
  rejected, 349,199 accepted and launchable) and `testFuzzAcceptedBoundsAlwaysLaunch` (every accepted
  maximum in [-200000, 400000] launches; every rejection is `InvalidTick` at or above 349,200).

## Advisory review findings — documentation only

### Factory constructor gas is a per-address draw (review `5456090d…`, low) — reproduced, documented

`hookSaltStart` is part of the factory init code, so changing it changes the factory's CREATE2
address and re-rolls the salt search rather than resuming it; the candidate count is geometric
(p = 2^-14) in the factory address, with about 6% of addresses above 50,000 candidates. The brief
fixes the constructor and its arguments, so no code changes. README "Deployment parameters" and
`docs/VALIDATION.md` now say to simulate with the exact factory address and salt, set the gas ceiling
from the observed count, and that a new offset is a re-roll.

### The 1% fee applies only to the canonical pool (review `573e2116…`, low) — reproduced, documented

The PoolManager is permissionless and the token has no transfer restriction, so a hookless
TOKEN/IMD pool pays nothing to the team, creator or basket. Closing this needs a token-layer fee,
which the brief forbids. README "Fees and solvency" now states the limitation.

### Owner chooses the snapshot timing (review `c55625e6…`, info) — trust assumption, documented

There is no earliest notice time after launch and no latest close time after a notice, so the owner
picks which holders are in the snapshot and later fees accrue to that set. README "Closing and
holder claims" and "Operational trust and release review" record this power and the multisig and
published-policy mitigation.

## Findings reviewed and left unchanged

### EIP-1167 clones for project tokens (audit `bba509b7…`, medium) — reproduced as described, not changed

The clone runtime does contain `DELEGATECALL`, and `KeelToken.initialize` is the clone's
configuration path. It is left as is because the brief for this launch names `KeelToken` as the
"EIP-1167 clone template" and asks for the repository to be deployed as it is with no change to
contract logic; the launch policy's opcode and initializer rules apply to the five contracts the
launch deploys, none of which contains `0xf4`, `0xf2` or `0xff` (the protected test checks this).
The implementation is locked in its constructor, factory clones are initialized atomically inside
`launch()`, and a look-alike clone made by anyone else is never `isLaunched`, has no pool, no hook
registration and no vault project. Replacing clones with full `new KeelToken(...)` deployments would
be a redesign of the factory for the panel to request explicitly.

### ERC-6909 claim holders at the snapshot (audit `bcd471f3…`, low) — documented policy, not changed

The README already states that only ERC-20 balances qualify ("the vault does not look through to
beneficial owners"), that PoolManager is excluded, and that a zero circulating supply or unclaimed
remainder stays locked with no sweep. The behaviour the finding describes is that documented policy;
changing it would alter claim economics beyond what this launch allows. Operators should treat
tokens parked as v4 claims like any custodial balance: withdraw them to an ERC-20 balance before the
close notice to hold basket rights.

### Post-deployment configuration (audit `5699c9bb…`, info) — prescribed by the brief, not changed

The brief prescribes `vault.wire(factory)`, `factory.setSigner`, `factory.setStartTickBounds`,
`vault.setVerifier`, `router.setEthPool` and finally `factory.setPaused(false)` as separate owner
transactions after deployment, and the launch deploys with the factory as `msg.sender`, so these
cannot be constructor arguments without inventing signer, verifier and pool values. The factory
stays paused at deployment. `wire` is one-shot: the owner must pass the deployed `KeelFactory`
address from the deployment record (it is validated against `factory.vault()` and the hook).

## Checks

`forge build`, `forge test` (67 tests across 10 suites, including the invariant campaign with
`fail_on_revert = true`) and `forge fmt --check` pass with the project's own configuration and no
network, environment variables or FFI. The reviewer's proof for `eef2109a…` passes on this tree.
The audit proof for `aab3704d…` sends its notice in the launch block, which the round-one fix rejects
with `CloseNotReady`; it fails identically on the round-one tree and is covered by
`testLateBuyerCannotCaptureHolderBasket`. Slither and Mythril were not run.

## Deployment notes for the manifest and deployer

- Order and arguments: `KeelToken()`, `KeelVault($owner)`,
  `KeelFactory($owner, $contract:KeelVault, $contract:KeelToken, 0)`,
  `KeelRouter($owner, $contract:KeelFactory)`. `KeelHook` is created by the factory constructor and
  read from `factory.hook()`; do not deploy it separately.
- Simulate the factory constructor before sending, with the exact factory address and salt the
  service will use: the CREATE2 salt search is on chain and measured at about 6 million gas in tests,
  but its length is a geometric draw in the factory address (about 6% of addresses exceed 50,000
  candidates, roughly 118 gas each on top of about 4.6 million fixed). Set the gas ceiling from the
  simulated count, not the test figure. A different `hookSaltStart` changes the factory address and
  re-rolls the search; it does not resume it.
- The deployed addresses of `KeelToken`, `KeelVault`, `KeelFactory`, `KeelHook` and `KeelRouter` are
  published by the deployment handoff after the transaction confirms; no address is invented here.
