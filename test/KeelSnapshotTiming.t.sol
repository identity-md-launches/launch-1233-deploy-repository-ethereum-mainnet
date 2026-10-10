// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {KeelTestBase} from "./helpers/KeelTestBase.sol";
import {KeelVault} from "../src/KeelVault.sol";
import {KeelToken} from "../src/KeelToken.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Block-exact timing of the two holder snapshots. Every roll here goes through
/// `vm.getBlockNumber()`: with via-IR the compiler reads NUMBER once per call frame, so a repeated
/// `vm.roll(block.number + 1)` in one test body re-rolls to the same block and a scenario that reads
/// "buy in block N-1, close in block N" silently collapses into one block. These tests assert the block
/// each step ran in, so such a collapse fails instead of passing vacuously.
contract KeelSnapshotTimingTest is KeelTestBase {
    address internal carol;
    address internal dave;
    address internal erin;

    function setUp() public override {
        super.setUp();
        carol = _actor("carol");
        dave = _actor("dave");
        erin = _actor("erin");
    }

    function _actor(string memory name) private returns (address who) {
        who = makeAddr(name);
        imd.mint(who, 1e27);
        vm.prank(who);
        imd.approve(address(router), type(uint256).max);
    }

    function _nextBlock() private returns (uint256) {
        vm.roll(vm.getBlockNumber() + 1);
        return vm.getBlockNumber();
    }

    function _held(address who, uint256 pastBlock) private view returns (uint256) {
        return KeelToken(token).balanceAt(who, pastBlock);
    }

    function _expectNothing(address who) private {
        vm.prank(who);
        vm.expectRevert(KeelVault.NothingToClaim.selector);
        vault.claim(token);
    }

    /// @dev The shared helper must notice and close in different blocks, as its comment says. Before
    /// this revision its second roll was cached and the close landed in the notice block.
    function testMatureCloseHelperNoticesAndClosesInSeparateBlocks() public {
        _deposit(1 ether);
        uint256 start = vm.getBlockNumber();
        _matureClose();
        KeelVault.Project memory p = vault.project(token);
        assertEq(p.snapshotBlock, start, "snapshot is the block before the notice");
        assertEq(p.closeBlock, start + 1, "the close snapshot is the notice block");
        assertEq(vm.getBlockNumber(), start + 2, "the close ran one block after the notice");
        assertGt(p.closeBlock, p.snapshotBlock);
    }

    /// @dev Five entries pinned to their blocks: alice (before everything), bob and carol (the block
    /// before the notice, the one the pending notice does not yet exclude), dave (the notice block
    /// itself), erin (the block before the close). Bob holds; carol sells right after the notice.
    function testEntryAndExitBlocksDecideEveryClaim() public {
        uint256 aliceTokens = _buy(alice, 1_000 ether);
        _deposit(10_000 ether);

        uint256 preNoticeBlock = _nextBlock();
        uint256 bobTokens = _buy(bob, 20_000 ether);
        uint256 carolTokens = _buy(carol, 20_000 ether);

        uint256 noticeBlock = _nextBlock();
        assertEq(noticeBlock, preNoticeBlock + 1);
        uint256 daveTokens = _buy(dave, 20_000 ether);
        vault.announceClose(token);
        KeelVault.Project memory p = vault.project(token);
        assertEq(p.snapshotBlock, preNoticeBlock);
        // The notice snapshot sees the purchases of the block before it and nothing from its own block.
        assertEq(_held(alice, p.snapshotBlock), aliceTokens);
        assertEq(_held(bob, p.snapshotBlock), bobTokens);
        assertEq(_held(carol, p.snapshotBlock), carolTokens);
        assertEq(_held(dave, p.snapshotBlock), 0);

        uint256 exitBlock = _nextBlock();
        assertEq(exitBlock, noticeBlock + 1);
        _sell(carol, carolTokens);

        vm.warp(block.timestamp + 31 days);
        uint256 preCloseBlock = _nextBlock();
        uint256 erinTokens = _buy(erin, 20_000 ether);
        uint256 closeBlock = _nextBlock();
        assertEq(closeBlock, preCloseBlock + 1);
        vault.close(token);
        p = vault.project(token);
        assertEq(p.closeBlock, preCloseBlock);
        assertEq(_held(carol, p.closeBlock), 0);
        assertEq(_held(dave, p.closeBlock), daveTokens);
        assertEq(_held(erin, p.closeBlock), erinTokens);

        // Only the five actors, the pool and the dead address can hold tokens, so these sums are the
        // circulating supplies at the two snapshots; the vault must take the smaller one.
        uint256 atNotice = aliceTokens + bobTokens + carolTokens;
        uint256 atClose = aliceTokens + bobTokens + daveTokens + erinTokens;
        assertEq(p.circulating, Math.min(atNotice, atClose));
        uint256 a = Math.mulDiv(p.poolAtClose, aliceTokens, p.circulating);
        uint256 b = Math.mulDiv(p.poolAtClose, bobTokens, p.circulating);
        assertEq(vault.claimable(token, alice), a);
        assertEq(vault.claimable(token, bob), b);
        assertEq(vault.claimable(token, carol), 0, "sold between notice and close");
        assertEq(vault.claimable(token, dave), 0, "bought in the notice block");
        assertEq(vault.claimable(token, erin), 0, "bought in the block before the close");
        assertLe(a + b, p.poolAtClose);
        assertGt(a, 0);
        assertGt(b, 0);

        vm.prank(alice);
        assertEq(vault.claim(token), a);
        vm.prank(bob);
        assertEq(vault.claim(token), b);
        _expectNothing(carol);
        _expectNothing(dave);
        _expectNothing(erin);
        // Carol's forfeited share stays locked in the closed basket; nobody else can take it.
        assertEq(vault.project(token).basket, p.poolAtClose - a - b);
        assertEq(vault.project(token).totalClaimed, a + b);
        _solvent();
    }

    /// @dev A buyer in the block before the notice is paid on whatever fraction survives to the close
    /// snapshot, from a full exit (nothing) to holding everything (the full pro-rata share).
    /// forge-config: default.fuzz.runs = 256
    function testFuzzPreNoticeBuyerIsPaidOnWhatSurvivesToTheClose(uint16 keepBps) public {
        uint256 keep = bound(keepBps, 0, 10_000);
        uint256 aliceTokens = _buy(alice, 1_000 ether);
        _deposit(10_000 ether);
        uint256 preNoticeBlock = _nextBlock();
        uint256 bought = _buy(bob, 20_000 ether);
        uint256 retained = bought * keep / 10_000;
        _nextBlock();
        vault.announceClose(token);
        assertEq(vault.project(token).snapshotBlock, preNoticeBlock);
        assertEq(_held(bob, preNoticeBlock), bought);
        uint256 exitBlock = _nextBlock();
        if (bought > retained) _sell(bob, bought - retained);
        vm.warp(block.timestamp + 31 days);
        uint256 closeBlock = _nextBlock();
        assertEq(closeBlock, exitBlock + 1);
        vault.close(token);
        KeelVault.Project memory p = vault.project(token);
        assertEq(p.closeBlock, exitBlock);
        assertEq(p.circulating, aliceTokens + retained);
        uint256 a = Math.mulDiv(p.poolAtClose, aliceTokens, p.circulating);
        uint256 b = Math.mulDiv(p.poolAtClose, retained, p.circulating);
        assertEq(vault.claimable(token, alice), a);
        assertEq(vault.claimable(token, bob), b);
        assertLe(a + b, p.poolAtClose);
        assertLe(p.poolAtClose - a - b, 1);
        vm.prank(alice);
        assertEq(vault.claim(token), a);
        if (b == 0) {
            _expectNothing(bob);
        } else {
            vm.prank(bob);
            assertEq(vault.claim(token), b);
        }
        assertEq(vault.project(token).totalClaimed, a + b);
        _solvent();
    }
}
