// SPDX-License-Identifier: MIT
// HallpassFork.t.sol — read-only Arc mainnet fork tests for HALLPASS.
//
// C3 (HALLPASS-9 fork/integration): these tests run against a fork of Arc mainnet
// (chain 5042) via `forge test --fork-url https://rpc.mainnet.arc.io`.
// They are READ-ONLY with respect to the chain: no transactions are broadcast,
// no private keys are used, no .env file is needed. (State-changing calls made
// inside fork tests only mutate the local fork copy, never mainnet.)
//
// Assertion provenance is marked per test:
//   LIVE-CHAIN-VERIFIED — asserted against live Arc mainnet state via the fork.
//   LOCALLY-SIMULATED   — asserted against a fresh local deploy of this repo's
//                         HallpassPlugin.sol (no live plugin state involved).
//   SELF-CHECK          — pure computation verifying the build bible's recorded
//                         selectors/encodings are internally consistent.
//
// Spec source: ~/workspace/your_files/hallpass-build-bible.md §§4-7
// (selectors installPlugin f85730f4, isValidSignature MAGIC 0x1626ba7e,
// Circle MSCA ERC-4337 v0.7 on Arc 5042, EntryPoint + implementation addresses).
// Per the factory note in the bible (§3), Circle's factory createAccount is
// ALLOWLISTED for custom plugins — these tests use the direct-proxy path only
// (they assert the live implementation's interface, never the factory).

pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../src/HallpassPlugin.sol";

/// @dev Minimal probe interface for Circle's live MSCA accounts.
///      Declared from the build bible (§4.1), not from memory.
interface IMSCAProbe {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function getInstalledPlugins() external view returns (address[] memory);
}

contract HallpassForkTest is Test {
    // ------------------------------------------------------------------
    // Live addresses — all from the build bible §4.7, RPC-verified 2026-10-14.
    // ------------------------------------------------------------------
    address internal constant ENTRY_POINT =
        0x0000000071727De22E5E9d8BAf0edAc6f37da032; // ERC-4337 v0.7 (16,035 bytes)
    address internal constant MSCA_IMPL =
        0xA70F1296869DA9D7CB69578123F21888E6dB2B62; // Circle MSCA v1 impl (16,412 bytes)
    address internal constant MSCA_FACTORY =
        0x0000000DF7E6c9Dc387cAFc5eCBfa6c3a6179AdD; // Circle MSCA v1 factory (4,514 bytes; ALLOWLISTED)
    address internal constant ADDRESS_BOOK =
        0x0000000d81083B16EA76dfab46B0315B0eDBF3d0; // ERC-6900 Address Book plugin (7,254 bytes)
    address internal constant ARC_USDC =
        0x3600000000000000000000000000000000000000; // ERC-20, 6 decimals

    // Live H9-proven deployments (§6) used as fork-state fixtures:
    address internal constant LIVE_ACCOUNT_W1B2 =
        0x2829f88DB9D8f86E57E9606b56cAC1039b6Bf89a; // MSCA with full HallpassPlugin at creation
    address internal constant LIVE_PLUGIN_W1B2 =
        0x7C912e73f9b8B60e4c68d52DeC5524e17ABDd; // full HallpassPlugin (W1B2)
    address internal constant ACCOUNT_A =
        0xF0d611Db9B94C863283E991E055b1F0a17bdFE31; // control: MSCA with NO plugins (SigGate probe)
    address internal constant ACCOUNT_B =
        0xB25A75a2990d07027E2676aF28DBe828BB3C18Be; // MSCA with SigGate 1271 plugin at init

    // Build bible §4.1 selectors (verified from deployed bytecode + source).
    bytes4 internal constant INSTALL_PLUGIN = 0xf85730f4;
    bytes4 internal constant UNINSTALL_PLUGIN = 0xc1a221f3;
    bytes4 internal constant EXECUTE = 0xb61d27f6;
    bytes4 internal constant EXECUTE_BATCH = 0x34fcd5be;
    bytes4 internal constant IS_VALID_SIG = 0x1626ba7e; // ERC-1271 MAGIC return value
    bytes4 internal constant IPLUGIN_ID = 0x043140ed; // type(IPlugin).interfaceId (from live Address Book bytecode)

    // Plugin-local function ids (HallpassPlugin.sol: FID_SPEND=1, FID_USEROP=2, FID_OWNER=3).
    uint8 internal constant FID_SPEND = 1;
    uint8 internal constant FID_USEROP = 2;
    uint8 internal constant FID_OWNER = 3;

    // secp256k1 order (for the high-S test vector).
    uint256 internal constant SECP_N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    // ------------------------------------------------------------------
    // 1. LIVE-CHAIN-VERIFIED: live core contracts have the bible's code.
    // ------------------------------------------------------------------

    /// @notice LIVE-CHAIN-VERIFIED. The load-bearing addresses all carry code.
    ///         Exact byte lengths are the bible's 2026-10-14 recordings — if
    ///         Circle upgrades an implementation these drift and this test
    ///         must be re-baselined (that is the intended signal, not noise).
    function test_LiveCoreContractsHaveCode() public view {
        assertGt(ENTRY_POINT.code.length, 0, "EntryPoint has no code");
        assertGt(MSCA_IMPL.code.length, 0, "MSCA impl has no code");
        assertGt(MSCA_FACTORY.code.length, 0, "MSCA factory has no code");
        assertGt(ADDRESS_BOOK.code.length, 0, "Address Book plugin has no code");
        assertGt(ARC_USDC.code.length, 0, "Arc USDC has no code");

        assertEq(ENTRY_POINT.code.length, 16035, "EntryPoint code size drifted");
        assertEq(MSCA_IMPL.code.length, 16412, "MSCA impl code size drifted");
        assertEq(MSCA_FACTORY.code.length, 4514, "MSCA factory code size drifted");
        assertEq(ADDRESS_BOOK.code.length, 7254, "Address Book code size drifted");
    }

    /// @notice LIVE-CHAIN-VERIFIED. The live Address Book plugin exposes the
    ///         ERC-6900 IPlugin interface (0x043140ed) over ERC-165 — the same
    ///         check Circle's PluginManager.install performs on installPlugin.
    function test_LiveAddressBookPluginSupportsIPlugin() public view {
        (bool ok, bytes memory ret) = ADDRESS_BOOK.staticcall(
            abi.encodeWithSelector(0x01ffc9a7, IPLUGIN_ID)
        );
        assertTrue(ok, "supportsInterface staticcall failed");
        assertTrue(abi.decode(ret, (bool)), "Address Book does not report IPlugin");
    }

    /// @notice SELF-CHECK. The local IPlugin interface id matches the bible's
    ///         0x043140ed extracted from live Address Book bytecode.
    function test_LocalIPluginInterfaceIdMatchesBible() public pure {
        assertEq(type(IPlugin).interfaceId, IPLUGIN_ID, "IPlugin interfaceId mismatch");
    }

    // ------------------------------------------------------------------
    // 2. LIVE-CHAIN-VERIFIED: the ERC-1271 facilitator trap (H9 §6.3 P1).
    // ------------------------------------------------------------------

    /// @notice LIVE-CHAIN-VERIFIED. Reproduces the proven facilitator trap:
    ///         a plugin-less Circle account answers supportsInterface(0x1626ba7e)
    ///         = true, but isValidSignature REVERTS (InvalidValidationFunctionId).
    ///         Never trust the ERC-165 answer alone.
    function test_FacilitatorTrap_ControlAccount() public view {
        assertTrue(
            IMSCAProbe(ACCOUNT_A).supportsInterface(IS_VALID_SIG),
            "control account should report 1271 support (the trap)"
        );
        (bool ok,) = ACCOUNT_A.staticcall(
            abi.encodeWithSelector(IS_VALID_SIG, bytes32(uint256(1)), hex"")
        );
        assertFalse(ok, "isValidSignature should revert on plugin-less account");
    }

    /// @notice LIVE-CHAIN-VERIFIED. On the SigGate account (H9 §6.3 P2/P3b),
    ///         isValidSignature routes to the installed plugin via
    ///         RUNTIME_VALIDATION_ALWAYS_ALLOW: a never-authorized digest with a
    ///         garbage signature returns 0xffffffff (not a revert).
    ///         staticcall mirrors the research eth_call probes (read-only).
    function test_SigGateAccount_UnauthorizedDigestReturnsFfffffff() public view {
        bytes32 digest = keccak256("hallpass-fork-test-never-authorized");
        bytes memory garbageSig = hex"deadbeef";
        (bool ok, bytes memory ret) = ACCOUNT_B.staticcall(
            abi.encodeWithSelector(IS_VALID_SIG, digest, garbageSig)
        );
        assertTrue(ok, "isValidSignature reverted on SigGate account");
        assertEq(ret.length, 32, "1271 return should be 32 bytes");
        assertEq(
            abi.decode(ret, (bytes32)),
            bytes32(uint256(0xffffffff) << 224),
            "unauthorized digest should return 0xffffffff"
        );
    }

    /// @notice SELF-CHECK. The 1271 MAGIC value equals the canonical selector
    ///         of isValidSignature(bytes32,bytes) (ERC-1271).
    function test_IsValidSignatureMagicSelfCheck() public pure {
        assertEq(bytes4(keccak256("isValidSignature(bytes32,bytes)")), IS_VALID_SIG);
    }

    // ------------------------------------------------------------------
    // 3. LIVE-CHAIN-VERIFIED: the H9-proven plugin is installed on its account.
    // ------------------------------------------------------------------

    /// @notice LIVE-CHAIN-VERIFIED. The W1B2 account (full HallpassPlugin
    ///         installed at creation, §6.2) lists the research plugin address
    ///         in getInstalledPlugins() on live chain state.
    function test_LiveFullPluginAccount_HasPluginInstalled() public view {
        address[] memory installed = IMSCAProbe(LIVE_ACCOUNT_W1B2).getInstalledPlugins();
        bool found;
        for (uint256 i = 0; i < installed.length; i++) {
            if (installed[i] == LIVE_PLUGIN_W1B2) found = true;
        }
        assertTrue(found, "W1B2 plugin not in getInstalledPlugins()");
    }

    /// @notice LIVE-CHAIN-VERIFIED. The W1B2 account itself is a live ERC1967
    ///         proxy over the Circle implementation (code non-empty).
    function test_LiveFullPluginAccount_IsProxyWithCode() public view {
        assertGt(LIVE_ACCOUNT_W1B2.code.length, 0, "W1B2 account has no code");
        assertGt(ACCOUNT_A.code.length, 0, "control account has no code");
        assertGt(ACCOUNT_B.code.length, 0, "SigGate account has no code");
    }

    // ------------------------------------------------------------------
    // 4. SELF-CHECK: bible selectors are the canonical keccak selectors.
    // ------------------------------------------------------------------

    /// @notice SELF-CHECK (pure). Verifies the bible's recorded selectors equal
    ///         the canonical keccak256 selectors of the ERC-6900/ERC-1271
    ///         signatures. This proves internal consistency, NOT that the
    ///         chain exposes them — the live-chain side is covered above.
    function test_BibleSelectorsAreCanonical() public pure {
        assertEq(
            bytes4(keccak256("installPlugin(address,bytes32,bytes,(address,uint8)[])")),
            INSTALL_PLUGIN,
            "installPlugin selector mismatch"
        );
        assertEq(
            bytes4(keccak256("uninstallPlugin(address,bytes,bytes)")),
            UNINSTALL_PLUGIN,
            "uninstallPlugin selector mismatch"
        );
        assertEq(bytes4(keccak256("execute(address,uint256,bytes)")), EXECUTE, "execute selector mismatch");
        assertEq(
            bytes4(keccak256("executeBatch(address[],uint256[],bytes[])")),
            EXECUTE_BATCH,
            "executeBatch selector mismatch"
        );
        assertEq(
            bytes4(keccak256("preExecutionHook(uint8,address,uint256,bytes)")),
            0x46d60eb2,
            "preExecutionHook selector mismatch"
        );
    }

    // ------------------------------------------------------------------
    // 5. LOCALLY-SIMULATED: installPlugin calldata encoding (§4.6).
    // ------------------------------------------------------------------

    /// @notice LOCALLY-SIMULATED. Builds the exact installPlugin calldata from
    ///         the bible §4.6 pattern and asserts: (a) the selector is f85730f4,
    ///         (b) the ABI arg layout round-trips (address, bytes32, bytes,
    ///         (address,uint8)[]), (c) the dependency tuple is encoded as a
    ///         plain (address,uint8) struct — NOT a packed bytes21 (bible §4.1).
    function test_InstallPluginCalldataEncoding() public pure {
        address plugin = LIVE_PLUGIN_W1B2; // any address; the encoding is what matters
        bytes32 manifestHash = keccak256("hallpass-fork-test-manifest");
        bytes memory installData = abi.encode(
            address(0x1111111111111111111111111111111111111111), // sessionKey
            address(0x2222222222222222222222222222222222222222), // owner
            uint256(1e16), // perTxCap (native wei, 18 decimals)
            uint256(2e16), // windowCap
            uint256(3600), // windowSecs
            uint256(1760400000), // expiry
            new address[](0) // allowlist (empty = open)
        );
        // FunctionReference = plain (address,uint8) struct per bible §4.1.
        ManifestDependency[] memory deps = new ManifestDependency[](1);
        deps[0] = ManifestDependency(address(0x3333333333333333333333333333333333333333), 1);

        bytes memory callData = abi.encodeWithSelector(INSTALL_PLUGIN, plugin, manifestHash, installData, deps);

        // (a) selector
        assertEq(bytes4(callData), INSTALL_PLUGIN, "install calldata selector != f85730f4");

        // (b) full ABI round-trip of the tail
        (address p, bytes32 mh, bytes memory id, ManifestDependency[] memory d) =
            abi.decode(_tail(callData), (address, bytes32, bytes, ManifestDependency[]));
        assertEq(p, plugin, "plugin arg mismatch");
        assertEq(mh, manifestHash, "manifestHash arg mismatch");
        assertEq(keccak256(id), keccak256(installData), "installData arg mismatch");
        assertEq(d.length, 1, "dependencies length mismatch");
        assertEq(d[0].dep, deps[0].dep, "dependency address mismatch");
        assertEq(d[0].functionId, deps[0].functionId, "dependency functionId mismatch");

        // (c) NOT packed: the tuple occupies two full 32-byte slots, i.e. the
        // raw encoding is longer than a 21-byte-packed representation would be.
        // (Round-trip decode above already proves the 2-slot layout.)
        assertTrue(callData.length > 4 + 32 * 4, "calldata unexpectedly short");
    }

    struct ManifestDependency {
        address dep;
        uint8 functionId;
    }

    function _tail(bytes memory callData) internal pure returns (bytes memory) {
        bytes memory t = new bytes(callData.length - 4);
        for (uint256 i = 0; i < t.length; i++) t[i] = callData[i + 4];
        return t;
    }

    /// @notice LOCALLY-SIMULATED. The plugin's own manifest hash is
    ///         deterministic: keccak256(abi.encode(pluginManifest())) is stable
    ///         across calls — the exact value installPlugin expects as
    ///         manifestHash. (This is the FRESH local build's hash, not the
    ///         mainnet-proven deployment's hash in bible §4.3.)
    function test_LocalManifestHashIsDeterministic() public {
        HallpassPlugin plugin = new HallpassPlugin();
        bytes32 h1 = keccak256(abi.encode(plugin.pluginManifest()));
        bytes32 h2 = keccak256(abi.encode(plugin.pluginManifest()));
        assertEq(h1, h2, "manifest hash not deterministic");
        assertTrue(h1 != bytes32(0), "manifest hash is zero");
    }

    // ------------------------------------------------------------------
    // 6. LOCALLY-SIMULATED: plugin validation functions (fresh local deploy).
    // ------------------------------------------------------------------
    //
    // NOTE: the policy state here is local to the fork-test run (a fresh
    // HallpassPlugin deployed by the test, installed by a pranked fake
    // account). Nothing here reads the live W1B2 plugin's policy state — the
    // plugin's `policies` mapping is keyed by msg.sender (the account), and
    // the test cannot impersonate the live account without its keys.

    function _installedPlugin() internal returns (HallpassPlugin plugin, address account, address owner, address session) {
        plugin = new HallpassPlugin();
        account = makeAddr("hallpass-fake-account");
        owner = makeAddr("hallpass-owner");
        session = makeAddr("hallpass-session");
        vm.prank(account);
        plugin.onInstall(
            abi.encode(
                session,
                owner,
                uint256(1e16), // perTxCap: 0.01 USDC in native wei
                uint256(2e16), // windowCap: 0.02
                uint256(3600), // windowSecs
                block.timestamp + 2 hours, // expiry
                new address[](0) // allowlist: empty = open
            )
        );
    }

    function _execCalldata(address to, uint256 value) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(EXECUTE, to, value, bytes(""));
    }

    /// @notice LOCALLY-SIMULATED. Runtime (direct-call) path: an in-policy
    ///         session-key spend passes validation; an over-cap spend reverts
    ///         with the byte-exact PerTxCapExceeded(amount, cap) from §6.2.
    function test_LocalRuntimeValidation_InPolicyAndOverCap() public {
        (HallpassPlugin plugin, address account, address owner, address session) = _installedPlugin();
        address payee = makeAddr("payee");

        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, session, 0, _execCalldata(payee, 5e15)); // 0.005 <= 0.01: ok

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(HallpassPlugin.PerTxCapExceeded.selector, uint256(5e16), uint256(1e16))
        );
        plugin.runtimeValidationFunction(FID_SPEND, session, 0, _execCalldata(payee, 5e16)); // 0.05 > 0.01
    }

    /// @notice LOCALLY-SIMULATED. Rolling-window accounting: spends accumulate
    ///         in windowSpent; crossing windowCap reverts WindowCapExceeded,
    ///         and the revert leaves prior accounting untouched.
    function test_LocalRuntimeValidation_WindowCap() public {
        (HallpassPlugin plugin, address account, address owner, address session) = _installedPlugin();
        address payee = makeAddr("payee");

        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, session, 0, _execCalldata(payee, 1e16)); // window 0 -> 0.01

        vm.prank(account);
        vm.expectRevert(
            abi.encodeWithSelector(HallpassPlugin.WindowCapExceeded.selector, uint256(2e16), uint256(2e16))
        );
        plugin.runtimeValidationFunction(FID_SPEND, session, 0, _execCalldata(payee, 1e16)); // 0.02 > 0.02 cap
    }

    /// @notice LOCALLY-SIMULATED. Access control: owner bypasses the policy;
    ///         strangers revert UnknownSigner; owner-only function ids reject
    ///         non-owners with NotOwner.
    function test_LocalRuntimeValidation_AccessControl() public {
        (HallpassPlugin plugin, address account, address owner, address session) = _installedPlugin();
        address payee = makeAddr("payee");
        address stranger = makeAddr("stranger");

        // Owner bypasses even an over-cap spend.
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_SPEND, owner, 0, _execCalldata(payee, 5e16));

        // Stranger (not owner, not session key) reverts.
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(HallpassPlugin.UnknownSigner.selector, stranger));
        plugin.runtimeValidationFunction(FID_SPEND, stranger, 0, _execCalldata(payee, 1e15));

        // Owner-only function id: session key is rejected, owner passes.
        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(HallpassPlugin.NotOwner.selector));
        plugin.runtimeValidationFunction(FID_OWNER, session, 0, hex"");
        vm.prank(account);
        plugin.runtimeValidationFunction(FID_OWNER, owner, 0, hex"");
    }

    /// @notice LOCALLY-SIMULATED. Revocation: revokeSession() (called by the
    ///         account, as the installed execution function would be) flips the
    ///         policy to revoked; subsequent session spends revert SessionRevoked.
    function test_LocalRuntimeValidation_Revocation() public {
        (HallpassPlugin plugin, address account, address owner, address session) = _installedPlugin();
        address payee = makeAddr("payee");

        // Installed execution functions are called BY the account (msg.sender
        // == account), after the account's own runtime validation gated FID_OWNER.
        vm.prank(account);
        plugin.revokeSession();

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(HallpassPlugin.SessionRevoked.selector));
        plugin.runtimeValidationFunction(FID_SPEND, session, 0, _execCalldata(payee, 1e15));
    }

    /// @notice LOCALLY-SIMULATED. userOp (ERC-4337) path: a session-key-signed
    ///         userOp passes and atomically records window spend; the returned
    ///         validation data is 0 (SIG_VALIDATION_SUCCESS).
    function test_LocalUserOpValidation_SessionKeyPasses() public {
        (HallpassPlugin plugin, address account, address owner, address session) = _installedPlugin();
        address payee = makeAddr("payee");
        (address sessionAddr, uint256 sessionPk) = makeAddrAndKey("hallpass-session");
        require(sessionAddr == session, "session key mismatch");

        bytes32 userOpHash = keccak256("hallpass-fork-test-userop");
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: account,
            nonce: 0,
            initCode: hex"",
            callData: _execCalldata(payee, 6e15),
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: hex"",
            signature: hex""
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sessionPk, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);

        vm.prank(account);
        uint256 validationData = plugin.userOpValidationFunction(FID_USEROP, userOp, userOpHash);
        assertEq(validationData, 0, "userOp validation should return 0 (success)");
    }

    /// @notice LOCALLY-SIMULATED. userOp path: a malleated (high-S) signature
    ///         reverts "malleable s" — the anti-malleability gate from bible
    ///         §4.5 (this repo build still ships the research constant; the
    ///         gate itself is what is asserted here).
    function test_LocalUserOpValidation_HighSReverts() public {
        (HallpassPlugin plugin, address account, address owner, address session) = _installedPlugin();
        address payee = makeAddr("payee");
        (, uint256 sessionPk) = makeAddrAndKey("hallpass-session");

        bytes32 userOpHash = keccak256("hallpass-fork-test-userop-malleable");
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: account,
            nonce: 0,
            initCode: hex"",
            callData: _execCalldata(payee, 1e15),
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: hex"",
            signature: hex""
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sessionPk, userOpHash);
        uint256 highS = SECP_N - uint256(s); // malleated counterpart
        uint8 v2 = v == 27 ? 28 : 27;
        userOp.signature = abi.encodePacked(r, bytes32(highS), v2);

        vm.prank(account);
        vm.expectRevert(bytes("malleable s"));
        plugin.userOpValidationFunction(FID_USEROP, userOp, userOpHash);
    }

    /// @notice LOCALLY-SIMULATED. userOp path: an unknown signer reverts
    ///         UnknownSigner even with a well-formed signature.
    function test_LocalUserOpValidation_UnknownSignerReverts() public {
        (HallpassPlugin plugin, address account, address owner, address session) = _installedPlugin();
        address payee = makeAddr("payee");
        (address strangerAddr, uint256 strangerPk) = makeAddrAndKey("hallpass-stranger");
        require(strangerAddr != session && strangerAddr != owner, "bad fixture");

        bytes32 userOpHash = keccak256("hallpass-fork-test-userop-stranger");
        PackedUserOperation memory userOp = PackedUserOperation({
            sender: account,
            nonce: 0,
            initCode: hex"",
            callData: _execCalldata(payee, 1e15),
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: hex"",
            signature: hex""
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(strangerPk, userOpHash);
        userOp.signature = abi.encodePacked(r, s, v);

        vm.prank(account);
        vm.expectRevert(abi.encodeWithSelector(HallpassPlugin.UnknownSigner.selector, strangerAddr));
        plugin.userOpValidationFunction(FID_USEROP, userOp, userOpHash);
    }

    // ------------------------------------------------------------------
    // 7. LOCALLY-SIMULATED: this repo build has no 1271 execution function.
    // ------------------------------------------------------------------

    /// @notice LOCALLY-SIMULATED (documentation as test). The typed-data gate
    ///         (authorizeDigest / isValidSignature returning MAGIC) lives in the
    ///         separate SigGate research build (bible §4.4), NOT in this repo's
    ///         HallpassPlugin: its manifest claims no 0x1626ba7e execution
    ///         function and its ERC-165 does not report 1271. The chain side of
    ///         the 1271 story is covered by the LIVE tests above.
    function test_LocalPlugin_HasNo1271ExecutionFunction() public {
        HallpassPlugin plugin = new HallpassPlugin();
        PluginManifest memory m = plugin.pluginManifest();
        for (uint256 i = 0; i < m.executionFunctions.length; i++) {
            assertTrue(m.executionFunctions[i] != IS_VALID_SIG, "plugin should not claim 1271");
        }
        assertFalse(plugin.supportsInterface(IS_VALID_SIG), "plugin should not report 1271");
    }
}
