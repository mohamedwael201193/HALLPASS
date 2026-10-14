// SPDX-License-Identifier: MIT
// HallpassPlugin — ERC-6900 v0.7 session-key policy plugin for Circle MSCAs on Arc.
// W1B (HALLPASS-9 sprint): minimal enforcement build. Types mirror
// circlefin/buidl-wallet-contracts src/msca/6900/v0.7 exactly.
pragma solidity ^0.8.0;

// ---- ERC-4337 v0.7 PackedUserOperation (account-abstraction layout) ----
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

// ---- ERC-6900 v0.7 manifest types (mirror Circle's PluginManifest.sol) ----
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

struct SelectorPermission {
    bytes4 functionSelector;
    string permissionDescription;
}

struct PluginMetadata {
    string name;
    string version;
    string author;
    SelectorPermission[] permissionDescriptors;
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

struct Call {
    address target;
    uint256 value;
    bytes data;
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

contract HallpassPlugin is IPlugin {
    // Function ids used in the manifest.
    uint8 internal constant FID_SPEND = 1; // runtime validation: session-key spend policy
    uint8 internal constant FID_USEROP = 2; // userOp validation: session-key/owner auth + policy
    uint8 internal constant FID_OWNER = 3; // runtime validation: owner-only management fns

    // Native MSCA selectors this plugin validates.
    bytes4 internal constant EXECUTE = 0xb61d27f6; // execute(address,uint256,bytes)
    bytes4 internal constant EXECUTE_BATCH = 0x34fcd5be; // executeBatch((address,uint256,bytes)[])
    bytes4 internal constant INSTALL_PLUGIN = 0xf85730f4;
    bytes4 internal constant UNINSTALL_PLUGIN = 0xc1a221f3;

    error NotOwner();
    error SessionRevoked();
    error SessionExpired(uint256 nowTs, uint256 expiry);
    error PerTxCapExceeded(uint256 amount, uint256 cap);
    error WindowCapExceeded(uint256 windowSpentAfter, uint256 cap);
    error RecipientNotAllowed(address target);
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
    event SpendAuthorized(
        address indexed account,
        address indexed sessionKey,
        address indexed to,
        uint256 amount,
        uint256 windowSpent
    );
    event SessionRevokedEvt(address indexed account, address indexed sessionKey);
    event PolicyUpdated(address indexed account, uint256 perTxCap, uint256 windowCap, uint256 expiry);

    struct Policy {
        address sessionKey;
        address owner;
        uint256 perTxCap; // native USDC wei (18 decimals on Arc)
        uint256 windowCap;
        uint256 windowSecs;
        uint256 expiry;
        address[] allowlist; // empty = open (caps-only mode)
        uint256 windowStart;
        uint256 windowSpent;
        bool revoked;
    }

    // Plugin is CALLED by accounts (not delegate-called): policy keyed by account.
    mapping(address => Policy) public policies;

    // ---------- install / uninstall ----------

    /// @dev data = abi.encode(sessionKey, owner, perTxCap, windowCap, windowSecs, expiry, allowlist)
    function onInstall(bytes calldata data) external override {
        (
            address sessionKey,
            address owner,
            uint256 perTxCap,
            uint256 windowCap,
            uint256 windowSecs,
            uint256 expiry,
            address[] memory allowlist
        ) = abi.decode(data, (address, address, uint256, uint256, uint256, uint256, address[]));
        if (sessionKey == address(0) || owner == address(0) || sessionKey == owner) revert BadInit();
        Policy storage p = policies[msg.sender]; // msg.sender == the MSCA
        p.sessionKey = sessionKey;
        p.owner = owner;
        p.perTxCap = perTxCap;
        p.windowCap = windowCap;
        p.windowSecs = windowSecs;
        p.expiry = expiry;
        p.allowlist = allowlist;
        p.windowStart = block.timestamp;
        p.windowSpent = 0;
        p.revoked = false;
        emit SessionRegistered(msg.sender, sessionKey, perTxCap, windowCap, expiry);
    }

    function onUninstall(bytes calldata) external override {
        delete policies[msg.sender];
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
            (address target, uint256 value,) = abi.decode(execCalldata[4:], (address, uint256, bytes));
            _checkCall(p, target, value);
            total = value;
            _recordWindow(p, total);
            emit SpendAuthorized(msg.sender, p.sessionKey, target, value, p.windowSpent);
        } else if (sel == EXECUTE_BATCH) {
            Call[] memory calls = abi.decode(execCalldata[4:], (Call[]));
            for (uint256 i = 0; i < calls.length; ++i) {
                _checkCall(p, calls[i].target, calls[i].value);
                total += calls[i].value;
            }
            _recordWindow(p, total);
            for (uint256 i = 0; i < calls.length; ++i) {
                emit SpendAuthorized(msg.sender, p.sessionKey, calls[i].target, calls[i].value, p.windowSpent);
            }
        } else {
            revert UnsupportedExecution(sel);
        }
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

    function _checkCall(Policy storage p, address target, uint256 value) internal view {
        if (value > p.perTxCap) revert PerTxCapExceeded(value, p.perTxCap);
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
        address[] calldata allowlist
    ) external {
        Policy storage p = policies[msg.sender];
        if (sessionKey == address(0) || sessionKey == p.owner) revert BadInit();
        p.sessionKey = sessionKey;
        p.perTxCap = perTxCap;
        p.windowCap = windowCap;
        p.windowSecs = windowSecs;
        p.expiry = expiry;
        p.allowlist = allowlist;
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

    function pluginManifest() external pure override returns (PluginManifest memory m) {
        m.executionFunctions = new bytes4[](2);
        m.executionFunctions[0] = this.revokeSession.selector;
        m.executionFunctions[1] = this.updatePolicy.selector;

        m.userOpValidationFunctions = new ManifestAssociatedFunction[](2);
        m.userOpValidationFunctions[0] =
            ManifestAssociatedFunction(EXECUTE, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_USEROP, 0));
        m.userOpValidationFunctions[1] = ManifestAssociatedFunction(
            EXECUTE_BATCH, ManifestFunction(ManifestAssociatedFunctionType.SELF, FID_USEROP, 0)
        );

        m.runtimeValidationFunctions = new ManifestAssociatedFunction[](6);
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
        // permitAnyExternalAddress=false, canSpendNativeToken=false,
        // no hooks, no dependencies — plugin never moves funds itself.
    }

    function pluginMetadata() external pure override returns (PluginMetadata memory m) {
        m.name = "Hallpass";
        m.version = "0.1.0";
        m.author = "HALLPASS-9/W1B";
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IPlugin).interfaceId || interfaceId == 0x01ffc9a7;
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
            let r := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch r
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
}
