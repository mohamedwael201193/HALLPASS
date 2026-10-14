// SPDX-License-Identifier: MIT
// Probe: what broadcaster context is visible inside a forge script when the
// private key is supplied ONLY via --private-key (dry run, nothing broadcast).
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

contract Probe is Script {
    function run() external {
        console.log("before  msg.sender:", msg.sender);
        console.log("before  tx.origin :", tx.origin);
        vm.startBroadcast(); // key comes from --private-key CLI flag
        console.log("after   msg.sender:", msg.sender);
        console.log("after   tx.origin :", tx.origin);
        console.log("block.number     :", block.number);
        vm.stopBroadcast();
    }
}
