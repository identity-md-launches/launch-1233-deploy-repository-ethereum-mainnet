// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {KeelTestBase} from "./helpers/KeelTestBase.sol";
import {V4Actor} from "./helpers/V4Actor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {KeelVault} from "src/KeelVault.sol";
import {KeelHook} from "src/KeelHook.sol";
import {KeelRouter} from "src/KeelRouter.sol";
import {KeelConstants as C} from "src/libraries/KeelConstants.sol";

/// @dev Models unsolicited ETH without requiring the router to have a receive function.
contract KeelForcedDonation {
    constructor(address recipient) payable {
        selfdestruct(payable(recipient));
    }
}

contract KeelRouteHandler is Test {
    KeelRouter public immutable router;
    KeelHook public immutable hook;
    KeelVault public immutable vault;
    address[4] public assets;
    address[3] public actors;
    uint256[4] public routerDonations;
    uint256 public vaultDonations;
    uint256 public hookDonations;
    uint256 public distributions;
    uint256 public roundTrips;
    uint256 public rejectedSwaps;
    uint256[4][4] public routeCalls;

    constructor(KeelRouter r, KeelHook h, KeelVault v, address[2] memory tokens, address[3] memory traders) {
        router = r;
        hook = h;
        vault = v;
        assets = [address(0), C.IMD, tokens[0], tokens[1]];
        actors = traders;
    }

    function _balance(address asset, address who) private view returns (uint256) {
        return asset == address(0) ? who.balance : IERC20(asset).balanceOf(who);
    }

    function _amount(uint256 assetIndex, address who, uint96 raw) private view returns (uint256) {
        uint256 available = _balance(assets[assetIndex], who) / 16;
        uint256 cap = assetIndex < 2 ? 10 ether : 1e22;
        if (available > cap) available = cap;
        // Small exact-input rounding is covered separately; these bounds keep every route executable.
        uint256 minimum = assetIndex < 2 ? 1e12 : 1e16;
        if (available < minimum) return 0;
        return bound(raw, minimum, available);
    }

    function _swap(uint256 from, uint256 to, address payer, address recipient, uint256 amount, uint256 minOut)
        private
        returns (uint256 output)
    {
        vm.prank(payer);
        output = router.swapExactInput{value: from == 0 ? amount : 0}(
            assets[from], assets[to], amount, minOut, block.timestamp, recipient
        );
    }

    function route(uint256 fromSeed, uint256 toSeed, uint256 payerSeed, uint256 recipientSeed, uint96 raw)
        external
    {
        uint256 from = fromSeed % 4;
        uint256 to = (from + 1 + toSeed % 3) % 4;
        address payer = actors[payerSeed % 3];
        address recipient = actors[recipientSeed % 3];
        uint256 amount = _amount(from, payer, raw);
        if (amount == 0) return;
        uint256 quote = router.quoteExactInput(assets[from], assets[to], amount);
        uint256 inputBefore = _balance(assets[from], payer);
        uint256 outputBefore = _balance(assets[to], recipient);
        uint256 output = _swap(from, to, payer, recipient, amount, quote);
        assertEq(output, quote, "quote must match actual pool execution including both hops");
        assertEq(_balance(assets[from], payer), inputBefore - amount, "only the payer funds the input");
        assertEq(_balance(assets[to], recipient), outputBefore + output, "recipient receives all output");
        ++routeCalls[from][to];
    }

    function donateERC20(uint256 assetSeed, uint256 actorSeed, uint96 raw, uint256 destination) external {
        uint256 index = 1 + assetSeed % 3;
        address who = actors[actorSeed % 3];
        uint256 amount = bound(raw, 0, IERC20(assets[index]).balanceOf(who) / 16);
        address recipient = address(router);
        if (index == 1 && destination % 3 == 1) {
            recipient = address(vault);
            vaultDonations += amount;
        } else if (index == 1 && destination % 3 == 2) {
            recipient = address(hook);
            hookDonations += amount;
        } else {
            routerDonations[index] += amount;
        }
        vm.prank(who);
        assertTrue(IERC20(assets[index]).transfer(recipient, amount));
    }

    function donateNative(uint96 raw) external {
        uint256 amount = bound(raw, 0, address(this).balance);
        new KeelForcedDonation{value: amount}(address(router));
        routerDonations[0] += amount;
    }

    function distribute(uint256 which) external {
        address token = assets[2 + which % 2];
        uint256 pending = hook.pending(token);
        uint256 owed = vault.totalOwed();
        hook.distribute(token);
        assertEq(hook.pending(token), 0);
        assertEq(vault.totalOwed(), owed + pending);
        hook.distribute(token);
        assertEq(vault.totalOwed(), owed + pending, "distribution must be idempotent without new fees");
        ++distributions;
    }

    function roundTrip(uint256 which, uint256 actorSeed, uint96 raw) external {
        uint256 tokenIndex = 2 + which % 2;
        address trader = actors[actorSeed % 3];
        uint256 amount = bound(raw, 1e12, 10 ether);
        uint256 imdBefore = IERC20(C.IMD).balanceOf(trader);
        uint256 tokensBefore = IERC20(assets[tokenIndex]).balanceOf(trader);
        uint256 bought = _swap(1, tokenIndex, trader, trader, amount, 1);
        uint256 returned = _swap(tokenIndex, 1, trader, trader, bought, 1);
        assertLe(returned, amount, "a buy/sell cycle cannot create IMD");
        assertEq(IERC20(C.IMD).balanceOf(trader), imdBefore - amount + returned);
        assertEq(IERC20(assets[tokenIndex]).balanceOf(trader), tokensBefore);
        ++roundTrips;
    }

    function rejectSlippage(uint256 fromSeed, uint256 toSeed, uint256 actorSeed, uint96 raw) external {
        uint256 from = fromSeed % 4;
        uint256 to = (from + 1 + toSeed % 3) % 4;
        address trader = actors[actorSeed % 3];
        uint256 amount = _amount(from, trader, raw);
        if (amount == 0) return;
        uint256 inputBefore = _balance(assets[from], trader);
        uint256 outputBefore = _balance(assets[to], trader);
        uint256 pending = hook.totalPending();
        vm.expectRevert(KeelRouter.Slippage.selector);
        _swap(from, to, trader, trader, amount, type(uint256).max);
        assertEq(_balance(assets[from], trader), inputBefore);
        assertEq(_balance(assets[to], trader), outputBefore);
        assertEq(hook.totalPending(), pending);
        ++rejectedSwaps;
    }

    function rejectForgedCallback(uint256 who) external {
        bytes memory forged = abi.encode(KeelRouter.Request(C.IMD, assets[2], 1 ether, 1, actors[who % 3]));
        vm.prank(C.POOL_MANAGER);
        vm.expectRevert(KeelRouter.InvalidCallback.selector);
        router.unlockCallback(forged);
    }
}

/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 96
/// forge-config: default.invariant.fail-on-revert = true
contract KeelRouteInvariantTest is KeelTestBase {
    KeelRouteHandler internal routeHandler;
    V4Actor internal lp;
    address internal second;
    uint256 internal initialIMD;
    uint256 internal initialETH;

    function setUp() public override {
        super.setUp();
        second = _launch(bob, JOB2, 8000, -90000);
        PoolKey memory key =
            PoolKey(Currency.wrap(address(0)), Currency.wrap(C.IMD), 10000, 200, IHooks(address(0)));
        manager.initialize(key, uint160(1 << 96));
        lp = new V4Actor(IPoolManager(C.POOL_MANAGER));
        imd.mint(address(lp), 1e27);
        vm.deal(address(lp), 1e27);
        lp.modify(key, IPoolManager.ModifyLiquidityParams(-20000, 20000, 1e24, bytes32(0)));
        router.setEthPool(10000, 200);
        imd.mint(creator, 1e27);
        address[3] memory traders = [alice, bob, creator];
        for (uint256 i; i < 3; ++i) {
            vm.deal(traders[i], 1000 ether);
            vm.startPrank(traders[i]);
            imd.approve(address(router), type(uint256).max);
            router.swapExactInput(C.IMD, token, 1000 ether, 1, block.timestamp, traders[i]);
            router.swapExactInput(C.IMD, second, 1000 ether, 1, block.timestamp, traders[i]);
            IERC20(token).approve(address(router), type(uint256).max);
            IERC20(second).approve(address(router), type(uint256).max);
            vm.stopPrank();
        }
        routeHandler = new KeelRouteHandler(router, hook, vault, [token, second], traders);
        vm.deal(address(routeHandler), 100 ether);
        initialIMD = imd.totalSupply();
        initialETH = _trackedETH();
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = routeHandler.route.selector;
        selectors[1] = routeHandler.donateERC20.selector;
        selectors[2] = routeHandler.donateNative.selector;
        selectors[3] = routeHandler.distribute.selector;
        selectors[4] = routeHandler.roundTrip.selector;
        selectors[5] = routeHandler.rejectSlippage.selector;
        selectors[6] = routeHandler.rejectForgedCallback.selector;
        targetContract(address(routeHandler));
        targetSelector(FuzzSelector(address(routeHandler), selectors));
    }

    function invariantRouterRetainsOnlyUnsolicitedDonations() public view {
        assertEq(address(router).balance, routeHandler.routerDonations(0));
        assertEq(imd.balanceOf(address(router)), routeHandler.routerDonations(1));
        assertEq(IERC20(token).balanceOf(address(router)), routeHandler.routerDonations(2));
        assertEq(IERC20(second).balanceOf(address(router)), routeHandler.routerDonations(3));
    }

    function invariantFeesStayBackedAndDonationsDoNotBecomeLiabilities() public view {
        uint256 pending = hook.pending(token) + hook.pending(second);
        assertEq(pending, hook.totalPending());
        assertEq(manager.balanceOf(address(hook), uint256(uint160(C.IMD))), pending);
        assertEq(imd.balanceOf(address(hook)), routeHandler.hookDonations());
        KeelVault.Project memory a = vault.project(token);
        KeelVault.Project memory b = vault.project(second);
        uint256 owed = a.basket + a.creatorAccrued + b.basket + b.creatorAccrued + vault.teamAccrued();
        assertEq(vault.totalOwed(), owed);
        assertEq(imd.balanceOf(address(vault)), owed + routeHandler.vaultDonations());
    }

    function invariantSupplyAndNativeValueAreConservedAcrossAllRoutes() public view {
        uint256 imdHeld = imd.balanceOf(C.POOL_MANAGER) + imd.balanceOf(address(lp))
            + imd.balanceOf(address(router)) + imd.balanceOf(address(hook)) + imd.balanceOf(address(vault))
            + imd.balanceOf(address(this));
        for (uint256 i; i < 3; ++i) {
            imdHeld += imd.balanceOf(routeHandler.actors(i));
        }
        assertEq(imdHeld, initialIMD);
        assertEq(imd.totalSupply(), initialIMD);
        assertEq(_trackedETH(), initialETH);
        for (uint256 i; i < 2; ++i) {
            IERC20 t = IERC20(i == 0 ? token : second);
            uint256 held = t.balanceOf(C.POOL_MANAGER) + t.balanceOf(C.DEAD) + t.balanceOf(address(router));
            for (uint256 j; j < 3; ++j) {
                held += t.balanceOf(routeHandler.actors(j));
            }
            assertEq(held, C.SUPPLY);
            assertEq(t.totalSupply(), C.SUPPLY);
            assertEq(t.balanceOf(address(factory)), 0);
        }
    }

    function _trackedETH() internal view returns (uint256) {
        return C.POOL_MANAGER.balance + address(lp).balance + address(router).balance
            + address(routeHandler).balance + alice.balance + bob.balance + creator.balance;
    }

    function testHandlerExercisesEveryRouteAndDonationDestination() public {
        for (uint256 from; from < 4; ++from) {
            for (uint256 offset; offset < 3; ++offset) {
                routeHandler.route(from, offset, 0, 1, 1 ether);
                assertEq(routeHandler.routeCalls(from, (from + 1 + offset) % 4), 1);
            }
        }
        routeHandler.donateNative(1 ether);
        routeHandler.donateERC20(0, 0, 1 ether, 0);
        routeHandler.donateERC20(0, 0, 1 ether, 1);
        routeHandler.donateERC20(0, 0, 1 ether, 2);
        routeHandler.donateERC20(1, 0, 1 ether, 0);
        routeHandler.donateERC20(2, 0, 1 ether, 0);
        routeHandler.distribute(0);
        routeHandler.distribute(1);
        routeHandler.roundTrip(0, 0, 1 ether);
        routeHandler.roundTrip(1, 1, 1 ether);
        routeHandler.rejectSlippage(0, 1, 0, 1 ether);
        routeHandler.rejectForgedCallback(0);
        assertEq(routeHandler.distributions(), 2);
        assertEq(routeHandler.roundTrips(), 2);
        assertEq(routeHandler.rejectedSwaps(), 1);
        invariantRouterRetainsOnlyUnsolicitedDonations();
        invariantFeesStayBackedAndDonationsDoNotBecomeLiabilities();
        invariantSupplyAndNativeValueAreConservedAcrossAllRoutes();
    }
}
