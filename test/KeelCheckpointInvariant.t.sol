// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {KeelToken} from "src/KeelToken.sol";
import {KeelConstants as C} from "src/libraries/KeelConstants.sol";

/// @dev The model records transfer intent, never copies balances/checkpoints from KeelToken.
contract KeelCheckpointHandler is Test {
    KeelToken public immutable token;
    address[4] public actors;
    uint256[4] public balances;
    uint256[4][4] public allowances;
    uint256[8] public sealedBlocks;
    uint256[8] public sealedThrough;
    uint256[4][8] public sealedBalances;
    uint256 public seals;
    uint256 public transfers;
    uint256 public delegatedTransfers;
    uint256 public rejectedCalls;

    constructor(KeelToken token_, address[4] memory actors_) {
        token = token_;
        actors = actors_;
        balances[0] = C.SUPPLY;
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 raw) external {
        uint256 from = fromSeed % 4;
        uint256 to = toSeed % 4;
        uint256 amount = bound(raw, 0, balances[from]);
        vm.prank(actors[from]);
        assertTrue(token.transfer(actors[to], amount));
        balances[from] -= amount;
        balances[to] += amount;
        ++transfers;
    }

    function approve(uint256 fromSeed, uint256 spenderSeed, uint256 raw, bool unlimited) external {
        uint256 from = fromSeed % 4;
        uint256 spender = spenderSeed % 4;
        uint256 amount = unlimited ? type(uint256).max : bound(raw, 0, C.SUPPLY);
        vm.prank(actors[from]);
        assertTrue(token.approve(actors[spender], amount));
        allowances[from][spender] = amount;
    }

    function transferFrom(uint256 fromSeed, uint256 spenderSeed, uint256 toSeed, uint256 raw) external {
        uint256 from = fromSeed % 4;
        uint256 spender = spenderSeed % 4;
        uint256 to = toSeed % 4;
        uint256 available = balances[from];
        uint256 allowed = allowances[from][spender];
        if (allowed < available) available = allowed;
        uint256 amount = bound(raw, 0, available);
        vm.prank(actors[spender]);
        assertTrue(token.transferFrom(actors[from], actors[to], amount));
        balances[from] -= amount;
        balances[to] += amount;
        if (allowed != type(uint256).max) allowances[from][spender] -= amount;
        ++delegatedTransfers;
    }

    function sealBlock(uint16 gap) external {
        uint256 slot = seals % 8;
        uint256 currentBlock = vm.getBlockNumber();
        uint256 nextBlock = currentBlock + bound(gap, 1, 1000);
        sealedBlocks[slot] = currentBlock;
        sealedThrough[slot] = nextBlock - 1;
        for (uint256 i; i < 4; ++i) {
            sealedBalances[slot][i] = balances[i];
        }
        ++seals;
        vm.roll(nextBlock);
    }

    function rejectOverdraw(uint256 fromSeed) external {
        uint256 from = fromSeed % 4;
        uint256 available = balances[from];
        vm.prank(actors[from]);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientBalance.selector, actors[from], available, available + 1
            )
        );
        token.transfer(actors[(from + 1) % 4], available + 1);
        ++rejectedCalls;
    }

    function rejectUnapprovedSpend(uint256 fromSeed, uint256 spenderSeed) external {
        uint256 from = fromSeed % 4;
        uint256 spender = spenderSeed % 4;
        vm.prank(actors[from]);
        token.approve(actors[spender], 0);
        allowances[from][spender] = 0;
        vm.prank(actors[spender]);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, actors[spender], uint256(0), uint256(1)
            )
        );
        token.transferFrom(actors[from], actors[spender], 1);
        ++rejectedCalls;
    }

    function rejectReinitialization(uint256 who) external {
        vm.prank(actors[who % 4]);
        vm.expectRevert(KeelToken.AlreadyInitialized.selector);
        token.initialize("second mint", "NO", actors[who % 4]);
        ++rejectedCalls;
    }
}

/// forge-config: default.invariant.runs = 256
/// forge-config: default.invariant.depth = 96
/// forge-config: default.invariant.fail-on-revert = true
contract KeelCheckpointInvariantTest is Test {
    KeelToken internal template;
    KeelToken internal token;
    KeelCheckpointHandler internal handler;
    address[4] internal actors;

    function setUp() public {
        vm.roll(100);
        actors = [
            makeAddr("checkpoint alice"),
            makeAddr("checkpoint bob"),
            makeAddr("checkpoint carol"),
            makeAddr("checkpoint dave")
        ];
        template = new KeelToken();
        token = KeelToken(Clones.clone(address(template)));
        token.initialize("Checkpoint model", "CHECK", actors[0]);
        handler = new KeelCheckpointHandler(token, actors);
        // Preserve the initial mint block independently of later same-block transfers.
        handler.sealBlock(1);
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = handler.transfer.selector;
        selectors[1] = handler.approve.selector;
        selectors[2] = handler.transferFrom.selector;
        selectors[3] = handler.sealBlock.selector;
        selectors[4] = handler.rejectOverdraw.selector;
        selectors[5] = handler.rejectUnapprovedSpend.selector;
        selectors[6] = handler.rejectReinitialization.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector(address(handler), selectors));
    }

    function invariantBalancesAndAllowancesMatchIndependentLedger() public view {
        uint256 total;
        for (uint256 i; i < 4; ++i) {
            assertEq(token.balanceOf(actors[i]), handler.balances(i));
            total += token.balanceOf(actors[i]);
            for (uint256 j; j < 4; ++j) {
                assertEq(token.allowance(actors[i], actors[j]), handler.allowances(i, j));
            }
        }
        assertEq(total, C.SUPPLY);
        assertEq(token.totalSupply(), C.SUPPLY);
        assertEq(token.balanceOf(address(0)), 0);
        assertEq(template.totalSupply(), 0);
    }

    function invariantPastBalancesNeverChangeAfterLaterTransfers() public view {
        // Fixed oldest checkpoint plus eight recent model snapshots, including gaps between blocks.
        for (uint256 i; i < 4; ++i) {
            assertEq(token.balanceAt(actors[i], 99), 0);
            assertEq(token.balanceAt(actors[i], 100), i == 0 ? C.SUPPLY : 0);
        }
        for (uint256 slot; slot < 8; ++slot) {
            uint256 historicalBlock = handler.sealedBlocks(slot);
            if (historicalBlock == 0) continue;
            uint256 total;
            for (uint256 i; i < 4; ++i) {
                uint256 amount = token.balanceAt(actors[i], historicalBlock);
                assertEq(amount, handler.sealedBalances(slot, i));
                assertEq(token.balanceAt(actors[i], handler.sealedThrough(slot)), amount);
                total += amount;
            }
            assertEq(total, C.SUPPLY);
        }
    }

    function invariantCurrentBlockCannotBeUsedAsASnapshot() public {
        vm.expectRevert(KeelToken.FutureLookup.selector);
        token.balanceAt(actors[0], vm.getBlockNumber());
    }

    function testHandlerExercisesFullSupplySelfTransfersAndAllowanceBoundaries() public {
        handler.transfer(0, 0, C.SUPPLY);
        handler.approve(0, 1, C.SUPPLY, false);
        handler.transferFrom(0, 1, 2, C.SUPPLY);
        assertEq(token.allowance(actors[0], actors[1]), 0);
        handler.approve(2, 3, 0, true);
        handler.transferFrom(2, 3, 3, C.SUPPLY);
        assertEq(token.allowance(actors[2], actors[3]), type(uint256).max);
        handler.transfer(3, 0, 1);
        handler.transfer(0, 1, 0);
        handler.sealBlock(999);
        handler.rejectOverdraw(0);
        handler.rejectUnapprovedSpend(3, 1);
        handler.rejectReinitialization(2);
        assertEq(handler.transfers(), 3);
        assertEq(handler.delegatedTransfers(), 2);
        assertEq(handler.rejectedCalls(), 3);
        invariantBalancesAndAllowancesMatchIndependentLedger();
        invariantPastBalancesNeverChangeAfterLaterTransfers();
        invariantCurrentBlockCannotBeUsedAsASnapshot();
    }
}
