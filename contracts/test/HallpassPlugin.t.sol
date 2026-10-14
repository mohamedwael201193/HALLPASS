// SPDX-License-Identifier: MIT
// HallpassPlugin unit tests — Foundry / forge-std.
//
// Tests the REAL plugin contract (contracts/src/HallpassPlugin.sol — the
// coordinator-fixed build source; the 62-digit malleability typo from the H9
// research artifact was fixed at line 396 per C6/H-1). The plugin keys policy
// by msg.sender == the MSCA account (it is CALLED by accounts, not
// delegate-called), so `vm.prank(account)` faithfully models the account
// invoking the plugin — no mocks of the plugin itself.
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

    uint256 constant SECP256K1_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    // floor(secp256k1_n / 2) — the ECDSA anti-malleability bound the contract
    // MUST enforce. Derivation: n is odd, so floor(n/2) = (n-1)/2, computed
    // independently (python: hex((n-1)//2)) and cross-checked against SEC 2
    // §2.4.1 and OpenZeppelin's ECDSA HALF_ORDER. History: the H9 research
    // artifact shipped a 62-hex-digit typo here (~2^247, bible §4.5); the
    // coordinator fixed src/HallpassPlugin.sol line 396 to the value below
    // (C6/H-1). test_MalleabilityBoundIsTrueHalfOrder pins it behaviorally so
    // CI catches any regression forever.
    uint256 constant TRUE_HALF_ORDER =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

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

    function _windowCap() internal view returns (uint256 c) {
        (,,, c,,,,,) = plugin.policies(account);
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

    /// @dev Signs a digest with the session key. Post-fix (true half-order
    /// bound, C6/H-1), libsecp256k1 low-S signatures from vm.sign always
    /// satisfy the contract's bound — no grinding needed. (Pre-fix, the
    /// 62-digit typo rejected ~99.6% of such signatures, so this test passing
    /// at all is itself the regression signal for the fix.)
    function _signUserOp(uint256 sk, bytes32 digest) internal returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sk, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Returns true iff submitting `sVal` as the signature's s trips the
    /// contract's "malleable s" bound check. The bound is evaluated BEFORE
    /// ecrecover, so the revert reason alone distinguishes the two cases:
    ///   s > bound  → "malleable s"
    ///   s <= bound → ecrecover runs on (r, s) garbage → "bad sig", or a
    ///                 custom error (UnknownSigner) — never "malleable s".
    function _tripsMalleabilityBound(bytes32 digest, bytes32 r, uint256 sVal)
        internal
        returns (bool)
    {
        bytes memory sig = abi.encodePacked(r, bytes32(sVal), uint8(27));
        PackedUserOperation memory uo = _userOp(_execCalldata(payeeA, 0.005 ether), sig);
        vm.prank(account); // the plugin keys policy by msg.sender == the account
        try plugin.userOpValidationFunction(FID_USEROP, uo, digest) returns (uint256) {
            return false;
        } catch Error(string memory reason) {
            return keccak256(bytes(reason)) == keccak256("malleable s");
        } catch {
            // custom error (e.g. UnknownSigner) or panic: the bound check passed
            return false;
        }
    }

    /// @dev Binary-searches the EXACT anti-malleability constant the deployed
    /// bytecode enforces, without reading the source literal.
    function _probeMalleabilityBound() internal returns (uint256) {
        bytes32 digest = keccak256("hallpass-bound-probe");
        (, bytes32 r,) = vm.sign(sessionSk, digest);
        uint256 lo = 0; // passes the bound check
        uint256 hi = SECP256K1_N; // trips it (n exceeds any valid bound)
        for (uint256 i = 0; i < 256; i++) {
            // overflow-safe midpoint: (lo + hi) / 2 can overflow once lo and
            // hi are both near 2^256 (this exact bug cost one red run: the
            // second probe iteration panicked with 0x11).
            uint256 mid = lo + (hi - lo) / 2;
            if (mid == lo) break;
            if (_tripsMalleabilityBound(digest, r, mid)) {
                hi = mid;
            } else {
                lo = mid;
            }
        }
        return lo;
    }

    // =====================================================================
    // 1. Manifest + ERC-165
    // =====================================================================

    function test_ManifestHashIsDeterministic() public view {
        // bible §4.6: manifestHash = keccak256(abi.encode(plugin.pluginManifest()))
        bytes32 h1 = keccak256(abi.encode(plugin.pluginManifest()));
        bytes32 h2 = keccak256(abi.encode(plugin.pluginManifest()));
        assertEq(h1, h2, "manifest hash must be deterministic");
        assertTrue(h1 != bytes32(0), "manifest hash must be non-zero");
    }

    function test_ManifestRegistersFunctions() public view {
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

    function test_SupportsIPluginInterface() public view {
        // bible §4.1: type(IPlugin).interfaceId == 0x043140ed
        // (extracted from the live Address Book bytecode).
        assertEq(type(IPlugin).interfaceId, bytes4(0x043140ed));
        assertTrue(plugin.supportsInterface(type(IPlugin).interfaceId));
    }

    function test_SupportsERC165() public view {
        assertTrue(plugin.supportsInterface(bytes4(0x01ffc9a7)));
    }

    function test_RejectsUnknownInterface() public view {
        assertFalse(plugin.supportsInterface(bytes4(0xdeadbeef)));
    }

    function test_NativeSelectorsMatchSource() public pure {
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

        // NOTE: the auto-generated `policies` getter omits the dynamic
        // `allowlist` array — 9 fields, not 10 (C5 line-216 fix).
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
        plugin.onInstall(
            abi.encode(address(0), owner, PER_TX_CAP, WINDOW_CAP, WINDOW_SECS, expiry, allowlist)
        );

        // sessionKey == owner
        vm.expectRevert(HallpassPlugin.BadInit.selector);
        vm.prank(account);
        plugin.onInstall(
            abi.encode(owner, owner, PER_TX_CAP, WINDOW_CAP, WINDOW_SECS, expiry, allowlist)
        );
    }

    function test_UpdatePolicy() public {
        _installDefault();
        // put some spend on the window so the reset is observable
        _validateAs(sessionKey, _execCalldata(payeeA, 0.005 ether));

        uint256 newCap = 0.05 ether;
        uint256 newWindowCap = 0.1 ether;
        uint256 newExpiry = block.timestamp + 30 days;
        address[] memory newAllowlist = new address[](1);
        newAllowlist[0] = payeeB;

        vm.expectEmit(true, false, false, true);
        emit HallpassPlugin.PolicyUpdated(account, newCap, newWindowCap, newExpiry);

        vm.prank(account);
        plugin.updatePolicy(sessionKey, newCap, newWindowCap, WINDOW_SECS, newExpiry, newAllowlist);

        assertEq(_sessionKey(), sessionKey);
        assertEq(_perTxCap(), newCap, "cap updated");
        assertEq(_windowCap(), newWindowCap, "window cap updated");
        assertEq(_expiry(), newExpiry, "expiry updated");
        assertEq(_winSpent(), 0, "window accounting reset");
        assertEq(_winStart(), block.timestamp, "window restarted");
        assertFalse(_revoked(), "revocation cleared");

        // a spend over the OLD per-tx cap but under the NEW caps now passes
        // (to the newly allowlisted destination — payeeA was replaced by payeeB)
        _validateAs(sessionKey, _execCalldata(payeeB, 0.03 ether));
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
            abi.encodeWithSelector(HallpassPlugin.WindowCapExceeded.selector, 0.03 ether, WINDOW_CAP)
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

        vm.expectRevert(abi.encodeWithSelector(HallpassPlugin.RecipientNotAllowed.selector, payeeB));
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
        vm.expectRevert(abi.encodeWithSelector(HallpassPlugin.UnsupportedExecution.selector, sel));
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, sessionKey, 0, abi.encodePacked(sel));
    }

    function test_UnknownFunctionIdReverts() public {
        _installDefault();
        vm.expectRevert(abi.encodeWithSelector(HallpassPlugin.UnknownFunctionId.selector, uint8(99)));
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
        bytes32 digest = keccak256("hallpass-userop");
        PackedUserOperation memory uo =
            _userOp(_execCalldata(payeeA, 0.005 ether), _signUserOp(sessionSk, digest));

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
        assertGt(uint256(sHi), TRUE_HALF_ORDER, "test precondition: high-S above the bound");
        PackedUserOperation memory uo =
            _userOp(_execCalldata(payeeA, 0.005 ether), abi.encodePacked(r, sHi, v));

        vm.expectRevert("malleable s");
        vm.prank(account);
        plugin.userOpValidationFunction(FID_USEROP, uo, digest);
    }

    // =====================================================================
    // Malleability-bound pin (C6/H-1 regression gate)
    // =====================================================================

    function test_MalleabilityBoundIsTrueHalfOrder() public {
        _installDefault();
        // n is odd → floor(n/2) = (n-1)/2; cross-check the hardcoded value.
        uint256 expected = (SECP256K1_N - 1) / 2;
        assertEq(expected, TRUE_HALF_ORDER, "derivation check on the hardcoded half-order");
        // Behaviorally probe the exact constant the contract enforces.
        assertEq(
            _probeMalleabilityBound(),
            expected,
            "contract malleability bound != floor(secp256k1_n/2)"
        );
    }
}
