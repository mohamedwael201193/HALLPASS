// SPDX-License-Identifier: MIT
// DeployHallpass — forge deploy script for the HALLPASS plugin on Arc mainnet (chain 5042).
//
// Private key handling (HARD RULE): the key is supplied ONLY via the CLI flag
//   forge script script/DeployHallpass.s.sol --rpc-url https://rpc.mainnet.arc.io \
//       --private-key "$DEPLOYER_PRIVATE_KEY" --broadcast
// (see scripts/deploy.sh). The script never hardcodes a key, never reads an env
// file, never prints a secret. `vm.startBroadcast()` with no arguments picks up
// the --private-key flag.
//
// Gas lesson (H9 sprint, real mainnet OOG): plugin deploy costs ~1.8M gas and a
// 1.5M limit burned 0.036 USDC. The deploy transaction MUST carry a gas limit
// >= 2.2M. Solidity forbids `{gas: ...}` on `new`, so the limit is enforced by
// scripts/deploy.sh via forge's --gas-estimate-multiplier (see that file).
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {HallpassPlugin} from "../src/HallpassPlugin.sol";

contract DeployHallpass is Script {
    function run() external {
        require(block.chainid == 5042, "DeployHallpass: wrong chain, expected Arc mainnet (5042)");

        vm.startBroadcast(); // key comes from --private-key; nothing else is read
        HallpassPlugin plugin = new HallpassPlugin();
        vm.stopBroadcast();

        address pluginAddr = address(plugin);
        // Verified empirically (forge 1.8.5): with --private-key, the script's
        // tx.origin IS the key's address. scripts/deploy.sh cross-checks this
        // against `cast wallet address` before broadcasting.
        address deployer = tx.origin;
        uint256 blk = block.number;

        console.log("HallpassPlugin deployed at:", pluginAddr);
        console.log("deployer:", deployer);
        console.log("blockNumber:", blk);

        // NOTE on txHash: forge only writes broadcast artifacts AFTER run()
        // returns, so the deployment tx hash is unknowable in-script. The script
        // records everything it can; scripts/deploy.sh backfills "txHash" from
        // broadcast/DeployHallpass.s.sol/5042/run-latest.json after a real
        // --broadcast run. In dry-run it stays a placeholder.
        string memory json = string.concat(
            "{\n",
            '  "plugin": "',
            vm.toString(pluginAddr),
            '",\n',
            '  "deployer": "',
            vm.toString(deployer),
            '",\n',
            '  "blockNumber": ',
            vm.toString(blk),
            ',\n',
            '  "txHash": "DRY_RUN_NO_TX"\n',
            "}"
        );
        vm.writeFile("deployments/arc-5042.json", json);
        console.log("wrote deployments/arc-5042.json");
    }
}
