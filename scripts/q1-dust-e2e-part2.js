// HALLPASS Q1 part 2 — enforce -> revoke on the account created in part 1.
//
// Continues from scripts/q1-dust-e2e.js which proved fresh install
// (proxy deploy + initializeUpgradableMSCA) but aborted on the per-tx dust
// budget for the init tx (0.0131 > 0.01 — the install step's cold SSTOREs).
// Every tx below is a simple call, each far under 0.01 USDC.
//
// Reads the account + session key from /tmp/q1_part2.json (written by the
// operator from part 1's output) — no keys in this file; the deployer key
// comes from ~/workspace/user/files/env-2.txt and is never printed.
'use strict';
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://rpc.mainnet.arc.io';
const PLUGIN = '0x7C912e73f9b8B60e4c68d58d52DeC5524e17ABDd';
const PER_TX_BUDGET = ethers.parseEther('0.01');
const BUILD_JSON = path.join(__dirname, 'q1.build.json');
const STATE = '/tmp/q1_part2.json';

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
  if (net.chainId !== 5042n) throw new Error('wrong chain');
  let pk = env.DEPLOYER_PRIVATE_KEY;
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const owner = new ethers.Wallet(pk, provider);

  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const account = st.account;
  const session = new ethers.Wallet(fs.readFileSync('/tmp/q1_session.key', 'utf8').trim(), provider);
  if (session.address.toLowerCase() !== st.session.toLowerCase()) throw new Error('session key mismatch');

  const build = JSON.parse(fs.readFileSync(BUILD_JSON, 'utf8'));
  const pluginIface = new ethers.Interface(build.HallpassPlugin.abi);
  const acctIface = new ethers.Interface([
    'function execute(address dest, uint256 value, bytes calldata data)',
    'function getInstalledPlugins() view returns (address[])',
  ]);

  const fee = await provider.getFeeData();
  const gasPrice = fee.gasPrice * 11n / 10n;
  console.log('account:', account, '| session:', session.address, '| owner:', owner.address);

  // ---- verify part-1 install before spending more
  const installed = await new ethers.Contract(account, acctIface, provider).getInstalledPlugins();
  if (!installed.some(a => a.toLowerCase() === PLUGIN.toLowerCase()))
    throw new Error('plugin NOT installed — refusing to continue');
  console.log('install confirmed on-chain');
  const pol0 = pluginIface.decodeFunctionResult('policies',
    await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('policies', [account]) }));
  console.log('policy: session=%s perTx=%s window=%s revoked=%s',
    pol0.sessionKey, ethers.formatEther(pol0.perTxCap), ethers.formatEther(pol0.windowCap), pol0.revoked);

  const results = [];
  let totalCost = 0n;
  const record = (step, r, expected, actual, extra = {}) => {
    const cost = r.gasUsed * (r.gasPrice || gasPrice);
    totalCost += cost;
    results.push({ step, hash: r.hash, status: r.status, gasUsed: r.gasUsed.toString(),
      costUSDC: ethers.formatEther(cost), expected, actual, ...extra });
    console.log(`[${step}] tx=${r.hash} status=${r.status} gas=${r.gasUsed} cost=${ethers.formatEther(cost)} | expected: ${expected} | actual: ${actual}`);
    if (cost > PER_TX_BUDGET) throw new Error(`PER-TX BUDGET EXCEEDED on ${step}`);
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

  // (Part-1 run already funded account + session key; top up the session key
  // so gasLimit*gasPrice fits its balance. Topped-up value is principal on a
  // key we hold — sweepable, not burned.)
  await send('D2-topup-session', { to: session.address, value: ethers.parseEther('0.004'), gasLimit: 40000 },
    'session key topped up', r => r.status === 1 ? 'status 1' : 'FAILED');

  const execCall = (dest, value) => acctIface.encodeFunctionData('execute', [dest, value, '0x']);
  const payee = owner.address;
  const windowSpent = async () =>
    ethers.formatEther(pluginIface.decodeFunctionResult('policies',
      await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('policies', [account]) })).windowSpent);

  console.log('windowSpent before E1:', await windowSpent());
  {
    const tx = await session.sendTransaction({ to: account, data: execCall(payee, ethers.parseEther('0.005')), gasPrice, gasLimit: 250000 });
    const r = await tx.wait();
    if (r.status !== 1) throw new Error('E1 in-policy spend FAILED');
    record('E1-in-policy-0.005', r, 'success, windowSpent 0 -> 0.005', 'status 1, windowSpent=' + await windowSpent());
  }
  await sendRevert('E2-overcap-0.05', session, { to: account, data: execCall(payee, ethers.parseEther('0.05')), gasLimit: 250000 }, 'PerTxCapExceeded(0.05, 0.01)');
  console.log('windowSpent after E2 (must be unchanged):', await windowSpent());
  {
    const tx = await owner.sendTransaction({ to: account, data: pluginIface.encodeFunctionData('revokeSession'), gasPrice, gasLimit: 250000 });
    const r = await tx.wait();
    if (r.status !== 1) throw new Error('E3 revokeSession FAILED');
    const revoked = pluginIface.decodeFunctionResult('policies',
      await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('policies', [account]) })).revoked;
    if (!revoked) throw new Error('E3: revoked flag not set');
    record('E3-revokeSession', r, 'success, revoked=true', 'status 1, revoked=' + revoked);
  }
  await sendRevert('E4-postrevoke-0.005', session, { to: account, data: execCall(payee, ethers.parseEther('0.005')), gasLimit: 250000 }, 'SessionRevoked()');

  console.log('PART-2 gas burned USDC:', ethers.formatEther(totalCost));
  fs.writeFileSync('/tmp/q1_results_part2.json', JSON.stringify(
    { account, plugin: PLUGIN, session: session.address, owner: owner.address, totalGasUSDC: ethers.formatEther(totalCost), steps: results }, null, 1));
  console.log('Q1 PART 2 COMPLETE');
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
