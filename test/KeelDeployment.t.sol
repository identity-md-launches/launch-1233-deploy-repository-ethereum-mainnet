// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {KeelToken} from "src/KeelToken.sol";
import {KeelVault} from "src/KeelVault.sol";
import {KeelFactory} from "src/KeelFactory.sol";
import {KeelHook} from "src/KeelHook.sol";
import {KeelRouter} from "src/KeelRouter.sol";
import {KeelConstants as C} from "src/libraries/KeelConstants.sol";

/// @dev Raw CREATE2 avoids Foundry's dynamic linking replacing constructor execution.
contract KeelDeploymentProbe {
    function deploy(bytes memory code, bytes32 salt) external returns (address deployed) {
        assembly ("memory-safe") {
            deployed := create2(0, add(code, 32), mload(code), salt)
            if iszero(deployed) {
                returndatacopy(0, 0, returndatasize())
                revert(0, returndatasize())
            }
        }
    }
}

contract KeelDeploymentTest is Test {
    KeelDeploymentProbe internal deployer;
    address internal owner;

    struct Deployment {
        KeelToken template;
        KeelVault vault;
        KeelFactory factory;
        KeelHook hook;
        KeelRouter router;
        uint256 factoryGas;
    }

    function setUp() public {
        vm.chainId(1);
        owner = makeAddr("deployment test owner, not a live launch address");
        deployer = new KeelDeploymentProbe();
    }

    function _deploy(string memory artifact, bytes memory args, bytes32 salt) internal returns (address) {
        bytes memory code = abi.encodePacked(vm.getCode(artifact), args);
        assertLe(code.length, 49_152, "EIP-3860 initcode limit");
        address expected = address(
            uint160(
                uint256(keccak256(abi.encodePacked(bytes1(0xff), address(deployer), salt, keccak256(code))))
            )
        );
        address actual = deployer.deploy(code, salt);
        assertEq(actual, expected, "constructor reference must use the CREATE2 address");
        return actual;
    }

    function _deployAll() internal returns (Deployment memory d) {
        d.template = KeelToken(_deploy("KeelToken.sol:KeelToken", "", keccak256("template")));
        d.vault = KeelVault(_deploy("KeelVault.sol:KeelVault", abi.encode(owner), keccak256("vault")));
        bytes memory code = abi.encodePacked(
            vm.getCode("KeelFactory.sol:KeelFactory"),
            abi.encode(owner, address(d.vault), address(d.template), uint256(0))
        );
        assertLe(code.length, 49_152);
        uint256 gasBefore = gasleft();
        d.factory = KeelFactory(deployer.deploy(code, keccak256("factory")));
        d.factoryGas = gasBefore - gasleft();
        d.hook = KeelHook(d.factory.hook());
        d.router = KeelRouter(
            _deploy("KeelRouter.sol:KeelRouter", abi.encode(owner, address(d.factory)), keccak256("router"))
        );
    }

    function testConstructorRehearsalReproducesAddressesAndLeavesFactoryPaused() public {
        assertEq(C.POOL_MANAGER.code.length, 0);
        assertEq(C.IMD.code.length, 0);
        uint256 snapshot = vm.snapshotState();
        Deployment memory rehearsal = _deployAll();
        bytes32 rehearsedHookSalt = rehearsal.factory.hookSalt();
        _assertBindings(rehearsal);
        _assertRuntime(address(rehearsal.template));
        _assertRuntime(address(rehearsal.vault));
        _assertRuntime(address(rehearsal.factory));
        _assertRuntime(address(rehearsal.hook));
        _assertRuntime(address(rehearsal.router));
        // This is a local rehearsal, never a claim about a broadcast or confirmed mainnet addresses.
        assertTrue(vm.revertToState(snapshot));
        Deployment memory actual = _deployAll();
        assertEq(address(actual.template), address(rehearsal.template));
        assertEq(address(actual.vault), address(rehearsal.vault));
        assertEq(address(actual.factory), address(rehearsal.factory));
        assertEq(address(actual.hook), address(rehearsal.hook));
        assertEq(address(actual.router), address(rehearsal.router));
        assertEq(actual.factory.hookSalt(), rehearsedHookSalt);
        _assertBindings(actual);
        emit log_named_uint("CREATE2 factory constructor gas, including hook search", actual.factoryGas);
        emit log_named_uint("Hook salt candidates in this rehearsal", actual.factory.hookSaltAttempts());
        // Ceiling applies to this concrete address, not all possible salt-search lengths.
        assertLt(actual.factoryGas, 16_777_216);
        vm.expectRevert(KeelToken.AlreadyInitialized.selector);
        actual.template.initialize("cannot initialize the template", "LOCKED", owner);
        vm.expectRevert(KeelFactory.Paused.selector);
        actual.factory.launch("", "", "", "", 0, 0, 0, "", "");
    }

    function testFactoryCreatesExactlyTheHookReportedByItsEventAndSalt() public {
        vm.recordLogs();
        Deployment memory d = _deployAll();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 hookEvents;
        for (uint256 i; i < logs.length; ++i) {
            if (
                logs[i].emitter == address(d.factory)
                    && logs[i].topics[0] == keccak256("HookDeployed(address,bytes32,uint256)")
            ) {
                ++hookEvents;
                assertEq(address(uint160(uint256(logs[i].topics[1]))), address(d.hook));
                (bytes32 salt, uint256 attempts) = abi.decode(logs[i].data, (bytes32, uint256));
                assertEq(salt, d.factory.hookSalt());
                assertEq(attempts, d.factory.hookSaltAttempts());
            }
        }
        assertEq(hookEvents, 1);
        bytes32 initHash = keccak256(
            abi.encodePacked(
                vm.getCode("KeelHook.sol:KeelHook"), abi.encode(address(d.factory), address(d.vault))
            )
        );
        address predicted = address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(bytes1(0xff), address(d.factory), d.factory.hookSalt(), initHash)
                    )
                )
            )
        );
        assertEq(predicted, address(d.hook));
        assertEq(uint256(d.factory.hookSalt()) + 1, d.factory.hookSaltAttempts());
        assertEq(uint160(predicted) & 0x3fff, 0x28cc);
    }

    function testDeploymentFactoryCannotPerformOwnerSetup() public {
        Deployment memory d = _deployAll();
        vm.startPrank(address(deployer));
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(deployer))
        );
        d.vault.wire(address(d.factory));
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(deployer))
        );
        d.factory.setPaused(false);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(deployer))
        );
        d.router.setEthPool(10000, 200);
        vm.stopPrank();
        vm.prank(owner);
        d.vault.wire(address(d.factory));
        assertEq(d.vault.factory(), address(d.factory));
        assertEq(d.vault.hook(), address(d.hook));
        assertTrue(d.factory.paused());
    }

    function testOwnerCompletesThePrescribedSetupAfterAllConstructors() public {
        Deployment memory d = _deployAll();
        _assertBindings(d);
        // Only now supply the external v4 dependency and an existing hookless ETH/IMD pool.
        deployCodeTo("PoolManager.sol:PoolManager", abi.encode(owner), C.POOL_MANAGER);
        PoolManager manager = PoolManager(C.POOL_MANAGER);
        PoolKey memory key =
            PoolKey(Currency.wrap(address(0)), Currency.wrap(C.IMD), 10000, 200, IHooks(address(0)));
        manager.initialize(key, uint160(1 << 96));
        address configuredSigner = makeAddr("test-only configured signer");
        address configuredVerifier = makeAddr("test-only configured verifier");
        vm.startPrank(owner);
        d.vault.wire(address(d.factory));
        d.factory.setSigner(configuredSigner);
        d.factory.setStartTickBounds(-200000, 200000);
        d.vault.setVerifier(configuredVerifier);
        d.router.setEthPool(10000, 200);
        assertTrue(d.factory.paused(), "configuration alone must not open launches");
        d.factory.setPaused(false);
        vm.stopPrank();
        assertEq(d.vault.factory(), address(d.factory));
        assertEq(d.vault.hook(), address(d.hook));
        assertEq(d.factory.signer(), configuredSigner);
        assertEq(d.factory.minStartTick(), -200000);
        assertEq(d.factory.maxStartTick(), 200000);
        assertTrue(d.factory.tickBoundsSet());
        assertEq(d.vault.verifier(), configuredVerifier);
        assertTrue(d.router.ethPoolConfigured());
        assertFalse(d.factory.paused());
    }

    function testConstructorsRejectZeroOwnerAndMissingDependencies() public {
        bytes memory vaultCode = vm.getCode("KeelVault.sol:KeelVault");
        bytes memory factoryCode = vm.getCode("KeelFactory.sol:KeelFactory");
        bytes memory routerCode = vm.getCode("KeelRouter.sol:KeelRouter");
        bytes memory hookCode = vm.getCode("KeelHook.sol:KeelHook");
        bytes memory invalidOwner = abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0));
        vm.expectRevert(invalidOwner);
        deployer.deploy(abi.encodePacked(vaultCode, abi.encode(address(0))), 0);
        vm.expectRevert(invalidOwner);
        deployer.deploy(abi.encodePacked(factoryCode, abi.encode(address(0), owner, owner, uint256(0))), 0);
        vm.expectRevert(invalidOwner);
        deployer.deploy(abi.encodePacked(routerCode, abi.encode(address(0), owner)), 0);
        vm.expectRevert(KeelFactory.InvalidAddress.selector);
        deployer.deploy(abi.encodePacked(factoryCode, abi.encode(owner, address(0), owner, uint256(0))), 0);
        vm.expectRevert(KeelFactory.InvalidAddress.selector);
        deployer.deploy(abi.encodePacked(factoryCode, abi.encode(owner, owner, address(0), uint256(0))), 0);
        vm.expectRevert(KeelRouter.InvalidAddress.selector);
        deployer.deploy(abi.encodePacked(routerCode, abi.encode(owner, address(0))), 0);
        vm.expectRevert(KeelHook.InvalidAddress.selector);
        deployer.deploy(abi.encodePacked(hookCode, abi.encode(address(0), owner)), 0);
        vm.expectRevert(KeelHook.InvalidAddress.selector);
        deployer.deploy(abi.encodePacked(hookCode, abi.encode(owner, address(0))), 0);
    }

    function _assertBindings(Deployment memory d) internal view {
        assertEq(d.vault.owner(), owner);
        assertEq(d.factory.owner(), owner);
        assertEq(d.router.owner(), owner);
        assertEq(d.vault.factory(), address(0));
        assertEq(d.vault.hook(), address(0));
        assertEq(d.vault.verifier(), address(0));
        assertEq(d.factory.vault(), address(d.vault));
        assertEq(d.factory.tokenImplementation(), address(d.template));
        assertEq(d.hook.factory(), address(d.factory));
        assertEq(d.hook.vault(), address(d.vault));
        assertEq(address(d.router.factory()), address(d.factory));
        assertEq(d.factory.signer(), address(0));
        assertFalse(d.factory.tickBoundsSet());
        assertTrue(d.factory.paused());
        assertFalse(d.router.ethPoolConfigured());
        assertEq(d.template.totalSupply(), 0);
        assertEq(d.vault.totalOwed(), 0);
        assertEq(d.hook.totalPending(), 0);
    }

    function _assertRuntime(address application) internal view {
        bytes memory code = application.code;
        assertGt(code.length, 0);
        assertLe(code.length, 24_576, "EIP-170 runtime limit");
        for (uint256 i; i < code.length; ++i) {
            uint8 op = uint8(code[i]);
            if (op >= 0x60 && op <= 0x7f) {
                i += op - 0x5f;
                continue;
            }
            assertTrue(op != 0xf4 && op != 0xf2 && op != 0xff, "forbidden application opcode");
        }
    }
}
