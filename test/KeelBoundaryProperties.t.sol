// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {KeelTestBase} from "./helpers/KeelTestBase.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {KeelFactory} from "src/KeelFactory.sol";
import {KeelToken} from "src/KeelToken.sol";
import {KeelConstants as C} from "src/libraries/KeelConstants.sol";

contract KeelBoundaryPropertiesTest is KeelTestBase {
    /// forge-config: default.fuzz.runs = 1000
    function testFuzzLaunchAcrossEntireUsableTickDomain(int24 rawTick, uint16 rawShare) public {
        int24 tick = int24(bound(rawTick, C.MIN_TICK, 349199));
        uint256 share = bound(rawShare, 0, 8000);
        _checkLaunchAt(tick, share);
    }

    function testLowestStartTickIsLaunchable() public {
        _checkLaunchAt(C.MIN_TICK, 0);
    }

    function testHighestStartTickIsLaunchable() public {
        _checkLaunchAt(349199, 8000);
    }

    function _checkLaunchAt(int24 tick, uint256 share) internal {
        factory.setStartTickBounds(C.MIN_TICK, 349199);
        address launched = _launch(bob, JOB2, share, tick);
        assertTrue(factory.isLaunched(launched));
        assertEq(factory.tokenForJob(keccak256(bytes(JOB2))), launched);
        assertEq(vault.buildingToken(bob), launched);
        assertEq(vault.project(launched).creatorBps, share);
        // Geometric range constraints rather than duplicating the factory's rounding formula.
        int24 lower = factory.lowerTick(launched);
        assertGt(lower, tick);
        assertLe(lower, tick + C.TICK_SPACING);
        assertEq(lower % C.TICK_SPACING, 0);
        assertGt(factory.lockedLiquidity(launched), 0);
        assertLt(uint160(launched), uint160(C.IMD));
        assertEq(IERC20(launched).totalSupply(), C.SUPPLY);
        assertEq(IERC20(launched).balanceOf(address(factory)), 0);
        assertEq(IERC20(launched).balanceOf(C.POOL_MANAGER) + IERC20(launched).balanceOf(C.DEAD), C.SUPPLY);
        vm.prank(alice);
        vm.expectRevert(KeelToken.AlreadyInitialized.selector);
        KeelToken(launched).initialize("unauthorized", "MINT", alice);
    }

    function testOneWeiAndFeeRoundingBoundariesKeepAllFeesBacked() public {
        uint256[10] memory inputs = [uint256(1), 2, 98, 99, 100, 101, 199, 200, 201, 1000];
        uint256 totalPaid;
        uint256 expectedFees;
        uint256 expectedTokens;
        uint256 aliceBefore = imd.balanceOf(alice);
        for (uint256 i; i < inputs.length; ++i) {
            uint256 amount = inputs[i];
            uint256 quoted = router.quoteExactInput(C.IMD, token, amount);
            uint256 bought = _buy(alice, amount);
            assertEq(bought, quoted);
            totalPaid += amount;
            expectedTokens += bought;
            expectedFees += amount / 100;
            assertEq(hook.pending(token), expectedFees);
            assertEq(manager.balanceOf(address(hook), uint256(uint160(C.IMD))), expectedFees);
        }
        assertEq(imd.balanceOf(alice), aliceBefore - totalPaid);
        assertEq(IERC20(token).balanceOf(alice), expectedTokens);
        hook.distribute(token);
        assertEq(vault.totalOwed(), expectedFees);
        assertEq(imd.balanceOf(address(vault)), expectedFees);
        assertEq(hook.pending(token), 0);
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzzRepeatedSmallRoundTripsCannotExtractIMD(uint32 raw, uint8 count) public {
        uint256 input = bound(raw, 100, 1e6);
        uint256 repetitions = bound(count, 1, 12);
        uint256 initialBalance = imd.balanceOf(alice);
        for (uint256 i; i < repetitions; ++i) {
            uint256 bought = _buy(alice, input);
            uint256 returned = _sell(alice, bought);
            assertLe(returned, input);
            assertEq(IERC20(token).balanceOf(alice), 0);
        }
        assertLe(imd.balanceOf(alice), initialBalance);
        assertEq(imd.balanceOf(address(router)), 0);
        assertEq(IERC20(token).balanceOf(address(router)), 0);
        hook.distribute(token);
        assertEq(imd.balanceOf(address(vault)), vault.totalOwed());
    }

    function testLaunchAcceptsExactNameAndSymbolLimitsButRejectsOneByteMore() public {
        string memory name = _ascii(128);
        string memory symbol = _ascii(32);
        uint256 deadline = block.timestamp;
        vm.startPrank(bob);
        vm.expectRevert(KeelFactory.InvalidName.selector);
        factory.launch(_ascii(129), symbol, JOB2, PROJECT, 0, -100000, deadline, "", META);
        vm.expectRevert(KeelFactory.InvalidName.selector);
        factory.launch(name, _ascii(33), JOB2, PROJECT, 0, -100000, deadline, "", META);
        vm.expectRevert(KeelFactory.InvalidName.selector);
        factory.launch(name, "", JOB2, PROJECT, 0, -100000, deadline, "", META);
        vm.stopPrank();
        bytes memory signature = _signature(bob, name, symbol, JOB2, PROJECT, -100000, deadline);
        vm.prank(bob);
        address launched = factory.launch(name, symbol, JOB2, PROJECT, 0, -100000, deadline, signature, META);
        assertEq(KeelToken(launched).name(), name);
        assertEq(KeelToken(launched).symbol(), symbol);
        assertTrue(factory.isLaunched(launched), "deadline is inclusive");
    }

    function testMalleableSignatureIsRejectedWithoutConsumingJobOrCreatorSlot() public {
        uint256 deadline = block.timestamp + 1 days;
        bytes32 digest = factory.launchDigest(
            bob,
            keccak256(bytes(JOB2)),
            keccak256(bytes(PROJECT)),
            keccak256("Keel Project"),
            keccak256("KEEL"),
            -100000,
            deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, digest);
        uint256 curveOrder = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory malleated =
            abi.encodePacked(r, bytes32(curveOrder - uint256(s)), uint8(v == 27 ? 28 : 27));
        vm.prank(bob);
        vm.expectRevert(KeelFactory.InvalidSignature.selector);
        factory.launch("Keel Project", "KEEL", JOB2, PROJECT, 0, -100000, deadline, malleated, META);
        assertEq(factory.tokenForJob(keccak256(bytes(JOB2))), address(0));
        assertEq(vault.buildingToken(bob), address(0));
        vm.prank(bob);
        address launched = factory.launch(
            "Keel Project", "KEEL", JOB2, PROJECT, 0, -100000, deadline, abi.encodePacked(r, s, v), META
        );
        assertTrue(factory.isLaunched(launched));
    }

    function _ascii(uint256 length) private pure returns (string memory) {
        bytes memory value = new bytes(length);
        for (uint256 i; i < length; ++i) {
            value[i] = "a";
        }
        return string(value);
    }
}
