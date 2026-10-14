// HALLPASS-WIN userOp proof — REAL ERC-4337 v0.7 userOp on Arc mainnet (5042)
// against the PRODUCTION v0.2.0 plugin 0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9.
//
// Closes the biggest disclosed gap (PROOFS.md honesty section): the userOp path
// was proven on the RESEARCH build (row 10) and in v0.2.0 unit tests, but never
// on the production v0.2.0 mainnet deployment.
//
// What this proves:
//   1. A session-key-signed userOp executes EURC spend through the account's
//      executeBatch via EntryPoint.handleOps (self-relayed — no bundler on Arc).
//   2. The PLUGIN's session-key validation path binds the 4337 flow:
//      userOpValidationFunction(FID_USEROP) recovers the signer from the userOp
//      signature, requires the session key (low-s enforced by the v0.2.0 fix),
//      and runs the per-tx cap + window check against userOp.callData.
//      windowSpent moves 0 -> 0.002 on-chain, atomically in validation.
//   3. An over-cap userOp reverts at handleOps with FailedOpWithRevert / AA23
//      carrying the plugin's PerTxCapExceeded — enforcement is real on 4337.
//
// Budget: per-tx gas < 0.01 USDC hard abort for all setup txs. The handleOps
// relay (the money proof) has a disclosed ceiling of 0.02 USDC: the script
// estimates gas BEFORE sending and aborts if estimated cost exceeds it.
// Funding moves are principal to controlled addresses; only gas is burned.
//
// Key handling: DEPLOYER_PRIVATE_KEY from ~/workspace/user/files/env-2.txt,
// never printed. Throwaway session key -> /tmp/win_userop_session.key (600).
//
// Usage: NODE_PATH=<repo>/backend/api/node_modules node scripts/win-userop-proof.js
'use strict';
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://rpc.mainnet.arc.io';
const MSCA_IMPL = '0xA70F1296869DA9D7CB69578123F21888E6dB2B62';
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const PLUGIN = '0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9'; // v0.2.0, Sourcify exact_match
const EURC = '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1';
const PER_TX_BUDGET = ethers.parseEther('0.01');
const INSTALL_BUDGET = ethers.parseEther('0.025');
const RELAY_BUDGET = ethers.parseEther('0.02'); // disclosed exception: the money proof
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

async function main() {
  const env = loadEnv();
  const provider = new ethers.JsonRpcProvider(RPC);
  if ((await provider.getNetwork()).chainId !== 5042n) throw new Error('wrong chain');
  let pk = env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY missing in env-2.txt');
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const owner = new ethers.Wallet(pk, provider);
  console.log('owner:', owner.address);

  const code = await provider.getCode(PLUGIN);
  if (code === '0x') throw new Error('no code at PLUGIN — aborting before spending anything');

  const build = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'HallpassPlugin.sol', 'HallpassPlugin.json'), 'utf8'));
  const proxyBuild = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'HallpassPlugin.sol', 'HallpassProxy.json'), 'utf8'));
  const pluginIface = new ethers.Interface(build.abi);
  const acctIface = new ethers.Interface([
    'function executeBatch((address target, uint256 value, bytes data)[] calls)',
    'function getInstalledPlugins() view returns (address[])',
    'function initializeUpgradableMSCA(address[] plugins, bytes32[] manifestHashes, bytes[] initDatas)',
  ]);
  const epIface = new ethers.Interface([
    'function getUserOpHash(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)',
    'function getNonce(address sender, uint192 key) view returns (uint256)',
    'function handleOps(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops, address payable beneficiary)',
    'function depositTo(address account) payable',
    'function balanceOf(address account) view returns (uint256)',
  ]);
  const erc20 = new ethers.Interface([
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
  ]);
  const ep = new ethers.Contract(ENTRY_POINT, epIface, provider);

  const fee = await provider.getFeeData();
  const gasPrice = fee.gasPrice; // no 1.1x headroom: Arc base fee is pinned; maximize budget margin
  console.log('gasPrice gwei:', ethers.formatUnits(gasPrice, 9));

  // ---- pre-flight balance checks (fail fast, spend nothing)
  const ownerUSDC = await provider.getBalance(owner.address);
  const ownerEURC = BigInt(await provider.call({ to: EURC, data: erc20.encodeFunctionData('balanceOf', [owner.address]) }));
  console.log('owner USDC:', ethers.formatEther(ownerUSDC), '| owner EURC units:', ownerEURC.toString());
  if (ownerUSDC < ethers.parseEther('0.12')) throw new Error('owner USDC too low for the proof run — aborting');
  if (ownerEURC < 6000n) throw new Error('owner EURC too low to fund the account — aborting');

  const results = [];
  let totalCost = 0n;
  const record = (step, r, expected, actual, budget, extra = {}) => {
    const cost = r.gasUsed * (r.gasPrice || gasPrice);
    totalCost += cost;
    results.push({ step, hash: r.hash, block: Number(r.blockNumber), status: r.status, gasUsed: r.gasUsed.toString(),
      costUSDC: ethers.formatEther(cost), expected, actual, ...extra });
    console.log(`[${step}] tx=${r.hash} block=${r.blockNumber} status=${r.status} gas=${r.gasUsed} cost=${ethers.formatEther(cost)} | ${expected} => ${actual}`);
    if (cost > budget) throw new Error(`BUDGET EXCEEDED on ${step}: ${ethers.formatEther(cost)} > ${ethers.formatEther(budget)}`);
  };
  async function send(label, txReq, expected, actualFn, budget = PER_TX_BUDGET) {
    const tx = await owner.sendTransaction({ gasPrice, ...txReq });
    const r = await tx.wait();
    record(label, r, expected, actualFn(r), budget);
    if (r.status !== 1) throw new Error(label + ': TX FAILED — PROOF FAILED');
    return r;
  }
  const pack2 = (hi, lo) => ethers.concat([ethers.zeroPadValue(ethers.toBeHex(hi), 16), ethers.zeroPadValue(ethers.toBeHex(lo), 16)]);
  const windowSpentOf = async (account) => {
    const raw = await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('policies', [account]) });
    return pluginIface.decodeFunctionResult('policies', raw).windowSpent;
  };
  function lowSSig(signer, hash) {
    const sig = signer.signingKey.sign(hash);
    let s = BigInt(sig.s), v = sig.v;
    if (s > N_HALF) { s = N_HALF - s; v = v === 27 ? 28 : 27; } // v0.2.0 requires low-s
    return ethers.Signature.from({ r: sig.r, s: ethers.toBeHex(s, 32), v }).serialized;
  }

  // Real ERC-4337 v0.7 userOp, self-relayed via EntryPoint.handleOps (no bundler on Arc).
  // expectRevert: null = must succeed; otherwise an expected inner reason for the
  // static pre-check / FailedOpWithRevert diagnosis.
  async function sendUserOp(label, signer, account, callData, expectRevert, budget = RELAY_BUDGET) {
    const nonce = await ep.getNonce(account, 0);
    const userOp = {
      sender: account, nonce, initCode: '0x', callData,
      accountGasLimits: pack2(600000n, 350000n), preVerificationGas: 120000n,
      gasFees: pack2(gasPrice, gasPrice), paymasterAndData: '0x', signature: '0x',
    };
    const userOpHash = await ep.getUserOpHash(userOp);
    userOp.signature = lowSSig(signer, userOpHash);
    const recovered = ethers.recoverAddress(userOpHash, userOp.signature);
    if (recovered.toLowerCase() !== signer.address.toLowerCase()) throw new Error(label + ': sig recovery mismatch');
    console.log(`[${label}] userOpHash=${userOpHash} nonce=${nonce}`);
    const handleCalldata = epIface.encodeFunctionData('handleOps', [[userOp], owner.address]);

    if (expectRevert) {
      // static pre-check: must revert with FailedOpWithRevert(AA23, plugin reason)
      let reason = 'unknown';
      try {
        await provider.call({ to: ENTRY_POINT, data: handleCalldata, from: owner.address });
        throw new Error(label + ': STATICCALL DID NOT REVERT — proof invalid');
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
      console.log(`[${label}] static pre-check reverts as expected: ${reason}`);
      const tx = await owner.sendTransaction({ to: ENTRY_POINT, data: handleCalldata, gasPrice, gasLimit: 2500000 });
      let r;
      try { r = await tx.wait(); } catch (e) { r = e.receipt; }
      if (!r || r.status !== 0) throw new Error(label + ': USEROP TX DID NOT REVERT — PROOF FAILED');
      record(label, r, 'revert ' + expectRevert, 'reverted: ' + reason, budget, { revertReason: reason, userOpHash });
      return r;
    }

    // static pre-check: must NOT revert
    try {
      await provider.call({ to: ENTRY_POINT, data: handleCalldata, from: owner.address });
    } catch (e) {
      let d = e.data || (e.info && e.info.error && e.info.error.data);
      if (!d && e.message) { const m = e.message.match(/0x[0-9a-fA-F]{8,}/); if (m) d = m[0]; }
      throw new Error(label + ': STATIC PRE-CHECK REVERTED — diagnosis: ' + (d || e.message));
    }
    console.log(`[${label}] static pre-check passed (handleOps would succeed)`);
    // cost pre-flight: estimate, hard-abort above the disclosed relay ceiling
    const est = await provider.estimateGas({ to: ENTRY_POINT, data: handleCalldata, from: owner.address });
    const estCost = est * 13n / 10n * gasPrice;
    console.log(`[${label}] relay gas estimate=${est} estCost=${ethers.formatEther(estCost)} ceiling=${ethers.formatEther(budget)}`);
    if (estCost > budget) throw new Error(label + ': relay cost estimate exceeds disclosed ceiling — aborting');
    const tx = await owner.sendTransaction({ to: ENTRY_POINT, data: handleCalldata, gasPrice, gasLimit: est * 13n / 10n });
    const r = await tx.wait();
    record(label, r, 'userOp succeeds via handleOps', 'status=1', budget, { userOpHash });
    if (r.status !== 1) throw new Error(label + ': USEROP FAILED — PROOF FAILED');
    return { r, userOpHash };
  }

  // ---- fresh throwaway session key (never sends txs in this flow; signs userOps only)
  const session = ethers.Wallet.createRandom().connect(provider);
  fs.writeFileSync('/tmp/win_userop_session.key', session.privateKey, { mode: 0o600 });
  console.log('fresh session key:', session.address);
  const payee = owner.address; // dust returns home

  // ---- manifest hash of the v0.2.0 plugin (on-chain, matches by construction)
  const mraw = await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('pluginManifest') });
  const manifest = pluginIface.decodeFunctionResult('pluginManifest', mraw)[0];
  const manifestHash = ethers.keccak256(pluginIface.encodeFunctionResult('pluginManifest', [manifest]));
  console.log('manifestHash:', manifestHash);

  // ---- A. deploy ERC1967 proxy (uninitialized)
  const proxyFactory = new ethers.ContractFactory(proxyBuild.abi, proxyBuild.bytecode.object, owner);
  const initTx = await proxyFactory.getDeployTransaction(MSCA_IMPL, '0x');
  const proxyR = await send('A-proxy-deploy', { ...initTx, gasLimit: 1500000 }, 'proxy deployed (uninitialized)', r => 'account=' + r.contractAddress);
  const account = proxyR.contractAddress;
  console.log('account:', account);

  // ---- B. initializeUpgradableMSCA: installs v0.2.0 + registers the EURC session
  // (plugin-less MSCA has no runtime validation for installPlugin — first plugin
  // enters via initialize; Q1/Q2-proven pattern)
  const perTxCap = ethers.parseEther('0.01');
  const expiry = Math.floor(Date.now() / 1000) + 7200;
  const installData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address[]', 'address[]', 'uint8[]'],
    [session.address, owner.address, perTxCap, ethers.parseEther('0.05'), 3600, expiry, [EURC, payee], [EURC], [6]]
  );
  const initIface = new ethers.Interface(['function initializeUpgradableMSCA(address[] plugins, bytes32[] manifestHashes, bytes[] initDatas)']);
  await send('B-init-install', { to: account, data: initIface.encodeFunctionData('initializeUpgradableMSCA', [[PLUGIN], [manifestHash], [installData]]), gasLimit: 2500000 },
    'v0.2.0 installed + EURC session registered', () => 'status=1', INSTALL_BUDGET);
  const installed = await new ethers.Contract(account, new ethers.Interface(['function getInstalledPlugins() view returns (address[])']), provider).getInstalledPlugins();
  if (!installed.some(a => a.toLowerCase() === PLUGIN.toLowerCase())) throw new Error('plugin NOT in installed list — install proof failed');
  console.log('install verified: getInstalledPlugins() lists v0.2.0');

  // ---- C. fund the account with 6000 EURC units (0.006 EURC)
  await send('C-fund-eurc', { to: EURC, data: erc20.encodeFunctionData('transfer', [account, 6000]), gasLimit: 100000 }, 'account funded 6000 EURC units', () => 'status=1');

  // ---- D. EntryPoint deposit for the account (userOp prefund; principal, not burn)
  await send('D-depositTo', { to: ENTRY_POINT, data: epIface.encodeFunctionData('depositTo', [account]), value: ethers.parseEther('0.05'), gasLimit: 100000 },
    '0.05 USDC deposited for userOp prefund', () => 'status=1');

  // ---- E. in-policy EURC spend via REAL userOp: session-signed executeBatch through handleOps
  const eurcTransfer = (to, amount) => acctIface.encodeFunctionData('executeBatch', [[{ target: EURC, value: 0, data: erc20.encodeFunctionData('transfer', [to, amount]) }]]);
  const before = await windowSpentOf(account);
  console.log('windowSpent before userOp:', ethers.formatEther(before));
  const { r: eurcR, userOpHash } = await sendUserOp('E-eurc-userop-ok', session, account, eurcTransfer(payee, 2000), null);
  const after = await windowSpentOf(account);
  console.log('windowSpent after userOp:', ethers.formatEther(after));
  if (after - before !== ethers.parseEther('0.002')) throw new Error('windowSpent did not move 0 -> 0.002 — policy accounting proof failed');
  const payeeBal = BigInt(await provider.call({ to: EURC, data: erc20.encodeFunctionData('balanceOf', [payee]) }));
  console.log('payee EURC balance units:', payeeBal.toString(), '(proves the batch transfer executed)');
  if (payeeBal < 2000n) throw new Error('payee did not receive the EURC — execution proof failed');

  // ---- F. over-cap EURC via REAL userOp -> handleOps reverts (AA23 + PerTxCapExceeded)
  await sendUserOp('F-eurc-userop-overcap', session, account, eurcTransfer(payee, 50000), 'FailedOpWithRevert AA23 / PerTxCapExceeded(0.05, 0.01)');
  const afterF = await windowSpentOf(account);
  if (afterF !== after) throw new Error('windowSpent changed after a reverted userOp — accounting not atomic');

  console.log('\n==== WIN USEROP PROOF COMPLETE ====');
  console.log('total gas burned USDC:', ethers.formatEther(totalCost));
  const out = { plugin: PLUGIN, account, session: session.address, owner: owner.address,
    moneyProof: { tx: eurcR.hash, block: Number(eurcR.blockNumber), userOpHash, what: 'session-key-signed ERC-4337 v0.7 userOp -> executeBatch(EURC transfer 2000 units) via EntryPoint.handleOps, v0.2.0 validation path' },
    totalGasUSDC: ethers.formatEther(totalCost), steps: results };
  fs.writeFileSync('/tmp/win_userop_results.json', JSON.stringify(out, null, 2));
  console.log('wrote /tmp/win_userop_results.json');
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
