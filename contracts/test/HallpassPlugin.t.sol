// SPDX-License-Identifier: MIT
// HallpassPlugin unit tests — Foundry / forge-std.
//
// Tests the REAL plugin contract (src/HallpassPlugin.sol, the H9 reference
// artifact). The plugin keys policy by msg.sender == the MSCA account (it is
// CALLED by accounts, not delegate-called), so `vm.prank(account)` faithfully
// models the account invoking the plugin — no mocks of the plugin itself.
//
// Conventions: amounts are native wei (18 decimals), matching the plugin's
// policy units (bible §4.2: 0.01 USDC cap = 10000000000000000).
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/HallpassPlugin.sol";

contract HallpassPluginTest is Test {
    HallpassPlugin plugin;

    address account = makeAddr("msca-account");
    address owner = makeAddr("owner");
    uint256 sessionSk = 0xA11CE;
    address sessionKey;
    address payeeA = makeAddr("payee-a");
    address payeeB = makeAddr("payee-b");

    // MSCA native selectors — derived from signatures, never recalled.
    bytes4 constant EXECUTE = bytes4(keccak256("execute(address,uint256,bytes)"));
    bytes4 constant EXECUTE_BATCH = bytes4(keccak256("executeBatch((address,uint256,bytes)[])"));

    // Function ids mirroring the source's internal constants
    // (FID_SPEND=1, FID_USEROP=2, FID_OWNER=3).
    uint8 constant FID_SPEND = 1;
    uint8 constant FID_USEROP = 2;
    uint8 constant FID_OWNER = 3;

    // The anti-malleability bound exactly as written in the source under test.
    // It is a 62-hex-digit value (~2^247), i.e. the research typo documented in
    // bible §4.5 — NOT the true secp256k1 half-order. Quoted, not fixed: the
    // tests must pin the source's actual behavior.
    uint256 constant SRC_S_BOUND =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A450ABBEB08BC4FBE82A;

    uint256 constant SECP256K1_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    uint256 constant PER_TX_CAP = 0.01 ether; // 1e16 native wei
    uint256 constant WINDOW_CAP = 0.025 ether;
    uint256 constant WINDOW_SECS = 3600;

    function setUp() public {
        plugin = new HallpassPlugin();
        sessionKey = vm.addr(sessionSk);
    }

    // ---------- helpers ----------

    /// @dev Installs the default open (empty-allowlist) policy as `account`.
    function _installDefault() internal returns (uint256 expiry) {
        expiry = block.timestamp + 2 hours;
        address[] memory allowlist = new address[](0);
        vm.prank(account);
        plugin.onInstall(
            abi.encode(sessionKey, owner, PER_TX_CAP, WINDOW_CAP, WINDOW_SECS, expiry, allowlist)
        );
    }

    function _execCalldata(address to, uint256 value) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(EXECUTE, to, value, bytes(""));
    }

    /// @dev Models the MSCA invoking runtime validation for the session key.
    function _validateAs(address sender, bytes memory execCalldata) internal {
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, sender, 0, execCalldata);
    }

    /// @dev Reads the policy struct back. The auto-generated getter omits the
    /// dynamic `allowlist` array and returns 9 fields; each accessor below
    /// names a single component to stay clear of stack-too-deep limits.
    function _sessionKey() internal view returns (address sk) {
        (sk,,,,,,,,) = plugin.policies(account);
    }

    function _perTxCap() internal view returns (uint256 c) {
        (,, c,,,,,,) = plugin.policies(account);
    }

    function _expiry() internal view returns (uint256 e) {
        (,,,,, e,,,) = plugin.policies(account);
    }

    function _winStart() internal view returns (uint256 w) {
        (,,,,,, w,,) = plugin.policies(account);
    }

    function _winSpent() internal view returns (uint256 s) {
        (,,,,,,, s,) = plugin.policies(account);
    }

    function _revoked() internal view returns (bool r) {
        (,,,,,,,, r) = plugin.policies(account);
    }

    function _userOp(bytes memory callData, bytes memory sig)
        internal
        view
        returns (PackedUserOperation memory uo)
    {
        uo = PackedUserOperation({
            sender: account,
            nonce: 0,
            initCode: "",
            callData: callData,
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: sig
        });
    }

    /// @dev The source's malleability bound rejects ~99.6% of uniformly random
    /// low-S signatures, so a passing signature is ground deterministically:
    /// iterate digests until vm.sign yields s <= the source's bound.
    function _groundPassingSignature(uint256 sk)
        internal
        returns (bytes32 digest, bytes memory sig)
    {
        for (uint256 i = 0; i < 100000; i++) {
            digest = keccak256(abi.encode("hallpass-userop", i));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(sk, digest);
            if (uint256(s) <= SRC_S_BOUND) {
                return (digest, abi.encodePacked(r, s, v));
            }
        }
        revert("no bound-passing signature ground");
    }

    // =====================================================================
    // 1. Manifest + ERC-165
    // =====================================================================

    function test_ManifestHashIsDeterministic() public {
        // bible §4.6: manifestHash = keccak256(abi.encode(plugin.pluginManifest()))
        bytes32 h1 = keccak256(abi.encode(plugin.pluginManifest()));
        bytes32 h2 = keccak256(abi.encode(plugin.pluginManifest()));
        assertEq(h1, h2, "manifest hash must be deterministic");
        assertTrue(h1 != bytes32(0), "manifest hash must be non-zero");
    }

    function test_ManifestRegistersFunctions() public {
        PluginManifest memory m = plugin.pluginManifest();

        assertEq(m.executionFunctions.length, 2, "two management functions");
        assertEq(m.executionFunctions[0], plugin.revokeSession.selector);
        assertEq(m.executionFunctions[1], plugin.updatePolicy.selector);

        assertEq(m.userOpValidationFunctions.length, 2);
        assertEq(m.userOpValidationFunctions[0].executionSelector, EXECUTE);
        assertEq(m.userOpValidationFunctions[0].associatedFunction.functionId, FID_USEROP);
        assertEq(m.userOpValidationFunctions[1].executionSelector, EXECUTE_BATCH);
        assertEq(m.userOpValidationFunctions[1].associatedFunction.functionId, FID_USEROP);

        assertEq(m.runtimeValidationFunctions.length, 6);
        assertEq(m.runtimeValidationFunctions[0].executionSelector, EXECUTE);
        assertEq(m.runtimeValidationFunctions[0].associatedFunction.functionId, FID_SPEND);
        assertEq(m.runtimeValidationFunctions[1].executionSelector, EXECUTE_BATCH);
        assertEq(m.runtimeValidationFunctions[1].associatedFunction.functionId, FID_SPEND);
        // install/uninstall + the two management fns are owner-gated
        assertEq(m.runtimeValidationFunctions[2].associatedFunction.functionId, FID_OWNER);
        assertEq(m.runtimeValidationFunctions[3].associatedFunction.functionId, FID_OWNER);
        assertEq(m.runtimeValidationFunctions[4].executionSelector, plugin.revokeSession.selector);
        assertEq(m.runtimeValidationFunctions[4].associatedFunction.functionId, FID_OWNER);
        assertEq(m.runtimeValidationFunctions[5].executionSelector, plugin.updatePolicy.selector);
        assertEq(m.runtimeValidationFunctions[5].associatedFunction.functionId, FID_OWNER);

        // The plugin never moves funds itself (bible §3: no token, no fees).
        assertFalse(m.canSpendNativeToken, "plugin must not claim native spend");
        assertFalse(m.permitAnyExternalAddress, "plugin must not permit any external address");
    }

    function test_SupportsIPluginInterface() public {
        // bible §4.1: type(IPlugin).interfaceId == 0x043140ed
        // (extracted from the live Address Book bytecode).
        assertEq(type(IPlugin).interfaceId, bytes4(0x043140ed));
        assertTrue(plugin.supportsInterface(type(IPlugin).interfaceId));
    }

    function test_SupportsERC165() public {
        assertTrue(plugin.supportsInterface(bytes4(0x01ffc9a7)));
    }

    function test_RejectsUnknownInterface() public {
        assertFalse(plugin.supportsInterface(bytes4(0xdeadbeef)));
    }

    function test_NativeSelectorsMatchSource() public {
        // The source hardcodes EXECUTE=0xb61d27f6 / EXECUTE_BATCH=0x34fcd5be;
        // derive them here so the test pins derivation, not recall.
        assertEq(EXECUTE, bytes4(0xb61d27f6));
        assertEq(EXECUTE_BATCH, bytes4(0x34fcd5be));
    }

    // =====================================================================
    // 2. Policy CRUD
    // =====================================================================

    function test_InstallRegistersPolicy() public {
        uint256 expiry = block.timestamp + 2 hours;
        address[] memory allowlist = new address[](1);
        allowlist[0] = payeeA;

        vm.expectEmit(true, true, false, true);
        emit HallpassPlugin.SessionRegistered(account, sessionKey, PER_TX_CAP, WINDOW_CAP, expiry);

        vm.prank(account);
        plugin.onInstall(
            abi.encode(sessionKey, owner, PER_TX_CAP, WINDOW_CAP, WINDOW_SECS, expiry, allowlist)
        );

        (
            address sk,
            address own,
            uint256 perTx,
            uint256 winCap,
            uint256 winSecs,
            uint256 exp,
            uint256 winStart,
            uint256 winSpent,
            bool revoked
        ) = plugin.policies(account);
        assertEq(sk, sessionKey);
        assertEq(own, owner);
        assertEq(perTx, PER_TX_CAP);
        assertEq(winCap, WINDOW_CAP);
        assertEq(winSecs, WINDOW_SECS);
        assertEq(exp, expiry);
        assertEq(winStart, block.timestamp, "window starts at install");
        assertEq(winSpent, 0);
        assertFalse(revoked);
    }

    function test_InstallRejectsBadInit() public {
        address[] memory allowlist = new address[](0);
        uint256 expiry = block.timestamp + 1 hours;

        // sessionKey == address(0)
        vm.expectRevert(HallpassPlugin.BadInit.selector);
        vm.prank(account);
        plugin.onInstall(abi.encode(address(0), owner, PER_TX_CAP, WINDOW_CAP, WINDOW_SECS, expiry, allowlist));

        // sessionKey == owner
        vm.expectRevert(HallpassPlugin.BadInit.selector);
        vm.prank(account);
        plugin.onInstall(abi.encode(owner, owner, PER_TX_CAP, WINDOW_CAP, WINDOW_SECS, expiry, allowlist));
    }

    function test_UpdatePolicy() public {
        _installDefault();
        // put some spend on the window so the reset is observable
        _validateAs(sessionKey, _execCalldata(payeeA, 0.005 ether));

        uint256 newCap = 0.05 ether;
        uint256 newExpiry = block.timestamp + 30 days;
        address[] memory newAllowlist = new address[](1);
        newAllowlist[0] = payeeB;

        vm.expectEmit(true, false, false, true);
        emit HallpassPlugin.PolicyUpdated(account, newCap, WINDOW_CAP, newExpiry);

        vm.prank(account);
        plugin.updatePolicy(sessionKey, newCap, WINDOW_CAP, WINDOW_SECS, newExpiry, newAllowlist);

        assertEq(_sessionKey(), sessionKey);
        assertEq(_perTxCap(), newCap, "cap updated");
        assertEq(_expiry(), newExpiry, "expiry updated");
        assertEq(_winSpent(), 0, "window accounting reset");
        assertEq(_winStart(), block.timestamp, "window restarted");
        assertFalse(_revoked(), "revocation cleared");

        // a spend over the OLD cap but under the NEW cap now passes
        _validateAs(sessionKey, _execCalldata(payeeA, 0.03 ether));
    }

    function test_UpdatePolicyRejectsBadInit() public {
        _installDefault();
        address[] memory allowlist = new address[](0);

        vm.expectRevert(HallpassPlugin.BadInit.selector);
        vm.prank(account);
        plugin.updatePolicy(address(0), PER_TX_CAP, WINDOW_CAP, WINDOW_SECS, block.timestamp + 1, allowlist);

        vm.expectRevert(HallpassPlugin.BadInit.selector);
        vm.prank(account);
        plugin.updatePolicy(owner, PER_TX_CAP, WINDOW_CAP, WINDOW_SECS, block.timestamp + 1, allowlist);
    }

    function test_OnUninstallClearsPolicy() public {
        _installDefault();
        vm.prank(account);
        plugin.onUninstall("");
        (address sk,,,,,,,,) = plugin.policies(account);
        assertEq(sk, address(0), "policy cleared on uninstall");
    }

    // =====================================================================
    // 3-4. Enforcement: in-policy passes, over-cap reverts
    // =====================================================================

    function test_InPolicySpendPasses() public {
        _installDefault();
        uint256 value = 0.005 ether;

        vm.expectEmit(true, true, true, true);
        emit HallpassPlugin.SpendAuthorized(account, sessionKey, payeeA, value, value);

        _validateAs(sessionKey, _execCalldata(payeeA, value));

        assertEq(_winSpent(), value, "window accounting advanced");
    }

    function test_OwnerBypassesPolicy() public {
        _installDefault();
        // owner may execute even far above the per-tx cap (source: owner bypass)
        _validateAs(owner, _execCalldata(payeeA, 10 * PER_TX_CAP));
        assertEq(_winSpent(), 0, "owner spend is not window-accounted");
    }

    function test_UnknownSignerReverts() public {
        _installDefault();
        address stranger = makeAddr("stranger");
        vm.expectRevert(abi.encodeWithSelector(HallpassPlugin.UnknownSigner.selector, stranger));
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, stranger, 0, _execCalldata(payeeA, 0.005 ether));
    }

    function test_OverCapSpendReverts() public {
        _installDefault();
        uint256 attempted = 0.05 ether; // 5x the 0.01 cap

        vm.expectRevert(
            abi.encodeWithSelector(HallpassPlugin.PerTxCapExceeded.selector, attempted, PER_TX_CAP)
        );
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, sessionKey, 0, _execCalldata(payeeA, attempted));

        assertEq(_winSpent(), 0, "reverted spend must not touch window accounting");
    }

    function test_WindowCapReverts() public {
        _installDefault();
        // 0.01 + 0.01 = 0.02 <= 0.025 window cap: ok
        _validateAs(sessionKey, _execCalldata(payeeA, 0.01 ether));
        _validateAs(sessionKey, _execCalldata(payeeA, 0.01 ether));
        // 0.02 + 0.01 = 0.03 > 0.025: revert with exact values
        vm.expectRevert(
            abi.encodeWithSelector(
                HallpassPlugin.WindowCapExceeded.selector, 0.03 ether, WINDOW_CAP
            )
        );
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, sessionKey, 0, _execCalldata(payeeA, 0.01 ether));

        assertEq(_winSpent(), 0.02 ether, "failed spend left window accounting intact");
    }

    function test_WindowRolloverResets() public {
        _installDefault();
        _validateAs(sessionKey, _execCalldata(payeeA, 0.01 ether));
        _validateAs(sessionKey, _execCalldata(payeeA, 0.01 ether));

        // without rollover the third spend would breach the window cap
        vm.warp(block.timestamp + WINDOW_SECS + 1);
        _validateAs(sessionKey, _execCalldata(payeeA, 0.01 ether));

        assertEq(_winSpent(), 0.01 ether, "window reset to just this spend");
        assertEq(_winStart(), block.timestamp, "window restarted at rollover");
    }

    function test_ExecuteBatchEnforcement() public {
        _installDefault();

        Call[] memory calls = new Call[](2);
        calls[0] = Call(payeeA, 0.004 ether, "");
        calls[1] = Call(payeeB, 0.005 ether, "");
        _validateAs(sessionKey, abi.encodeWithSelector(EXECUTE_BATCH, calls));
        assertEq(_winSpent(), 0.009 ether, "batch total window-accounted");

        // one over-cap item in the batch reverts the whole validation
        Call[] memory bad = new Call[](2);
        bad[0] = Call(payeeA, 0.004 ether, "");
        bad[1] = Call(payeeB, 0.05 ether, "");
        vm.expectRevert(
            abi.encodeWithSelector(HallpassPlugin.PerTxCapExceeded.selector, 0.05 ether, PER_TX_CAP)
        );
        vm.prank(account);
        plugin.runtimeValidationFunction(
            FID_SPEND, sessionKey, 0, abi.encodeWithSelector(EXECUTE_BATCH, bad)
        );
    }

    // =====================================================================
    // 5. Revoke
    // =====================================================================

    function test_RevokeThenSpendReverts() public {
        _installDefault();

        vm.expectEmit(true, true, false, false);
        emit HallpassPlugin.SessionRevokedEvt(account, sessionKey);
        vm.prank(account);
        plugin.revokeSession();

        assertTrue(_revoked(), "revoked flag set");

        vm.expectRevert(HallpassPlugin.SessionRevoked.selector);
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, sessionKey, 0, _execCalldata(payeeA, 0.005 ether));
    }

    // =====================================================================
    // 6. Expiry
    // =====================================================================

    function test_ExpiredSessionReverts() public {
        uint256 expiry = _installDefault();
        vm.warp(block.timestamp + 2 hours + 1);
        uint256 nowTs = block.timestamp;

        vm.expectRevert(
            abi.encodeWithSelector(HallpassPlugin.SessionExpired.selector, nowTs, expiry)
        );
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, sessionKey, 0, _execCalldata(payeeA, 0.005 ether));
    }

    // =====================================================================
    // 7. Allowlist
    // =====================================================================

    function test_DisallowedDestinationReverts() public {
        uint256 expiry = block.timestamp + 2 hours;
        address[] memory allowlist = new address[](1);
        allowlist[0] = payeeA;
        vm.prank(account);
        plugin.onInstall(
            abi.encode(sessionKey, owner, PER_TX_CAP, WINDOW_CAP, WINDOW_SECS, expiry, allowlist)
        );

        vm.expectRevert(
            abi.encodeWithSelector(HallpassPlugin.RecipientNotAllowed.selector, payeeB)
        );
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, sessionKey, 0, _execCalldata(payeeB, 0.005 ether));

        // the allowlisted destination passes
        _validateAs(sessionKey, _execCalldata(payeeA, 0.005 ether));
    }

    // =====================================================================
    // Routing / misc
    // =====================================================================

    function test_UnsupportedExecutionReverts() public {
        _installDefault();
        bytes4 sel = bytes4(0x12345678);
        vm.expectRevert(
            abi.encodeWithSelector(HallpassPlugin.UnsupportedExecution.selector, sel)
        );
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, sessionKey, 0, abi.encodePacked(sel));
    }

    function test_UnknownFunctionIdReverts() public {
        _installDefault();
        vm.expectRevert(
            abi.encodeWithSelector(HallpassPlugin.UnknownFunctionId.selector, uint8(99))
        );
        vm.prank(account);
        plugin.runtimeValidationFunction(99, sessionKey, 0, "");
    }

    function test_OwnerGateOnFidOwner() public {
        _installDefault();
        // owner passes the FID_OWNER gate
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_OWNER, owner, 0, "");

        // anyone else reverts
        address stranger = makeAddr("stranger");
        vm.expectRevert(HallpassPlugin.NotOwner.selector);
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_OWNER, stranger, 0, "");
    }

    // =====================================================================
    // ERC-4337 userOp path (incl. the malleability-bound behavior)
    // =====================================================================

    function test_UserOpInPolicySpendPasses() public {
        _installDefault();
        // NOTE: the source still carries the 62-hex-digit malleability typo
        // (bible §4.5), so a passing signature must be ground; see helper.
        (bytes32 digest, bytes memory sig) = _groundPassingSignature(sessionSk);
        PackedUserOperation memory uo =
            _userOp(_execCalldata(payeeA, 0.005 ether), sig);

        vm.prank(account);
        uint256 res = plugin.userOpValidationFunction(FID_USEROP, uo, digest);
        assertEq(res, 0, "SIG_VALIDATION_SUCCESS");

        assertEq(_winSpent(), 0.005 ether, "window accounting written atomically in validation");
    }

    function test_UserOpMalleableSignatureReverts() public {
        _installDefault();
        bytes32 digest = keccak256("hallpass-userop-malleable");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sessionSk, digest);
        // high-S counterpart of a valid signature: still recovers the session
        // key via ecrecover, but must trip the anti-malleability bound.
        bytes32 sHi = bytes32(SECP256K1_N - uint256(s));
        assertGt(uint256(sHi), SRC_S_BOUND, "test precondition: high-S above the bound");
        PackedUserOperation memory uo =
            _userOp(_execCalldata(payeeA, 0.005 ether), abi.encodePacked(r, sHi, v));

        vm.expectRevert("malleable s");
        vm.prank(account);
        plugin.userOpValidationFunction(FID_USEROP, uo, digest);
    }
}
