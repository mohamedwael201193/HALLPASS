// HALLPASS Q1 — fresh install -> enforce -> revoke dust E2E on Arc mainnet (5042).
//
// Adapted from the H9-proven q1_e2e.js (~/workspace/beacon-build/progress/h9/work/).
// Budget: per-tx gas < 0.01 USDC hard abort (founder dust budget); cumulative
// gas reported honestly. Funding moves are principal to controlled addresses,
// NOT spend — only gas is burned.
//
// PLUGIN UNDER TEST: 0x7C912e73f9b8B60e4c68d58d52DeC5524e17ABDd
//   Bytecode note (verified 2026-10-14 via cast code): this deployment was
//   built from PRE-FIX source — it contains the typo'd malleability constant,
//   not the repo's fixed 0x7FFF…B20A0. That is FINE for this E2E: the
//   malleability bound only gates the typed-data path, while install /
//   per-tx-cap / window / revoke enforcement is identical. The fix itself is
//   proven by the 27/27 Foundry unit tests incl. the behavioral half-order
//   probe (contracts/test/HallpassPlugin.t.sol). A fresh mainnet deploy of
//   the fixed binary (~1.8M gas, ~0.038 USDC) is outside the dust budget and
//   is the founder's production-deploy step (contracts/DEPLOYMENT.md).
//
// Key handling: DEPLOYER_PRIVATE_KEY is read from ~/workspace/user/files/env-2.txt
// and never printed. The throwaway session key is written to /tmp/q1_session.key
// (mode 600) and never committed.
//
// Usage: node scripts/q1-dust-e2e.js   (cwd must allow writing /tmp; reads
//   scripts/q1.build.json for ABIs)
'use strict';
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://rpc.mainnet.arc.io';
const MSCA_IMPL = '0xA70F1296869DA9D7CB69578123F21888E6dB2B62';
const PLUGIN = '0x7C912e73f9b8B60e4c68d58d52DeC5524e17ABDd';
const PER_TX_BUDGET = ethers.parseEther('0.01');
const BUILD_JSON = path.join(__dirname, 'q1.build.json');

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
  const net = await provider.getNetwork();
  if (net.chainId !== 5042n) throw new Error('wrong chain ' + net.chainId);
  let pk = env.DEPLOYER_PRIVATE_KEY;
  if (!pk) throw new Error('DEPLOYER_PRIVATE_KEY missing in env-2.txt');
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const owner = new ethers.Wallet(pk, provider);
  console.log('owner:', owner.address);
  console.log('plugin under test:', PLUGIN);

  // Sanity: the plugin must have code on mainnet.
  const code = await provider.getCode(PLUGIN);
  if (code === '0x') throw new Error('no code at PLUGIN address — aborting before spending anything');

  const build = JSON.parse(fs.readFileSync(BUILD_JSON, 'utf8'));
  const pluginIface = new ethers.Interface(build.HallpassPlugin.abi);
  const acctIface = new ethers.Interface([
    'function execute(address dest, uint256 value, bytes calldata data)',
    'function getInstalledPlugins() view returns (address[])',
    'function initializeUpgradableMSCA(address[] plugins, bytes32[] manifestHashes, bytes[] initDatas)',
  ]);

  const fee = await provider.getFeeData();
  const gasPrice = fee.gasPrice * 11n / 10n; // 1.1x headroom
  console.log('gasPrice gwei:', ethers.formatUnits(gasPrice, 9));

  const results = [];
  let totalCost = 0n;
  const record = (step, r, expected, actual, extra = {}) => {
    const cost = r.gasUsed * (r.gasPrice || gasPrice);
    totalCost += cost;
    results.push({ step, hash: r.hash, status: r.status, gasUsed: r.gasUsed.toString(),
      costUSDC: ethers.formatEther(cost), expected, actual, ...extra });
    console.log(`[${step}] tx=${r.hash} status=${r.status} gas=${r.gasUsed} cost=${ethers.formatEther(cost)} | expected: ${expected} | actual: ${actual}`);
    if (cost > PER_TX_BUDGET) throw new Error(`PER-TX BUDGET EXCEEDED on ${step}: ${ethers.formatEther(cost)} > 0.01`);
  };

  async function send(label, txReq, expected, actualFn) {
    const tx = await owner.sendTransaction({ gasPrice, ...txReq });
    const r = await tx.wait();
    record(label, r, expected, actualFn(r));
    return r;
  }
  async function sendRevert(label, from, txReq, expectedReason) {
    let reason = 'unknown';
    try {
      await provider.call({ to: txReq.to, data: txReq.data, from: from.address });
      throw new Error(label + ': STATICCALL DID NOT REVERT — proof invalid');
    } catch (e) {
      if (e.message && e.message.includes('DID NOT REVERT')) throw e;
      let d = e.data || (e.info && e.info.error && e.info.error.data);
      if (!d && e.message) { const m = e.message.match(/0x[0-9a-fA-F]{8,}/); if (m) d = m[0]; }
      try {
        const outer = new ethers.Interface(['error RuntimeValidationFailed(address plugin, uint8 functionId, bytes reason)']);
        const o = outer.parseError(d);
        const inner = pluginIface.parseError(o.args.reason);
        reason = inner.name + '(' + inner.args.map(a => { try { return ethers.formatEther(a); } catch { return String(a); } }).join(',') + ')';
      } catch { reason = d || 'unavailable'; }
    }
    const tx = await from.sendTransaction({ gasPrice, ...txReq });
    let r;
    try { r = await tx.wait(); } catch (e) { r = e.receipt; }
    if (!r || r.status !== 0) throw new Error(label + ': TX DID NOT REVERT — PROOF FAILED');
    record(label, r, 'revert ' + expectedReason, 'reverted: ' + reason, { revertReason: reason });
    return r;
  }

  // ---- fresh throwaway session key (dust key, never reused)
  const session = ethers.Wallet.createRandom().connect(provider);
  fs.writeFileSync('/tmp/q1_session.key', session.privateKey, { mode: 0o600 });
  console.log('fresh session key:', session.address);

  // ---- manifestHash from the DEPLOYED plugin (matches by construction)
  const plugin = new ethers.Contract(PLUGIN, pluginIface, provider);
  const manifest = await plugin.pluginManifest.staticCall();
  const manifestHash = ethers.keccak256(pluginIface.encodeFunctionResult('pluginManifest', [manifest]));
  console.log('manifestHash:', manifestHash);

  // ---- Tx A: deploy ERC1967 proxy (no init — split for per-tx budget)
  const proxyFactory = new ethers.ContractFactory(build.HallpassProxy.abi, build.HallpassProxy.bytecode, owner);
  const proxyTx = await proxyFactory.deploy(MSCA_IMPL, '0x', { gasPrice, gasLimit: 1000000 });
  const proxyR = await proxyTx.deploymentTransaction().wait();
  const account = proxyR.contractAddress;
  record('A-proxy-deploy', proxyR, 'proxy deployed, uninitialized', 'status 1, proxy=' + account);

  // ---- Tx B: initializeUpgradableMSCA (installs plugin + registers session policy)
  const now = Math.floor(Date.now() / 1000);
  const perTxCap = ethers.parseEther('0.01'), windowCap = ethers.parseEther('0.02');
  const windowSecs = 3600, expiry = now + 7200;
  const installData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address[]'],
    [session.address, owner.address, perTxCap, windowCap, windowSecs, expiry, []]
  );
  const initData = acctIface.encodeFunctionData('initializeUpgradableMSCA', [[PLUGIN], [manifestHash], [installData]]);
  await send('B-init-install', { to: account, data: initData, gasLimit: 1000000 },
    'plugin installed + session policy registered',
    r => r.status === 1 ? 'status 1' : 'FAILED');
  const installed = await new ethers.Contract(account, acctIface, provider).getInstalledPlugins();
  if (!installed.some(a => a.toLowerCase() === PLUGIN.toLowerCase())) throw new Error('plugin NOT in installed list — install proof failed');
  console.log('install verified: getInstalledPlugins() lists the plugin');
  const polRaw = await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('policies', [account]) });
  const pol = pluginIface.decodeFunctionResult('policies', polRaw);
  console.log('policy on-chain: session=%s perTx=%s window=%s revoked=%s',
    pol.sessionKey, ethers.formatEther(pol.perTxCap), ethers.formatEther(pol.windowCap), pol.revoked);

  // ---- fund account + session key (principal moves to controlled addresses)
  await send('C-fund-account', { to: account, value: ethers.parseEther('0.03'), gasLimit: 40000 },
    'account funded with dust', r => r.status === 1 ? 'status 1' : 'FAILED');
  await send('D-fund-session', { to: session.address, value: ethers.parseEther('0.006'), gasLimit: 40000 },
    'session key funded for gas', r => r.status === 1 ? 'status 1' : 'FAILED');

  const execCall = (dest, value, data = '0x') => acctIface.encodeFunctionData('execute', [dest, value, data]);
  const payee = owner.address;
  const windowSpent = async () => {
    const raw = await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('policies', [account]) });
    return ethers.formatEther(pluginIface.decodeFunctionResult('policies', raw).windowSpent);
  };

  // ---- E1: in-policy spend 0.005 (cap 0.01) -> MUST SUCCEED
  console.log('windowSpent before E1:', await windowSpent());
  {
    const tx = await session.sendTransaction({ to: account, data: execCall(payee, ethers.parseEther('0.005')), gasPrice, gasLimit: 400000 });
    const r = await tx.wait();
    if (r.status !== 1) throw new Error('E1 in-policy spend FAILED');
    record('E1-in-policy-0.005', r, 'success, windowSpent 0 -> 0.005', 'status 1, windowSpent=' + await windowSpent());
  }

  // ---- E2: over-cap spend 0.05 (cap 0.01) -> MUST REVERT PerTxCapExceeded
  await sendRevert('E2-overcap-0.05', session, { to: account, data: execCall(payee, ethers.parseEther('0.05')), gasLimit: 400000 }, 'PerTxCapExceeded(0.05, 0.01)');
  console.log('windowSpent after E2 (must be unchanged 0.005):', await windowSpent());

  // ---- E3: owner revokeSession via account fallback -> MUST SUCCEED
  {
    const revokeCalldata = pluginIface.encodeFunctionData('revokeSession');
    const tx = await owner.sendTransaction({ to: account, data: revokeCalldata, gasPrice, gasLimit: 400000 });
    const r = await tx.wait();
    if (r.status !== 1) throw new Error('E3 revokeSession FAILED');
    const raw = await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('policies', [account]) });
    const revoked = pluginIface.decodeFunctionResult('policies', raw).revoked;
    if (!revoked) throw new Error('E3: revoked flag not set on-chain');
    record('E3-revokeSession', r, 'success, revoked=true', 'status 1, revoked=' + revoked);
  }

  // ---- E4: post-revoke spend -> MUST REVERT SessionRevoked
  await sendRevert('E4-postrevoke-0.005', session, { to: account, data: execCall(payee, ethers.parseEther('0.005')), gasLimit: 400000 }, 'SessionRevoked()');

  console.log('TOTAL gas burned USDC:', ethers.formatEther(totalCost));
  const out = { account, plugin: PLUGIN, pluginNote: 'pre-fix bytecode (typo malleability constant); enforcement paths identical', session: session.address, owner: owner.address, totalGasUSDC: ethers.formatEther(totalCost), steps: results };
  fs.writeFileSync('/tmp/q1_results.json', JSON.stringify(out, null, 1));
  console.log('Q1 E2E COMPLETE — results in /tmp/q1_results.json');
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
