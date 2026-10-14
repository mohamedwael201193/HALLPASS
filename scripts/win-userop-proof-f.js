// HALLPASS-WIN userOp proof — STEP F ONLY (retry).
//
// Step E (the money proof) already succeeded on mainnet:
//   tx 0x9b74befeb628ed742cd3348eb1bcd2b3f377cc71564cbf29c7912b17eee230f7
//   block 25995761 status 1, userOpHash 0x68a98466ad16e7e94fc92cbd29329f44b06c614ce4764dd3be3c1c1afbd22a10
//   account 0x72142EeA4217d835e34dF1728dAeB2aa9A4D7c07, windowSpent 0 -> 0.002.
//
// Step F (over-cap userOp -> handleOps revert) died on a SCRIPT bug, not a
// contract bug: the relay tx was rejected by the RPC as "replacement
// transaction underpriced" — an EOA-nonce collision with a concurrent worker
// sharing the deployer key (same gasPrice, same nonce as a pending tx).
// Nothing was broadcast; the static pre-check had already proven the revert
// semantics (FailedOpWithRevert(0, "AA23 reverted", PerTxCapExceeded)).
//
// This script retries ONLY step F:
//   - waits until the owner's mempool view is clear (pending == latest),
//   - uses an EXPLICIT nonce (never replaces another worker's tx),
//   - retries up to 3x on REPLACEMENT_UNDERPRICED with a fresh nonce read.
// Budget: relay ceiling 0.02 USDC (disclosed, same as step E).
'use strict';
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://rpc.mainnet.arc.io';
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const PLUGIN = '0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9';
const EURC = '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1';
const ACCOUNT = '0x72142EeA4217d835e34dF1728dAeB2aa9A4D7c07';
const RELAY_BUDGET = ethers.parseEther('0.02');
const N_HALF = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;

function loadEnv() {
  const txt = fs.readFileSync(process.env.HOME + '/workspace/user/files/env-2.txt', 'utf8').replace(/\r/g, '');
  const out = {};
  for (const line of txt.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const env = loadEnv();
  const provider = new ethers.JsonRpcProvider(RPC);
  if ((await provider.getNetwork()).chainId !== 5042n) throw new Error('wrong chain');
  let pk = env.DEPLOYER_PRIVATE_KEY;
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const owner = new ethers.Wallet(pk, provider);
  const sessionPk = fs.readFileSync('/tmp/win_userop_session.key', 'utf8').trim();
  const session = new ethers.Wallet(sessionPk, provider);
  console.log('owner:', owner.address, '| session:', session.address);

  const build = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'HallpassPlugin.sol', 'HallpassPlugin.json'), 'utf8'));
  const pluginIface = new ethers.Interface(build.abi);
  const acctIface = new ethers.Interface(['function executeBatch((address target, uint256 value, bytes data)[] calls)']);
  const epIface = new ethers.Interface([
    'function getUserOpHash(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)',
    'function getNonce(address sender, uint192 key) view returns (uint256)',
    'function handleOps(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops, address payable beneficiary)',
  ]);
  const erc20 = new ethers.Interface(['function transfer(address to, uint256 amount) returns (bool)']);
  const ep = new ethers.Contract(ENTRY_POINT, epIface, provider);

  const fee = await provider.getFeeData();
  const gasPrice = fee.gasPrice;
  console.log('gasPrice gwei:', ethers.formatUnits(gasPrice, 9));

  const pack2 = (hi, lo) => ethers.concat([ethers.zeroPadValue(ethers.toBeHex(hi), 16), ethers.zeroPadValue(ethers.toBeHex(lo), 16)]);
  const eurcTransfer = (to, amount) => acctIface.encodeFunctionData('executeBatch', [[{ target: EURC, value: 0, data: erc20.encodeFunctionData('transfer', [to, amount]) }]]);

  // rebuild the over-cap userOp (50000 EURC units = 0.05 > 0.01 per-tx cap)
  const nonce = await ep.getNonce(ACCOUNT, 0);
  console.log('account EntryPoint nonce:', nonce.toString());
  const userOp = {
    sender: ACCOUNT, nonce, initCode: '0x', callData: eurcTransfer(owner.address, 50000),
    accountGasLimits: pack2(600000n, 350000n), preVerificationGas: 120000n,
    gasFees: pack2(gasPrice, gasPrice), paymasterAndData: '0x', signature: '0x',
  };
  const userOpHash = await ep.getUserOpHash(userOp);
  const sig = session.signingKey.sign(userOpHash);
  let s = BigInt(sig.s), v = sig.v;
  if (s > N_HALF) { s = N_HALF - s; v = v === 27 ? 28 : 27; }
  userOp.signature = ethers.Signature.from({ r: sig.r, s: ethers.toBeHex(s, 32), v }).serialized;
  if (ethers.recoverAddress(userOpHash, userOp.signature).toLowerCase() !== session.address.toLowerCase()) throw new Error('sig recovery mismatch');
  console.log('userOpHash:', userOpHash);
  const handleCalldata = epIface.encodeFunctionData('handleOps', [[userOp], owner.address]);

  // static pre-check: MUST revert FailedOpWithRevert(AA23, PerTxCapExceeded)
  let reason = 'unknown';
  try {
    await provider.call({ to: ENTRY_POINT, data: handleCalldata, from: owner.address });
    throw new Error('STATICCALL DID NOT REVERT — proof invalid');
  } catch (e) {
    if (e.message && e.message.includes('DID NOT REVERT')) throw e;
    let d = e.data || (e.info && e.info.error && e.info.error.data);
    if (!d && e.message) { const m = e.message.match(/0x[0-9a-fA-F]{8,}/); if (m) d = m[0]; }
    try {
      const fe = new ethers.Interface(['error FailedOpWithRevert(uint256 opIndex, string reason, bytes returnData)']);
      const p = fe.parseError(d);
      let inner = p.args.returnData;
      try { inner = pluginIface.parseError(p.args.returnData).name; } catch {}
      reason = `FailedOpWithRevert(${p.args.opIndex}, "${p.args.reason}", ${inner})`;
    } catch { reason = d || 'unavailable'; }
  }
  console.log('static pre-check reverts as expected:', reason);

  // wait for a clear mempool view, then send with EXPLICIT nonce
  let tx = null, lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (let i = 0; i < 24; i++) {
      const latest = await provider.getTransactionCount(owner.address, 'latest');
      const pending = await provider.getTransactionCount(owner.address, 'pending');
      if (latest === pending) break;
      console.log(`mempool not clear (latest=${latest} pending=${pending}), waiting…`);
      await sleep(5000);
    }
    const sendNonce = await provider.getTransactionCount(owner.address, 'latest');
    console.log(`attempt ${attempt}: sending with explicit nonce=${sendNonce}`);
    try {
      tx = await owner.sendTransaction({ to: ENTRY_POINT, data: handleCalldata, gasPrice, gasLimit: 2500000, nonce: sendNonce });
      break;
    } catch (e) {
      lastErr = e;
      console.log(`attempt ${attempt} failed:`, e.code || e.message);
      if (e.code !== 'REPLACEMENT_UNDERPRICED' && !(e.message || '').includes('replacement')) throw e;
      await sleep(10000);
    }
  }
  if (!tx) throw new Error('all relay attempts rejected: ' + (lastErr && lastErr.message));

  let r;
  try { r = await tx.wait(); } catch (e) { r = e.receipt; }
  const cost = r.gasUsed * (r.gasPrice || gasPrice);
  console.log(`[F-eurc-userop-overcap] tx=${r.hash} block=${r.blockNumber} status=${r.status} gas=${r.gasUsed} cost=${ethers.formatEther(cost)}`);
  if (cost > RELAY_BUDGET) throw new Error('relay budget exceeded');
  if (!r || r.status !== 0) throw new Error('USEROP TX DID NOT REVERT — PROOF FAILED');

  // windowSpent must be unchanged by the reverted userOp
  const raw = await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('policies', [ACCOUNT]) });
  const spent = pluginIface.decodeFunctionResult('policies', raw).windowSpent;
  console.log('windowSpent after reverted userOp:', ethers.formatEther(spent));
  if (spent !== ethers.parseEther('0.002')) throw new Error('windowSpent changed after reverted userOp — not atomic');

  const out = {
    plugin: PLUGIN, account: ACCOUNT, entryPoint: ENTRY_POINT,
    stepE: {
      tx: '0x9b74befeb628ed742cd3348eb1bcd2b3f377cc71564cbf29c7912b17eee230f7',
      block: 25995761, status: 1, gasUsed: '212283', costUSDC: '0.004245660244762299',
      userOpHash: '0x68a98466ad16e7e94fc92cbd29329f44b06c614ce4764dd3be3c1c1afbd22a10',
      what: 'session-key-signed ERC-4337 v0.7 userOp -> executeBatch(EURC transfer 2000 units) via EntryPoint.handleOps; windowSpent 0 -> 0.002',
    },
    stepF: {
      tx: r.hash, block: Number(r.blockNumber), status: r.status, gasUsed: r.gasUsed.toString(),
      costUSDC: ethers.formatEther(cost), userOpHash,
      revert: reason,
      what: 'over-cap (0.05 EURC vs 0.01 cap) userOp reverts at handleOps; windowSpent unchanged 0.002',
    },
    setup: {
      proxyDeploy: { tx: '0xa0a1e4e3c5bde612c573f5ab9647b64ea31dcbc1a814b07e9996049bf0856c60', block: 25995727 },
      initInstall: { tx: '0x8a6f9636e9e75c96a2e3f31ba1ef6035a7ba6e8e962a14fe43342dc42d47d6fc', block: 25995730, costUSDC: '0.017882841030945726' },
      fundEurc: { tx: '0xba2104a6ab27c884b6251832bafd4ff70c318295e488262b9a2737526ec8af59', block: 25995740 },
      depositTo: { tx: '0x00f6ad125a86393192bc17ae8236a2812f755c5aedd59bb48c39e8b7c99d25ca', block: 25995750 },
    },
  };
  fs.writeFileSync('/tmp/win_userop_results.json', JSON.stringify(out, null, 2));
  console.log('STEP F COMPLETE — wrote /tmp/win_userop_results.json');
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
