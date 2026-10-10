# Deployment and adversarial test additions

This contribution adds tests only. Contract logic, fees, roles, limits, events,
configuration, dependencies, and all previously accepted tests are unchanged.

## Complete change list

| Added file | Coverage |
| --- | --- |
| `test/KeelDeployment.t.sol` | Rehearses the four constructors in order through a separate CREATE2 deployment contract on chain ID 1, with no external contracts initially present. Verifies explicit ownership, backward address references, initial pause/configuration state, template lock, hook address/salt/event, runtime and initcode limits, and the protected opcode restrictions for all five application contracts. Reverts the rehearsal and repeats it to check address determinism. Tests invalid constructor inputs and the prescribed owner setup order. |
| `test/KeelFailurePaths.t.sol` | Checks every owner-only administrative entry point, ownership handover, callback authentication, malformed hook inputs, router limits, payout retries, tax-on-transfer rollback, and atomic rollback of failed fee flushing and native multi-hop payouts. A native recipient attempts reentrancy after accepting a retry. |
| `test/KeelBoundaryProperties.t.sol` | Fuzzes launches over the entire accepted tick interval and creator-share range, pins both tick endpoints, exercises one-wei and percentage-fee boundaries, checks repeated small trading cycles, name/symbol length limits, inclusive deadlines, and ECDSA malleability rejection followed by successful use of the original signature. |
| `test/KeelCheckpointInvariant.t.sol` | Adds a four-actor token handler with an independent balance and allowance ledger. Random sequences include transfers, delegated transfers, finite/infinite approvals, block advancement, overdraw attempts, unapproved spending, and attempted reinitialization. Invariants compare current state and immutable historical balances, including blocks with no transfers, against the model. |
| `test/KeelRouteInvariant.t.sol` | Adds a three-actor handler for all twelve directed routes among ETH, IMD, and two project tokens. Random sequences include different payers/recipients, donations, distributions, buy/sell cycles, slippage rejection, and forged callbacks. Checks actual execution against quotes, exact payer/recipient deltas, ERC-6909 fee backing, vault liabilities, isolated router donations, and conservation of ETH and token supplies. |
| `test/CONTRIBUTOR_TESTS.md` | This change inventory, property rationale, and deployment/testing limitations. |

## Properties and non-vacuity

Both new invariant campaigns use inline settings of 256 runs, depth 96, and
`fail-on-revert = true`. Expected failures are checked with explicit revert
selectors; unexpected failures are not caught or discarded. Each handler has a
deterministic exercise test so the important paths are demonstrably reachable.
The two new stateless fuzz properties use 1,000 runs each and bounded inputs.

The existing vault lifecycle campaign is retained. It covers deposits,
reimbursements, recording runs, lowering creator shares, creator activity,
closing/cancelling, holder claims, and creator/team payments across two projects.

The added conservation properties account for donations explicitly: a direct
transfer is an asset without a corresponding vault liability, and router
donations must not be consumed by later users' swaps. Historical balance checks
use transfer intent in a separate ledger, not values copied from `balanceOf` or
`balanceAt`. The buy/sell property checks that a completed cycle cannot create
IMD; the quote property compares the library against execution in the real
vendored v4 PoolManager. These complement, rather than replace, failure tests.

## Reproduction and limits

Run from the repository root:

```sh
forge build
forge test
forge fmt --check
```

Local verification: all three commands pass. `forge test` reports 91 tests
across 15 suites, zero failures, and zero skips. The two added invariant
campaigns each execute 24,576 calls without unexpected reverts; the retained
vault campaign executes 8,192. The build emits lint warnings and the expected
deprecation warning for the test-only forced-ETH helper.

No additional dependencies, network, fork, FFI, environment configuration, or
`vm.setEnv` are required. Integration fixtures execute the real vendored v4
PoolManager at its configured address and use the existing MockIMD fixture.
The forced-ETH helper is test-only and exists solely to model unsolicited ETH;
it is not one of the application contracts checked for forbidden opcodes.

The CREATE2 factory constructor rehearsal measures about 5.7 million gas at its
specific test deployment address, including salt mining and hook deployment.
The test's 16,777,216 gas ceiling is a check of that concrete rehearsal, not a
bound on every possible CREATE2 salt search. A deployment service must simulate
the actual constructor transaction with its actual deployer, salt, and owner.

These are local simulations, not mainnet transactions. Fixture owners, signers,
verifiers, and pool selections are test inputs, not deployment defaults. No
wallet was read, no transaction was broadcast, and no confirmed mainnet address
is produced by this tests assignment. The deployment handoff should publish
the confirmed KeelToken, KeelVault, KeelFactory, factory-created KeelHook, and
KeelRouter addresses. The factory remains paused after the four constructors;
the owner performs the setup transactions separately and unpauses last.

The suite does not establish the current code, liquidity, or operational status
of mainnet external dependencies. It also does not replace a full audit. No
production defect was reproduced by these additions.
