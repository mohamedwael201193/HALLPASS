// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

// Minimal ERC-4337 v0.7 / ERC-6900 type surface (no imports — self-contained).
struct PackedUserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    bytes32 accountGasLimits;
    uint256 preVerificationGas;
    bytes32 gasFees;
    bytes paymasterAndData;
    bytes signature;
}

struct Call {
    address target;
    uint256 value;
    bytes data;
}

enum ManifestAssociatedFunctionType {
    NONE,
    SELF,
    DEPENDENCY,
    RUNTIME_VALIDATION_ALWAYS_ALLOW,
    PRE_HOOK_ALWAYS_DENY
}

struct ManifestFunction {
    ManifestAssociatedFunctionType functionType;
    uint8 functionId;
    uint256 dependencyIndex;
}

struct ManifestAssociatedFunction {
    bytes4 executionSelector;
    ManifestFunction associatedFunction;
}

struct ManifestExecutionHook {
    bytes4 selector;
    ManifestFunction preExecHook;
    ManifestFunction postExecHook;
}

struct ManifestExternalCallPermission {
    address externalAddress;
    bool permitAnySelector;
    bytes4[] selectors;
}

struct PluginManifest {
    bytes4[] interfaceIds;
    bytes4[] dependencyInterfaceIds;
    bytes4[] executionFunctions;
    bytes4[] permittedExecutionSelectors;
    bool permitAnyExternalAddress;
    bool canSpendNativeToken;
    ManifestExternalCallPermission[] permittedExternalCalls;
    ManifestAssociatedFunction[] userOpValidationFunctions;
    ManifestAssociatedFunction[] runtimeValidationFunctions;
    ManifestAssociatedFunction[] preUserOpValidationHooks;
    ManifestAssociatedFunction[] preRuntimeValidationHooks;
    ManifestExecutionHook[] executionHooks;
}

struct PluginMetadata {
    string name;
    string version;
    string author;
}

interface IPlugin {
    function onInstall(bytes calldata data) external;
    function onUninstall(bytes calldata data) external;
    function preUserOpValidationHook(uint8 functionId, PackedUserOperation calldata userOp, bytes32 userOpHash)
        external
        returns (uint256);
    function userOpValidationFunction(uint8 functionId, PackedUserOperation calldata userOp, bytes32 userOpHash)
        external
        returns (uint256);
    function preRuntimeValidationHook(uint8 functionId, address sender, uint256 value, bytes calldata data) external;
    function runtimeValidationFunction(uint8 functionId, address sender, uint256 value, bytes calldata data) external;
    function preExecutionHook(uint8 functionId, address sender, uint256 value, bytes calldata data)
        external
        returns (bytes memory);
    function postExecutionHook(uint8 functionId, bytes calldata preExecHookData) external;
    function pluginManifest() external pure returns (PluginManifest memory);
    function pluginMetadata() external pure returns (PluginMetadata memory);
}

/// @title HallpassPlugin v0.2.0 — per-account session-key spending policy for Circle MSCA (ERC-6900).
/// @notice Caps apply to NATIVE value transfers AND recognized ERC-20 transfers (multi-asset).
///         ERC-20 amounts are normalized to 18 decimals via per-token decimals before cap checks.
///         Typed-data path (EIP-1271 / x402 facilitator settlement) via authorizeDigest + isValidSignature.
contract HallpassPlugin is IPlugin {
    // Function ids used in the manifest.
    uint8 internal constant FID_SPEND = 1; // runtime validation: session-key spend policy
    uint8 internal constant FID_USEROP = 2; // userOp validation: session-key/owner auth + policy
    uint8 internal constant FID_OWNER = 3; // runtime validation: owner-only management fns
    uint8 internal constant FID_DIGEST = 4; // runtime validation: session-key-or-owner digest fns

    // Native MSCA selectors this plugin validates.
    bytes4 internal constant EXECUTE = 0xb61d27f6; // execute(address,uint256,bytes)
    bytes4 internal constant EXECUTE_BATCH = 0x34fcd5be; // executeBatch((address,uint256,bytes)[])
    bytes4 internal constant INSTALL_PLUGIN = 0xf85730f4;
    bytes4 internal constant UNINSTALL_PLUGIN = 0xc1a221f3;

    // ERC-20 + ERC-1271 selectors.
    bytes4 internal constant TRANSFER = 0xa9059cbb; // transfer(address,uint256)
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e; // isValidSignature return value
    bytes4 internal constant ERC1271_INVALID = 0xffffffff;

    error NotOwner();
    error NotSessionKeyOrOwner(address caller);
    error SessionRevoked();
    error SessionExpired(uint256 nowTs, uint256 expiry);
    error PerTxCapExceeded(uint256 amount, uint256 cap);
    error WindowCapExceeded(uint256 windowSpentAfter, uint256 cap);
    error RecipientNotAllowed(address target);
    error TokenNotAllowed(address token);
    error TokenCallNotAllowed(address token, bytes4 selector);
    error BadTokenConfig();
    error DigestNotAuthorized(bytes32 digest);
    error DigestExpired(uint256 nowTs, uint256 expiry);
    error UnknownSigner(address signer);
    error UnsupportedExecution(bytes4 sel);
    error BadInit();
    error UnknownFunctionId(uint8 functionId);

    event SessionRegistered(
        address indexed account,
        address indexed sessionKey,
        uint256 perTxCap,
        uint256 windowCap,
        uint256 expiry
    );
    /// @dev For ERC-20 transfers, `to` is the transfer recipient and `amount` is the
    ///      18-decimal-normalized spend. For native spends, `to`/`amount` are the call target/value.
    event SpendAuthorized(
        address indexed account,
        address indexed sessionKey,
        address indexed to,
        uint256 amount,
        uint256 windowSpent
    );
    event SessionRevokedEvt(address indexed account, address indexed sessionKey);
    event PolicyUpdated(address indexed account, uint256 perTxCap, uint256 windowCap, uint256 expiry);
    event DigestAuthorized(
        address indexed account, bytes32 indexed digest, address token, address to, uint256 spend, uint64 expiry
    );
    event DigestRevoked(address indexed account, bytes32 indexed digest);

    struct Policy {
        address sessionKey;
        address owner;
        uint256 perTxCap; // 18-decimal-normalized units (native wei, or token amount * 10^(18-decimals))
        uint256 windowCap;
        uint256 windowSecs;
        uint256 expiry;
        address[] allowlist; // empty = open (caps-only mode). Gates: recipient for native, TOKEN for ERC-20.
        uint256 windowStart;
        uint256 windowSpent;
        bool revoked;
        address[] tokens; // recognized ERC-20s. Empty = legacy mode (native-only checks, v0.1.x behavior).
        uint8[] tokenDecimals; // parallel to tokens
    }

    struct DigestAuth {
        address token; // address(0) = native
        address to;
        uint256 amount; // token-native decimals (wei if native)
        uint64 expiry;
        bool revoked;
    }

    // Plugin is CALLED by accounts (not delegate-called): state keyed by account.
    mapping(address => Policy) public policies;
    mapping(address => mapping(bytes32 => DigestAuth)) public digestAuths;

    // ---------- install / uninstall ----------

    /// @dev data = abi.encode(sessionKey, owner, perTxCap, windowCap, windowSecs,
    ///                       expiry, allowlist, tokens, tokenDecimals)
    function onInstall(bytes calldata data) external override {
        (
            address sessionKey,
            address owner,
            uint256 perTxCap,
            uint256 windowCap,
            uint256 windowSecs,
            uint256 expiry,
            address[] memory allowlist,
            address[] memory tokens,
            uint8[] memory tokenDecimals
        ) = abi.decode(data, (address, address, uint256, uint256, uint256, uint256, address[], address[], uint8[]));
        if (sessionKey == address(0) || owner == address(0) || sessionKey == owner) revert BadInit();
        _validateTokenConfig(tokens, tokenDecimals);
        Policy storage p = policies[msg.sender]; // msg.sender == the MSCA
        p.sessionKey = sessionKey;
        p.owner = owner;
        p.perTxCap = perTxCap;
        p.windowCap = windowCap;
        p.windowSecs = windowSecs;
        p.expiry = expiry;
        p.allowlist = allowlist;
        p.tokens = tokens;
        p.tokenDecimals = tokenDecimals;
        p.windowStart = block.timestamp;
        p.windowSpent = 0;
        p.revoked = false;
        emit SessionRegistered(msg.sender, sessionKey, perTxCap, windowCap, expiry);
    }

    function onUninstall(bytes calldata) external override {
        delete policies[msg.sender];
    }

    function _validateTokenConfig(address[] memory tokens, uint8[] memory tokenDecimals) internal pure {
        if (tokens.length != tokenDecimals.length) revert BadTokenConfig();
        for (uint256 i = 0; i < tokens.length; ++i) {
            if (tokens[i] == address(0) || tokenDecimals[i] > 18) revert BadTokenConfig();
            for (uint256 j = 0; j < i; ++j) {
                if (tokens[j] == tokens[i]) revert BadTokenConfig(); // no duplicates
            }
        }
    }

    /// @dev Returns (decimals, recognized).
    function _tokenDecimals(Policy storage p, address token) internal view returns (uint8, bool) {
        for (uint256 i = 0; i < p.tokens.length; ++i) {
            if (p.tokens[i] == token) return (p.tokenDecimals[i], true);
        }
        return (0, false);
    }

    // ---------- validation: direct (runtime) path ----------

    function runtimeValidationFunction(uint8 functionId, address sender, uint256, bytes calldata data)
        external
        override
    {
        Policy storage p = policies[msg.sender]; // msg.sender == the MSCA
        if (functionId == FID_OWNER) {
            if (p.owner == address(0) || sender != p.owner) revert NotOwner();
            return;
        }
        if (functionId == FID_DIGEST) {
            if (p.revoked) revert SessionRevoked();
            if (block.timestamp >= p.expiry) revert SessionExpired(block.timestamp, p.expiry);
            if (sender != p.sessionKey && sender != p.owner) revert NotSessionKeyOrOwner(sender);
            return;
        }
        if (functionId != FID_SPEND) revert UnknownFunctionId(functionId);
        if (p.owner != address(0) && sender == p.owner) return; // owner bypass
        if (p.sessionKey == address(0) || sender != p.sessionKey) revert UnknownSigner(sender);
        _authorizeSpend(p, data);
    }

    // ---------- validation: ERC-4337 userOp path ----------

    function userOpValidationFunction(uint8 functionId, PackedUserOperation calldata userOp, bytes32 userOpHash)
        external
        override
        returns (uint256)
    {
        if (functionId != FID_USEROP) revert UnknownFunctionId(functionId);
        Policy storage p = policies[msg.sender]; // msg.sender == the MSCA
        address signer = _recover(userOpHash, userOp.signature);
        if (p.owner != address(0) && signer == p.owner) return 0; // SIG_VALIDATION_SUCCESS
        if (p.sessionKey == address(0) || signer != p.sessionKey) revert UnknownSigner(signer);
        // NOTE (7562): window accounting is written here in validation. Honest for a
        // self-relayed handleOps (no bundler mempool rules), disclosed in the report.
        _authorizeSpend(p, userOp.callData);
        return 0;
    }

    // ---------- policy core: check-and-record (TOCTOU-atomic) ----------

    function _authorizeSpend(Policy storage p, bytes calldata execCalldata) internal {
        if (p.revoked) revert SessionRevoked();
        if (block.timestamp >= p.expiry) revert SessionExpired(block.timestamp, p.expiry);
        bytes4 sel = bytes4(execCalldata[:4]);
        uint256 total;
        if (sel == EXECUTE) {
            (address target, uint256 value, bytes memory data) =
                abi.decode(execCalldata[4:], (address, uint256, bytes));
            uint256 spend = _spendValue(p, target, value, data);
            _checkCall(p, target, spend);
            total = spend;
            _recordWindow(p, total);
            emit SpendAuthorized(msg.sender, p.sessionKey, _spendRecipient(p, target, data), spend, p.windowSpent);
        } else if (sel == EXECUTE_BATCH) {
            Call[] memory calls = abi.decode(execCalldata[4:], (Call[]));
            uint256[] memory spends = new uint256[](calls.length);
            for (uint256 i = 0; i < calls.length; ++i) {
                spends[i] = _spendValue(p, calls[i].target, calls[i].value, calls[i].data);
                _checkCall(p, calls[i].target, spends[i]);
                total += spends[i];
            }
            _recordWindow(p, total);
            for (uint256 i = 0; i < calls.length; ++i) {
                emit SpendAuthorized(
                    msg.sender, p.sessionKey, _spendRecipient(p, calls[i].target, calls[i].data), spends[i], p.windowSpent
                );
            }
        } else {
            revert UnsupportedExecution(sel);
        }
    }

    /// @dev Effective spend of one call in 18-decimal-normalized units: native value plus,
    ///      in strict mode (tokens.length > 0), recognized ERC-20 transfer amounts.
    function _spendValue(Policy storage p, address target, uint256 value, bytes memory data)
        internal
        view
        returns (uint256 spend)
    {
        spend = value;
        if (p.tokens.length == 0) return spend; // legacy mode: native-only, v0.1.x behavior
        if (data.length < 4) return spend;
        bytes4 csel = bytes4(data);
        (uint8 dec, bool recognized) = _tokenDecimals(p, target);
        if (recognized) {
            // Only plain transfer() is allowed on recognized tokens: approve/transferFrom/
            // permit would let the session key grant itself an off-policy spending path.
            if (csel != TRANSFER) revert TokenCallNotAllowed(target, csel);
            if (data.length != 68) revert TokenCallNotAllowed(target, csel);
            (, uint256 amount) = _decodeTransfer(data);
            spend += amount * (10 ** (18 - dec));
        } else if (csel == TRANSFER && data.length == 68) {
            // Transfer-shaped call to an unlisted token: deny (fail-closed).
            revert TokenNotAllowed(target);
        }
    }

    /// @dev Decode transfer(address,uint256) args from 68-byte calldata (4-byte selector + 64).
    function _decodeTransfer(bytes memory data) internal pure returns (address to, uint256 amount) {
        assembly {
            to := and(mload(add(data, 36)), 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)
            amount := mload(add(data, 68))
        }
    }

    /// @dev Event recipient: the ERC-20 transfer payee for token spends, else the call target.
    function _spendRecipient(Policy storage p, address target, bytes memory data) internal view returns (address) {
        if (p.tokens.length > 0 && data.length == 68 && bytes4(data) == TRANSFER) {
            (, bool recognized) = _tokenDecimals(p, target);
            if (recognized) {
                (address to,) = _decodeTransfer(data);
                return to;
            }
        }
        return target;
    }

    function _recordWindow(Policy storage p, uint256 total) internal {
        if (total > p.perTxCap) revert PerTxCapExceeded(total, p.perTxCap);
        if (block.timestamp >= p.windowStart + p.windowSecs) {
            p.windowStart = block.timestamp;
            p.windowSpent = 0;
        }
        if (p.windowSpent + total > p.windowCap) revert WindowCapExceeded(p.windowSpent + total, p.windowCap);
        p.windowSpent += total;
    }

    function _checkCall(Policy storage p, address target, uint256 spend) internal view {
        if (spend > p.perTxCap) revert PerTxCapExceeded(spend, p.perTxCap);
        if (p.allowlist.length > 0) {
            bool ok;
            for (uint256 i = 0; i < p.allowlist.length; ++i) {
                if (p.allowlist[i] == target) {
                    ok = true;
                    break;
                }
            }
            if (!ok) revert RecipientNotAllowed(target);
        }
    }

    // ---------- typed-data path (EIP-1271 / x402 facilitator settlement) ----------

    /// @dev Pre-authorize a typed-data digest through the account. Gated by FID_DIGEST
    ///      (session key or owner). Reserves the window cap at pre-auth time because the
    ///      actual settlement (EIP-3009 transferWithAuthorization on the token) never
    ///      touches the account — pre-auth is the only enforcement point.
    /// @param token address(0) = native spend of `amount` wei to `to`; else ERC-20
    ///        transfer of `amount` (token-native decimals) of `token` to `to`.
    function authorizeDigest(bytes32 digest, address token, address to, uint256 amount, uint64 expiry) external {
        Policy storage p = policies[msg.sender]; // msg.sender == the MSCA (runtime validation already gated caller)
        if (expiry <= block.timestamp) revert DigestExpired(block.timestamp, expiry);
        uint256 spend = _normalizeDigestAmount(p, token, amount);
        if (spend > p.perTxCap) revert PerTxCapExceeded(spend, p.perTxCap);
        address gated = token == address(0) ? to : token;
        if (p.allowlist.length > 0) {
            bool ok;
            for (uint256 i = 0; i < p.allowlist.length; ++i) {
                if (p.allowlist[i] == gated) {
                    ok = true;
                    break;
                }
            }
            if (!ok) revert RecipientNotAllowed(gated);
        }
        _recordWindow(p, spend);
        DigestAuth storage d = digestAuths[msg.sender][digest];
        d.token = token;
        d.to = to;
        d.amount = amount;
        d.expiry = expiry;
        d.revoked = false;
        emit DigestAuthorized(msg.sender, digest, token, to, spend, expiry);
    }

    function _normalizeDigestAmount(Policy storage p, address token, uint256 amount) internal view returns (uint256) {
        if (token == address(0)) return amount;
        (uint8 dec, bool recognized) = _tokenDecimals(p, token);
        if (!recognized) revert TokenNotAllowed(token);
        return amount * (10 ** (18 - dec));
    }

    /// @dev Revoke a pre-authorized digest (session key or owner, via FID_DIGEST).
    function revokeDigest(bytes32 digest) external {
        // msg.sender == the MSCA; caller already gated by FID_DIGEST runtime validation.
        digestAuths[msg.sender][digest].revoked = true;
        emit DigestRevoked(msg.sender, digest);
    }

    /// @dev ERC-1271. View-only (safe under facilitators' staticcall). Returns MAGIC iff the
    ///      digest was pre-authorized via authorizeDigest, is unexpired/unrevoked, the session
    ///      is live, and ecrecover(digest, sig) == sessionKey. No used-flag SSTORE: replay
    ///      protection is the EIP-3009 nonce at settlement + digest expiry + revokeDigest.
    function isValidSignature(bytes32 digest, bytes calldata sig) external view returns (bytes4) {
        Policy storage p = policies[msg.sender]; // msg.sender == the MSCA
        if (p.sessionKey == address(0) || p.revoked) return ERC1271_INVALID;
        DigestAuth storage d = digestAuths[msg.sender][digest];
        if (d.expiry == 0 || d.revoked || block.timestamp > d.expiry) return ERC1271_INVALID;
        (address signer, bool ok) = _tryRecover(digest, sig);
        if (!ok || signer != p.sessionKey) return ERC1271_INVALID;
        return ERC1271_MAGIC;
    }

    // ---------- owner management (installed execution functions) ----------

    /// @dev Called via the account fallback; runtime validation (FID_OWNER) already gated the caller.
    function revokeSession() external {
        Policy storage p = policies[msg.sender];
        p.revoked = true;
        emit SessionRevokedEvt(msg.sender, p.sessionKey);
    }

    /// @dev Owner policy update: resets window accounting and clears revocation.
    function updatePolicy(
        address sessionKey,
        uint256 perTxCap,
        uint256 windowCap,
        uint256 windowSecs,
        uint256 expiry,
        address[] calldata allowlist,
        address[] calldata tokens,
        uint8[] calldata tokenDecimals
    ) external {
        // msg.sender == the MSCA; caller already gated by FID_OWNER runtime validation.
        if (sessionKey == address(0) || sessionKey == policies[msg.sender].owner) revert BadInit();
        _validateTokenConfig(tokens, tokenDecimals);
        Policy storage p = policies[msg.sender];
        p.sessionKey = sessionKey;
        p.perTxCap = perTxCap;
        p.windowCap = windowCap;
        p.windowSecs = windowSecs;
        p.expiry = expiry;
        p.allowlist = allowlist;
        p.tokens = tokens;
        p.tokenDecimals = tokenDecimals;
        p.windowStart = block.timestamp;
        p.windowSpent = 0;
        p.revoked = false;
        emit PolicyUpdated(msg.sender, perTxCap, windowCap, expiry);
    }

    // ---------- unused IPlugin hooks (required by the interface) ----------

    function preUserOpValidationHook(uint8, PackedUserOperation calldata, bytes32)
        external
        pure
        override
        returns (uint256)
    {
        return 0;
    }

    function preRuntimeValidationHook(uint8, address, uint256, bytes calldata) external pure override {}

    function preExecutionHook(uint8, address, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes memory)
    {
        return "";
    }

    function postExecutionHook(uint8, bytes calldata) external pure override {}

    // ---------- manifest / metadata / ERC-165 ----------

    function pluginManifest() external pure virtual override returns (PluginManifest memory m) {
        m.executionFunctions = new bytes4[](5);
        m.executionFunctions[0] = this.revokeSession.selector;
        m.executionFunctions[1] = this.updatePolicy.selector;
        m.executionFunctions[2] = this.authorizeDigest.selector;
        m.executionFunctions[3] = this.revokeDigest.selector;
        m.executionFunctions[4] = this.isValidSignature.selector; // 0x1626ba7e

        m.userOpValidationFunctions = new ManifestAssociatedFunction[](2);
        m.userOpValidationFunctions[0] =
            ManifestAssociatedFunction(EXECUTE, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_USEROP, 0));
        m.userOpValidationFunctions[1] = ManifestAssociatedFunction(
            EXECUTE_BATCH, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_USEROP, 0)
        );

        m.runtimeValidationFunctions = new ManifestAssociatedFunction[](8);
        m.runtimeValidationFunctions[0] =
            ManifestAssociatedFunction(EXECUTE, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_SPEND, 0));
        m.runtimeValidationFunctions[1] = ManifestAssociatedFunction(
            EXECUTE_BATCH, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_SPEND, 0)
        );
        m.runtimeValidationFunctions[2] = ManifestAssociatedFunction(
            INSTALL_PLUGIN, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_OWNER, 0)
        );
        m.runtimeValidationFunctions[3] = ManifestAssociatedFunction(
            UNINSTALL_PLUGIN, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_OWNER, 0)
        );
        m.runtimeValidationFunctions[4] = ManifestAssociatedFunction(
            this.revokeSession.selector, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_OWNER, 0)
        );
        m.runtimeValidationFunctions[5] = ManifestAssociatedFunction(
            this.updatePolicy.selector, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_OWNER, 0)
        );
        m.runtimeValidationFunctions[6] = ManifestAssociatedFunction(
            this.authorizeDigest.selector, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_DIGEST, 0)
        );
        m.runtimeValidationFunctions[7] = ManifestAssociatedFunction(
            this.revokeDigest.selector, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_DIGEST, 0)
        );
        // Note: isValidSignature is NOT registered as a runtime validation. It is a view-only
        // function callable directly on the plugin by anyone (e.g. x402 facilitators via staticcall).
        // The deployed PluginManager does not support RUNTIME_VALIDATION_ALWAYS_ALLOW.
        // permitAnyExternalAddress=false, canSpendNativeToken=false,
        // no hooks, no dependencies — plugin never moves funds itself.
    }

    function pluginMetadata() external pure override returns (PluginMetadata memory m) {
        m.name = "Hallpass";
        m.version = "0.2.0";
        m.author = "HALLPASS-9/W1B";
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        // 0x043140ed = IPlugin interface ID of the DEPLOYED PluginManager (0x00000005e69188224e4dEeF607801916DC0936d5).
        // The vendored Circle source computes 0x9ce39c57, but the deployed manager uses 0x043140ed
        // (proven: H9 plugin 0x7C91 supports 0x043140ed and installs successfully).
        return interfaceId == 0x043140ed || interfaceId == 0x01ffc9a7;
    }

    // ---------- ECDSA ----------

    function _recover(bytes32 hash, bytes memory sig) internal pure returns (address) {
        require(sig.length == 65, "bad sig len");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v < 27) v += 27;
        require(v == 27 || v == 28, "bad v");
        require(
            uint256(s) <= 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0,
            "malleable s"
        );
        address signer = ecrecover(hash, v, r, s);
        require(signer != address(0), "bad sig");
        return signer;
    }

    /// @dev Non-reverting variant for isValidSignature (must never revert under staticcall).
    function _tryRecover(bytes32 hash, bytes calldata sig) internal pure returns (address signer, bool ok) {
        if (sig.length != 65) return (address(0), false);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return (address(0), false);
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return (address(0), false);
        }
        signer = ecrecover(hash, v, r, s);
        if (signer == address(0)) return (address(0), false);
        return (signer, true);
    }
}

// Minimal ERC1967 proxy (OZ layout) for deploying Circle's UpgradableMSCA implementation directly.
contract HallpassProxy {
    constructor(address _logic, bytes memory _data) payable {
        assembly {
            sstore(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc, _logic)
        }
        if (_data.length > 0) {
            (bool ok,) = _logic.delegatecall(_data);
            require(ok, "init failed");
        }
    }

    fallback() external payable {
        assembly {
            let impl := sload(0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc)
            calldatacopy(0, 0, calldatasize())
            let res := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch res
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
