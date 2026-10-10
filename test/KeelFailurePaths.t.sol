// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {KeelTestBase} from "./helpers/KeelTestBase.sol";
import {V4Actor} from "./helpers/V4Actor.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {CustomRevert} from "v4-core/src/libraries/CustomRevert.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {KeelFactory} from "src/KeelFactory.sol";
import {KeelVault} from "src/KeelVault.sol";
import {KeelHook} from "src/KeelHook.sol";
import {KeelRouter} from "src/KeelRouter.sol";
import {KeelConstants as C} from "src/libraries/KeelConstants.sol";

contract KeelNativeRecipient {
    error RefusesETH();
    bool public rejecting = true;
    bool public attempted;
    bool public reentered;
    bytes public reason;
    KeelRouter public immutable router;

    constructor(KeelRouter router_) {
        router = router_;
    }

    function acceptETH() external {
        rejecting = false;
    }

    receive() external payable {
        if (rejecting) revert RefusesETH();
        attempted = true;
        (reentered, reason) = address(router)
            .call(
                abi.encodeCall(
                    router.swapExactInput,
                    (C.IMD, address(0), uint256(1), uint256(1), block.timestamp, address(this))
                )
            );
    }
}

contract KeelFailurePathsTest is KeelTestBase {
    using PoolIdLibrary for PoolKey;

    function testEveryAdministrativeEntryPointRejectsNonOwner() public {
        _unauthorized(address(factory), abi.encodeCall(factory.setSigner, (alice)));
        _unauthorized(address(factory), abi.encodeCall(factory.revokeSigner, ()));
        _unauthorized(address(factory), abi.encodeCall(factory.setStartTickBounds, (int24(-1), int24(1))));
        _unauthorized(address(factory), abi.encodeCall(factory.setPaused, (true)));
        _unauthorized(address(vault), abi.encodeCall(vault.wire, (address(factory))));
        _unauthorized(address(vault), abi.encodeCall(vault.setVerifier, (alice)));
        _unauthorized(address(vault), abi.encodeCall(vault.revokeVerifier, ()));
        _unauthorized(address(vault), abi.encodeCall(vault.setRunPrice, (uint256(1 ether))));
        _unauthorized(address(vault), abi.encodeCall(vault.setCreatorActive, (token, false)));
        _unauthorized(address(vault), abi.encodeCall(vault.announceClose, (token)));
        _unauthorized(address(vault), abi.encodeCall(vault.cancelClose, (token)));
        _unauthorized(address(vault), abi.encodeCall(vault.close, (token)));
        _unauthorized(address(vault), abi.encodeCall(vault.claimTeam, ()));
        _unauthorized(address(router), abi.encodeCall(router.setEthPool, (uint256(10000), uint256(200))));
        address[3] memory ownables = [address(factory), address(vault), address(router)];
        for (uint256 i; i < ownables.length; ++i) {
            _unauthorized(ownables[i], abi.encodeWithSignature("transferOwnership(address)", alice));
            _unauthorized(ownables[i], abi.encodeWithSignature("renounceOwnership()"));
            _unauthorized(ownables[i], abi.encodeWithSignature("acceptOwnership()"));
        }
        assertEq(factory.signer(), signer);
        assertEq(vault.verifier(), verifier);
        assertEq(vault.runPrice(), 0.5 ether);
        assertFalse(factory.paused());
        assertTrue(vault.project(token).creatorActive);
    }

    function _unauthorized(address target, bytes memory data) internal {
        vm.prank(alice);
        (bool success, bytes memory reason) = target.call(data);
        assertFalse(success);
        assertEq(reason, abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
    }

    function testPendingOwnerCannotConfigureUntilAcceptanceAndOldOwnerLosesControl() public {
        factory.transferOwnership(bob);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        factory.setPaused(true);
        factory.transferOwnership(alice);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        factory.acceptOwnership();
        vm.prank(alice);
        factory.acceptOwnership();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(this)));
        factory.setPaused(true);
        vm.prank(alice);
        factory.setPaused(true);
        assertTrue(factory.paused());
        assertEq(factory.pendingOwner(), address(0));
    }

    function testHolderPayoutFailureLeavesClaimAvailableForRetry() public {
        _buy(alice, 100 ether);
        _deposit(2 ether);
        _matureClose();
        uint256 entitlement = vault.claimable(token, alice);
        uint256 totalOwed = vault.totalOwed();
        uint256 beforeBalance = imd.balanceOf(alice);
        imd.setFailTransfers(true);
        vm.prank(alice);
        vm.expectRevert("IMD transfer failed");
        vault.claim(token);
        assertFalse(vault.claimed(token, alice));
        assertEq(vault.project(token).totalClaimed, 0);
        assertEq(vault.claimable(token, alice), entitlement);
        assertEq(vault.totalOwed(), totalOwed);
        assertEq(imd.balanceOf(alice), beforeBalance);
        imd.setFailTransfers(false);
        vm.prank(alice);
        assertEq(vault.claim(token), entitlement);
        assertEq(imd.balanceOf(alice), beforeBalance + entitlement);
        assertTrue(vault.claimed(token, alice));
        assertEq(vault.totalOwed(), totalOwed - entitlement);
    }

    function testCreatorAndTeamPayoutFailuresPreserveEveryLiability() public {
        _buy(alice, 100 ether);
        hook.distribute(token);
        uint256 owed = vault.totalOwed();
        uint256 creatorDue = vault.project(token).creatorAccrued;
        uint256 teamDue = vault.teamAccrued();
        imd.setFailTransfers(true);
        vm.prank(creator);
        vm.expectRevert("IMD transfer failed");
        vault.claimCreator(token);
        vm.expectRevert("IMD transfer failed");
        vault.claimTeam();
        assertEq(vault.project(token).creatorAccrued, creatorDue);
        assertEq(vault.teamAccrued(), teamDue);
        assertEq(vault.totalOwed(), owed);
        imd.setFailTransfers(false);
        uint256 creatorBefore = imd.balanceOf(creator);
        uint256 teamBefore = imd.balanceOf(address(this));
        vm.prank(creator);
        assertEq(vault.claimCreator(token), creatorDue);
        assertEq(vault.claimTeam(), teamDue);
        assertEq(imd.balanceOf(creator), creatorBefore + creatorDue);
        assertEq(imd.balanceOf(address(this)), teamBefore + teamDue);
        assertEq(vault.totalOwed(), owed - creatorDue - teamDue);
        vm.prank(creator);
        vm.expectRevert(KeelVault.NothingToClaim.selector);
        vault.claimCreator(token);
        vm.expectRevert(KeelVault.NothingToClaim.selector);
        vault.claimTeam();
    }

    function testFeeFlushFailureCannotChangeShareStatusOrClosePhase() public {
        _buy(alice, 100 ether);
        vm.roll(vm.getBlockNumber() + 1);
        vault.announceClose(token);
        vm.warp(block.timestamp + 31 days);
        uint256 snapshot = vault.project(token).snapshotBlock;
        imd.setFailTransfers(true);
        vm.prank(creator);
        vm.expectPartialRevert(CustomRevert.WrappedError.selector);
        vault.lowerCreatorShare(token, 0);
        vm.expectPartialRevert(CustomRevert.WrappedError.selector);
        vault.setCreatorActive(token, false);
        vm.expectPartialRevert(CustomRevert.WrappedError.selector);
        vault.close(token);
        KeelVault.Project memory p = vault.project(token);
        assertEq(p.creatorBps, 3000);
        assertTrue(p.creatorActive);
        assertEq(uint256(p.phase), uint256(KeelVault.Phase.Building));
        assertEq(p.snapshotBlock, snapshot);
        assertEq(vault.buildingToken(creator), token);
        assertEq(hook.pending(token), 1 ether);
        assertEq(hook.totalPending(), 1 ether);
        assertEq(manager.balanceOf(address(hook), uint256(uint160(C.IMD))), 1 ether);
        assertEq(vault.totalOwed(), 0);
        imd.setFailTransfers(false);
        vault.close(token);
        assertEq(uint256(vault.project(token).phase), uint256(KeelVault.Phase.Closed));
        assertEq(vault.totalOwed(), 1 ether);
        assertEq(hook.totalPending(), 0);
    }

    function testTaxedRouterInputRevertsWithoutBurningTokensOrSpendingAllowance() public {
        uint256 balance = imd.balanceOf(alice);
        uint256 supply = imd.totalSupply();
        vm.prank(alice);
        imd.approve(address(router), 100 ether);
        imd.setTax(100);
        vm.prank(alice);
        vm.expectRevert(KeelRouter.SettlementMismatch.selector);
        router.swapExactInput(C.IMD, token, 100 ether, 1, block.timestamp, bob);
        assertEq(imd.balanceOf(alice), balance);
        assertEq(imd.totalSupply(), supply);
        assertEq(imd.allowance(alice, address(router)), 100 ether);
        assertEq(imd.balanceOf(address(router)), 0);
        assertEq(hook.pending(token), 0);
        assertEq(IERC20(token).balanceOf(bob), 0);
        imd.setTax(0);
        vm.prank(alice);
        uint256 output = router.swapExactInput(C.IMD, token, 100 ether, 1, block.timestamp, bob);
        assertEq(IERC20(token).balanceOf(bob), output);
        assertEq(IERC20(token).balanceOf(alice), 0);
        assertEq(imd.allowance(alice, address(router)), 0);
    }

    function testNativeRecipientFailureRevertsBothHopsAndCanBeRetried() public {
        PoolKey memory ethKey = _configureEthPool();
        uint256 bought = _buy(alice, 100 ether);
        KeelNativeRecipient recipient = new KeelNativeRecipient(router);
        vm.prank(alice);
        IERC20(token).approve(address(router), bought);
        uint256 amount = bought / 2;
        uint256 quoted = router.quoteExactInput(token, address(0), amount);
        bytes32 beforeState = _swapState(ethKey, address(recipient));
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(recipient),
                bytes4(0),
                abi.encodeWithSelector(KeelNativeRecipient.RefusesETH.selector),
                abi.encodePacked(CurrencyLibrary.NativeTransferFailed.selector)
            )
        );
        router.swapExactInput(token, address(0), amount, quoted, block.timestamp, address(recipient));
        assertEq(_swapState(ethKey, address(recipient)), beforeState);
        recipient.acceptETH();
        vm.prank(alice);
        uint256 output =
            router.swapExactInput(token, address(0), amount, quoted, block.timestamp, address(recipient));
        assertEq(output, quoted);
        assertEq(address(recipient).balance, output);
        assertEq(IERC20(token).balanceOf(alice), bought - amount);
        assertEq(IERC20(token).allowance(alice, address(router)), bought - amount);
        assertTrue(recipient.attempted());
        assertFalse(recipient.reentered());
        assertEq(
            recipient.reason(), abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(address(router).balance, 0);
        assertEq(imd.balanceOf(address(router)), 0);
        assertEq(IERC20(token).balanceOf(address(router)), 0);
    }

    function _configureEthPool() internal returns (PoolKey memory key) {
        key = PoolKey(Currency.wrap(address(0)), Currency.wrap(C.IMD), 10000, 200, IHooks(address(0)));
        manager.initialize(key, TickMath.getSqrtPriceAtTick(0));
        V4Actor lp = new V4Actor(IPoolManager(C.POOL_MANAGER));
        imd.mint(address(lp), 1e27);
        vm.deal(address(lp), 1e27);
        lp.modify(key, IPoolManager.ModifyLiquidityParams(-20000, 20000, 1e24, bytes32(0)));
        router.setEthPool(10000, 200);
    }

    function _swapState(PoolKey memory ethKey, address recipient) internal view returns (bytes32) {
        (uint160 ethPrice, int24 ethTick,,) = StateLibrary.getSlot0(manager, ethKey.toId());
        (uint160 tokenPrice, int24 tokenTick,,) =
            StateLibrary.getSlot0(manager, factory.poolKey(token).toId());
        bytes32 poolState = keccak256(abi.encode(ethPrice, ethTick, tokenPrice, tokenTick));
        bytes32 feeState = keccak256(
            abi.encode(
                hook.pending(token),
                hook.totalPending(),
                manager.balanceOf(address(hook), uint256(uint160(C.IMD)))
            )
        );
        bytes32 actorState = keccak256(
            abi.encode(
                IERC20(token).balanceOf(alice),
                IERC20(token).allowance(alice, address(router)),
                recipient.balance,
                address(router).balance,
                imd.balanceOf(address(router)),
                IERC20(token).balanceOf(address(router))
            )
        );
        return keccak256(
            abi.encode(
                poolState,
                feeState,
                actorState,
                IERC20(token).balanceOf(C.POOL_MANAGER),
                imd.balanceOf(C.POOL_MANAGER),
                C.POOL_MANAGER.balance
            )
        );
    }

    function testHookRejectsMalformedAmountsPoolsAndDuplicateRegistration() public {
        PoolKey memory key = factory.poolKey(token);
        vm.startPrank(C.POOL_MANAGER);
        vm.expectRevert(KeelHook.InvalidPool.selector);
        hook.beforeInitialize(address(factory), key, TickMath.getSqrtPriceAtTick(-100000));
        int256[3] memory invalid = [int256(0), int256(type(int128).max) + 1, int256(type(int128).min)];
        for (uint256 i; i < invalid.length; ++i) {
            vm.expectRevert(KeelHook.InvalidAmount.selector);
            hook.beforeSwap(
                alice, key, IPoolManager.SwapParams(false, invalid[i], TickMath.MAX_SQRT_PRICE - 1), ""
            );
        }
        key.fee = 1;
        vm.expectRevert(KeelHook.InvalidPool.selector);
        hook.beforeSwap(alice, key, IPoolManager.SwapParams(false, -1, TickMath.MAX_SQRT_PRICE - 1), "");
        vm.expectRevert(KeelHook.InvalidPool.selector);
        hook.afterSwap(
            alice,
            key,
            IPoolManager.SwapParams(false, -1, TickMath.MAX_SQRT_PRICE - 1),
            BalanceDelta.wrap(0),
            ""
        );
        vm.expectRevert(KeelHook.InvalidPool.selector);
        hook.beforeAddLiquidity(address(factory), key, IPoolManager.ModifyLiquidityParams(0, 200, 1, 0), "");
        vm.stopPrank();
        vm.expectRevert(KeelHook.InvalidPool.selector);
        hook.distribute(address(implementation));
        assertEq(hook.totalPending(), 0);
    }

    function testAllHookCallbacksAuthenticateManagerBeforeReadingArguments() public {
        PoolKey memory key = factory.poolKey(token);
        IPoolManager.SwapParams memory params = IPoolManager.SwapParams(false, -100, 1);
        vm.startPrank(alice);
        vm.expectRevert(KeelHook.Unauthorized.selector);
        hook.beforeInitialize(address(factory), key, 1);
        vm.expectRevert(KeelHook.Unauthorized.selector);
        hook.beforeAddLiquidity(address(factory), key, IPoolManager.ModifyLiquidityParams(0, 200, 1, 0), "");
        vm.expectRevert(KeelHook.Unauthorized.selector);
        hook.beforeSwap(address(factory), key, params, "");
        vm.expectRevert(KeelHook.Unauthorized.selector);
        hook.afterSwap(address(factory), key, params, BalanceDelta.wrap(0), "");
        vm.expectRevert(KeelHook.Unauthorized.selector);
        hook.unlockCallback("");
        vm.expectRevert(KeelFactory.InvalidCallback.selector);
        factory.unlockCallback("");
        vm.expectRevert(KeelRouter.InvalidCallback.selector);
        router.unlockCallback("");
        vm.stopPrank();
    }

    function testRouterAmountRecipientAndPoolParameterEdges() public {
        uint256 maxInput = uint256(uint128(type(int128).max));
        vm.expectRevert(KeelRouter.InvalidAmount.selector);
        router.quoteExactInput(C.IMD, token, maxInput + 1);
        vm.expectRevert(KeelRouter.InvalidAmount.selector);
        router.swapExactInput(C.IMD, token, maxInput + 1, 1, block.timestamp, alice);
        vm.expectRevert(KeelRouter.InvalidAddress.selector);
        router.swapExactInput(C.IMD, token, 1, 1, block.timestamp, address(0));
        vm.expectRevert(KeelRouter.InvalidAddress.selector);
        router.swapExactInput(C.IMD, token, 1, 1, block.timestamp, C.POOL_MANAGER);
        vm.expectRevert(KeelRouter.InvalidPool.selector);
        router.setEthPool(1_000_000, 200);
        vm.expectRevert(KeelRouter.InvalidPool.selector);
        router.setEthPool(10000, 0);
        vm.expectRevert(KeelRouter.InvalidPool.selector);
        router.setEthPool(10000, 32768);
        assertFalse(router.ethPoolConfigured());
        assertEq(hook.totalPending(), 0);
    }
}
