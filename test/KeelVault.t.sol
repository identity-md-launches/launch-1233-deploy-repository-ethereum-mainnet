// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;
import {KeelTestBase} from "./helpers/KeelTestBase.sol";
import {KeelVault} from "../src/KeelVault.sol";
import {KeelFactory} from "../src/KeelFactory.sol";
import {KeelToken} from "../src/KeelToken.sol";
import {KeelConstants as C} from "../src/libraries/KeelConstants.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract KeelVaultTest is KeelTestBase {
    event Reimbursed(
        address indexed token, bytes32 indexed jobRef, address indexed creator, bytes32 commit, uint256 amount
    );
    event RunVerified(address indexed token, bytes32 indexed jobRef, bytes32 indexed commit, uint256 amount);
    event Claimed(address indexed token, address indexed holder, uint256 amount);

    function testReimbursePaysCreatorAndEmitsBothEvents() public {
        _deposit(2 ether);
        uint256 verifierBefore = imd.balanceOf(verifier);
        vm.expectEmit(true, true, true, true, address(vault));
        emit Reimbursed(token, bytes32(uint256(1)), creator, COMMIT, 0.5 ether);
        vm.expectEmit(true, true, true, true, address(vault));
        emit RunVerified(token, bytes32(uint256(1)), COMMIT, 0.5 ether);
        vm.prank(verifier);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0.5 ether);
        assertEq(imd.balanceOf(creator), 0.5 ether);
        assertEq(imd.balanceOf(verifier), verifierBefore);
        assertEq(vault.project(token).basket, 1.5 ether);
        assertTrue(vault.jobUsed(bytes32(uint256(1))));
        _solvent();
    }

    function testRunRestrictionsAndAmountCap() public {
        _deposit(1 ether);
        vm.expectRevert(KeelVault.Unauthorized.selector);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0.5 ether);
        vm.startPrank(verifier);
        vm.expectRevert(KeelVault.InvalidAmount.selector);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0.5 ether + 1);
        vm.expectRevert(KeelVault.InvalidAmount.selector);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0);
        vm.expectRevert(KeelVault.InvalidRun.selector);
        vault.reimburse(token, bytes32(uint256(1)), bytes32(0), 1);
        vm.expectRevert(KeelVault.InvalidRun.selector);
        vault.reimburse(token, bytes32(0), COMMIT, 1);
        vm.expectRevert(KeelVault.ReimbursementAvailable.selector);
        vault.recordRun(token, bytes32(uint256(1)), COMMIT);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0.5 ether);
        vm.expectRevert(KeelVault.ReimbursementAvailable.selector);
        vault.recordRun(token, bytes32(uint256(2)), COMMIT);
        vault.reimburse(token, bytes32(uint256(2)), COMMIT, 0.5 ether);
        vm.expectEmit(true, true, true, true, address(vault));
        emit RunVerified(token, bytes32(uint256(3)), COMMIT, 0);
        vault.recordRun(token, bytes32(uint256(3)), COMMIT);
        vm.expectRevert(KeelVault.InsufficientBasket.selector);
        vault.reimburse(token, bytes32(uint256(4)), COMMIT, 1);
        vm.stopPrank();
        assertEq(vault.project(token).basket, 0);
    }

    function testPartialReimbursementBelowRunPriceAndRecordThreshold() public {
        _deposit(0.3 ether);
        vm.prank(verifier);
        vault.recordRun(token, bytes32(uint256(1)), COMMIT);
        vm.prank(verifier);
        vault.reimburse(token, bytes32(uint256(2)), COMMIT, 0.3 ether);
        assertEq(imd.balanceOf(creator), 0.3 ether);
        assertEq(vault.totalOwed(), 0);
    }

    function testInactiveStopsReimburseButAllowsRecordWithFundedBasket() public {
        _deposit(1 ether);
        vault.setCreatorActive(token, false);
        vm.startPrank(verifier);
        vm.expectRevert(KeelVault.InactiveCreator.selector);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0.5 ether);
        vault.recordRun(token, bytes32(uint256(1)), COMMIT);
        vm.stopPrank();
        assertEq(vault.project(token).basket, 1 ether);
        assertEq(imd.balanceOf(creator), 0);
        vault.setCreatorActive(token, true);
        vm.prank(verifier);
        vm.expectRevert(KeelVault.ReimbursementAvailable.selector);
        vault.recordRun(token, bytes32(uint256(2)), COMMIT);
    }

    function testSharedJobRefAcrossTokensAndRunMethods() public {
        address other = _launch(bob, JOB2, 0, -100000);
        _deposit(1 ether);
        vm.startPrank(verifier);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0.5 ether);
        vm.expectRevert(KeelVault.JobAlreadyUsed.selector);
        vault.recordRun(other, bytes32(uint256(1)), COMMIT);
        vault.recordRun(other, bytes32(uint256(2)), COMMIT);
        vm.expectRevert(KeelVault.JobAlreadyUsed.selector);
        vault.reimburse(token, bytes32(uint256(2)), COMMIT, 0.5 ether);
        vm.expectRevert(KeelVault.JobAlreadyUsed.selector);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0.5 ether);
        vm.stopPrank();
    }

    function testRunPriceBoundsAndVerifierRevocation() public {
        assertEq(vault.runPrice(), 0.5 ether);
        vault.setRunPrice(0.1 ether);
        assertEq(vault.runPrice(), 0.1 ether);
        vault.setRunPrice(2 ether);
        assertEq(vault.runPrice(), 2 ether);
        vm.expectRevert(KeelVault.InvalidRunPrice.selector);
        vault.setRunPrice(0.1 ether - 1);
        vm.expectRevert(KeelVault.InvalidRunPrice.selector);
        vault.setRunPrice(2 ether + 1);
        vm.expectRevert(KeelVault.InvalidAddress.selector);
        vault.setVerifier(address(0));
        vault.revokeVerifier();
        vm.prank(verifier);
        vm.expectRevert(KeelVault.NotConfigured.selector);
        vault.recordRun(token, bytes32(uint256(1)), COMMIT);
        vault.setVerifier(bob);
        vm.prank(verifier);
        vm.expectRevert(KeelVault.Unauthorized.selector);
        vault.recordRun(token, bytes32(uint256(1)), COMMIT);
        vm.prank(bob);
        vault.recordRun(token, bytes32(uint256(1)), COMMIT);
    }

    function testCloseRequiresBothTimingThresholdsAndCancellationRestartsNotice() public {
        uint256 launchTime = vault.project(token).launchedAt;
        vm.expectRevert(KeelVault.CloseNotReady.selector);
        vault.close(token);
        vm.roll(vm.getBlockNumber() + 1);
        vault.announceClose(token);
        vm.expectRevert(KeelVault.NoticeExists.selector);
        vault.announceClose(token);
        vm.warp(launchTime + 7 days);
        vm.expectRevert(KeelVault.CloseNotReady.selector);
        vault.close(token);
        vault.cancelClose(token);
        vm.expectRevert(KeelVault.NoNotice.selector);
        vault.cancelClose(token);
        vm.warp(launchTime + 30 days);
        vault.announceClose(token);
        vm.warp(launchTime + 37 days - 1);
        vm.roll(vm.getBlockNumber() + 1);
        vm.expectRevert(KeelVault.CloseNotReady.selector);
        vault.close(token);
        vm.warp(launchTime + 37 days);
        vault.close(token);
        assertEq(uint256(vault.project(token).phase), uint256(KeelVault.Phase.Closed));
    }

    function testCloseAtExactThirtyDaysWithMatureNotice() public {
        vm.roll(vm.getBlockNumber() + 1);
        uint256 noticeBlock = vm.getBlockNumber();
        vault.announceClose(token);
        assertEq(vault.project(token).snapshotBlock, noticeBlock - 1);
        vm.warp(block.timestamp + 30 days);
        vm.roll(vm.getBlockNumber() + 5);
        vault.close(token);
        assertEq(vault.project(token).snapshotBlock, noticeBlock - 1);
    }

    function testNoticeSnapshotRejectsLaunchBlockAndResetsOnCancel() public {
        // setUp launches in the current block: the previous block predates the token.
        vm.expectRevert(KeelVault.CloseNotReady.selector);
        vault.announceClose(token);
        // Read the block through the cheatcode: the compiler may cache block.number across vm.roll.
        vm.roll(vm.getBlockNumber() + 1);
        vault.announceClose(token);
        assertEq(vault.project(token).snapshotBlock, vm.getBlockNumber() - 1);
        vault.cancelClose(token);
        assertEq(vault.project(token).snapshotBlock, 0);
        vm.roll(vm.getBlockNumber() + 3);
        vault.announceClose(token);
        assertEq(vault.project(token).snapshotBlock, vm.getBlockNumber() - 1);
    }

    /// @dev Rights need the tokens at both snapshots: the block before the notice and the block before the
    /// close. Purchases after the notice carry nothing; tokens given away between notice and close forfeit
    /// their share, which stays locked; transfers after the close do not move the claim.
    function testClaimNeedsTokensAtNoticeAndCloseSnapshots() public {
        uint256 bought = _buy(alice, 100 ether);
        _deposit(2 ether);
        vm.roll(vm.getBlockNumber() + 1);
        // A purchase in the notice block itself (front-running the notice) is excluded as well.
        _buy(bob, 10 ether);
        uint256 noticeBlock = vm.getBlockNumber();
        vault.announceClose(token);
        vm.warp(block.timestamp + 30 days);
        vm.roll(vm.getBlockNumber() + 1);
        uint256 given = bought / 3;
        vm.prank(alice);
        IERC20(token).transfer(bob, given);
        _buy(bob, 50 ether);
        vm.roll(vm.getBlockNumber() + 1);
        vault.close(token);
        KeelVault.Project memory p = vault.project(token);
        assertEq(p.snapshotBlock, noticeBlock - 1);
        assertEq(p.closeBlock, vm.getBlockNumber() - 1);
        // Circulating supply is the smaller of the two: only alice's purchase was out at the notice.
        assertEq(p.circulating, bought);
        uint256 expected = p.poolAtClose * (bought - given) / bought;
        assertEq(vault.claimable(token, alice), expected);
        assertEq(vault.claimable(token, bob), 0);
        // Moving the remaining tokens after the close changes nothing for either side.
        vm.prank(alice);
        IERC20(token).transfer(bob, bought - given);
        vm.roll(vm.getBlockNumber() + 1);
        assertEq(vault.claimable(token, alice), expected);
        assertEq(vault.claimable(token, bob), 0);
        uint256 balanceBefore = imd.balanceOf(alice);
        vm.expectEmit(true, true, false, true, address(vault));
        emit Claimed(token, alice, expected);
        vm.prank(alice);
        vault.claim(token);
        assertEq(imd.balanceOf(alice), balanceBefore + expected);
        vm.prank(alice);
        vm.expectRevert(KeelVault.NothingToClaim.selector);
        vault.claim(token);
        vm.prank(bob);
        vm.expectRevert(KeelVault.NothingToClaim.selector);
        vault.claim(token);
        // The forfeited third stays locked in the closed basket.
        assertEq(vault.project(token).basket, p.poolAtClose - expected);
        _solvent();
    }

    /// @dev Review finding eef2109a: a buyer who landed in the block before a pending notice and sold right
    /// after it kept a full basket claim. Exiting between notice and close now forfeits it.
    function testTransientBuyerAroundNoticeForfeitsClaim() public {
        _buy(alice, 1_000 ether);
        _deposit(10_000 ether);
        uint256 aliceEntitlementBefore = vault.project(token).basket;
        vm.roll(vm.getBlockNumber() + 1);
        // Block N-1: the notice is pending in the public mempool; bob buys a large position.
        uint256 bobBefore = imd.balanceOf(bob);
        uint256 bought = _buy(bob, 200_000 ether);
        vm.roll(vm.getBlockNumber() + 1);
        // Block N: the notice lands with snapshot N-1, which includes bob's purchase.
        vault.announceClose(token);
        vm.roll(vm.getBlockNumber() + 1);
        // Block N+1: bob exits completely.
        _sell(bob, bought);
        assertLt(imd.balanceOf(bob), bobBefore);
        vm.warp(block.timestamp + 31 days);
        vm.roll(vm.getBlockNumber() + 1);
        vault.close(token);
        KeelVault.Project memory p = vault.project(token);
        assertGe(p.poolAtClose, aliceEntitlementBefore);
        assertEq(vault.claimable(token, bob), 0);
        assertEq(vault.claimable(token, alice), p.poolAtClose);
        vm.prank(bob);
        vm.expectRevert(KeelVault.NothingToClaim.selector);
        vault.claim(token);
        vm.prank(alice);
        assertEq(vault.claim(token), p.poolAtClose);
        _solvent();
    }

    /// @dev A partial exit keeps rights only for what is still held at the close; claims stay within the pool.
    function testPartialExitBetweenNoticeAndCloseKeepsOnlyRetainedShare() public {
        uint256 aliceTokens = _buy(alice, 1_000 ether);
        _deposit(10_000 ether);
        vm.roll(vm.getBlockNumber() + 1);
        uint256 bought = _buy(bob, 50_000 ether);
        vm.roll(vm.getBlockNumber() + 1);
        vault.announceClose(token);
        vm.warp(block.timestamp + 31 days);
        vm.roll(vm.getBlockNumber() + 1);
        uint256 sold = bought / 2;
        _sell(bob, sold);
        uint256 retained = bought - sold;
        vm.roll(vm.getBlockNumber() + 1);
        vault.close(token);
        KeelVault.Project memory p = vault.project(token);
        assertEq(p.circulating, aliceTokens + retained);
        uint256 a = vault.claimable(token, alice);
        uint256 b = vault.claimable(token, bob);
        assertEq(a, p.poolAtClose * aliceTokens / (aliceTokens + retained));
        assertEq(b, p.poolAtClose * retained / (aliceTokens + retained));
        assertLe(a + b, p.poolAtClose);
        assertLe(p.poolAtClose - a - b, 1);
        vm.prank(alice);
        vault.claim(token);
        vm.prank(bob);
        vault.claim(token);
        assertEq(vault.project(token).totalClaimed, a + b);
        _solvent();
    }

    /// @dev Audit finding aab3704d: a buyer entering one block before close captured the basket.
    function testLateBuyerCannotCaptureHolderBasket() public {
        _buy(alice, 1_000 ether);
        _deposit(10_000 ether);
        vm.roll(vm.getBlockNumber() + 1);
        vault.announceClose(token);
        uint256 aliceEntitlementBefore = vault.project(token).basket;
        vm.warp(block.timestamp + 31 days);
        vm.roll(vm.getBlockNumber() + 1);
        // Bob buys a large position in block N-1 and the owner closes in block N.
        uint256 bobBefore = imd.balanceOf(bob);
        uint256 bought = _buy(bob, 200_000 ether);
        vm.roll(vm.getBlockNumber() + 1);
        vault.close(token);
        KeelVault.Project memory p = vault.project(token);
        assertGe(p.poolAtClose, aliceEntitlementBefore);
        assertEq(vault.claimable(token, bob), 0);
        assertEq(vault.claimable(token, alice), p.poolAtClose);
        vm.prank(bob);
        vm.expectRevert(KeelVault.NothingToClaim.selector);
        vault.claim(token);
        _sell(bob, bought);
        assertLt(imd.balanceOf(bob), bobBefore);
        vm.prank(alice);
        assertEq(vault.claim(token), p.poolAtClose);
        _solvent();
    }

    function testZeroCirculatingAndExcludedAddressesCannotClaim() public {
        _deposit(1 ether);
        _matureClose();
        assertEq(vault.project(token).circulating, 0);
        assertEq(vault.claimable(token, C.POOL_MANAGER), 0);
        assertEq(vault.claimable(token, C.DEAD), 0);
        vm.prank(alice);
        vm.expectRevert(KeelVault.NothingToClaim.selector);
        vault.claim(token);
        assertEq(vault.project(token).basket, 1 ether);
        _solvent();
    }

    function testDeadBalanceExcludedAndClaimsRoundDown() public {
        uint256 bought = _buy(alice, 100 ether);
        vm.startPrank(alice);
        IERC20(token).transfer(C.DEAD, bought / 3);
        IERC20(token).transfer(bob, bought / 3);
        vm.stopPrank();
        _deposit(123456789);
        _matureClose();
        KeelVault.Project memory p = vault.project(token);
        assertEq(p.circulating, bought - bought / 3);
        uint256 a = vault.claimable(token, alice);
        uint256 b = vault.claimable(token, bob);
        assertLe(a + b, p.poolAtClose);
        assertLe(p.poolAtClose - a - b, 1);
        vm.prank(alice);
        vault.claim(token);
        vm.prank(bob);
        vault.claim(token);
        assertEq(vault.project(token).totalClaimed, a + b);
        _solvent();
    }

    function testOneBuildingTokenUntilCloseThenRelaunch() public {
        vm.expectRevert(KeelFactory.CreatorHasBuildingToken.selector);
        vm.prank(creator);
        factory.launch("n", "s", JOB2, PROJECT, 3000, -100000, block.timestamp, "", META);
        _matureClose();
        assertEq(vault.buildingToken(creator), address(0));
        address next = _launch(creator, JOB2, 0, -100000);
        assertEq(vault.buildingToken(creator), next);
        assertTrue(next != token);
    }

    function testBuildingOnlyActionsAndUnauthorizedClaims() public {
        _deposit(1 ether);
        _matureClose();
        vm.expectRevert(KeelVault.NotBuilding.selector);
        vault.deposit(token, 1);
        vm.prank(verifier);
        vm.expectRevert(KeelVault.NotBuilding.selector);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 1);
        vm.prank(verifier);
        vm.expectRevert(KeelVault.NotBuilding.selector);
        vault.recordRun(token, bytes32(uint256(1)), COMMIT);
        vm.expectRevert(KeelVault.NotBuilding.selector);
        vault.setCreatorActive(token, true);
        vm.prank(creator);
        vm.expectRevert(KeelVault.NotBuilding.selector);
        vault.lowerCreatorShare(token, 0);
        vm.prank(alice);
        vm.expectRevert(KeelVault.Unauthorized.selector);
        vault.claimCreator(token);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.claimTeam();
    }

    function testIMDFailureRollsBackAccountingAndJobConsumption() public {
        _deposit(1 ether);
        imd.setFailTransfers(true);
        vm.prank(verifier);
        vm.expectRevert("IMD transfer failed");
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0.5 ether);
        assertFalse(vault.jobUsed(bytes32(uint256(1))));
        assertEq(vault.project(token).basket, 1 ether);
        assertEq(vault.totalOwed(), 1 ether);
        imd.setFailTransfers(false);
        imd.setTax(100);
        vm.expectRevert(KeelVault.Insolvent.selector);
        vault.deposit(token, 1 ether);
        assertEq(vault.totalOwed(), 1 ether);
    }

    function testReentrancyOnPayoutCannotWithdrawBasket() public {
        _deposit(1 ether);
        imd.setCallback(address(vault), abi.encodeCall(vault.deposit, (token, 1)));
        vm.prank(verifier);
        vault.reimburse(token, bytes32(uint256(1)), COMMIT, 0.5 ether);
        assertFalse(imd.callbackSucceeded());
        assertEq(vault.project(token).basket, 0.5 ether);
        _solvent();
    }

    function testFuzzClaimsNeverExceedPool(uint96 funding, uint16 split) public {
        uint256 amount = bound(funding, 1, 1e24);
        uint256 bought = _buy(alice, 100 ether);
        uint256 moved = bought * bound(split, 1, 9999) / 10000;
        vm.prank(alice);
        IERC20(token).transfer(bob, moved);
        _deposit(amount);
        _matureClose();
        uint256 pool = vault.project(token).poolAtClose;
        vm.prank(alice);
        uint256 a = vault.claim(token);
        vm.prank(bob);
        uint256 b = vault.claim(token);
        assertLe(a + b, pool);
        assertLe(pool - a - b, 1);
        _solvent();
    }
}
