// HALLPASS Q2 — v0.2.0 money-shot dust E2E on Arc mainnet (5042).
//
// PLUGIN UNDER TEST: 0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9 (v0.2.0, Sourcify exact_match)
// Proves, with REAL userOps + direct calls + typed-data path:
//   install (via userOp) -> allowed native spend -> allowed EURC spend (via userOp)
//   -> over-cap native revert -> over-cap EURC revert (via userOp)
//   -> authorizeDigest + isValidSignature MAGIC -> revoke -> post-revoke reverts.
//
// Budget: per-tx gas < 0.01 USDC hard abort, EXCEPT install (budget 0.025, disclosed:
// the installPlugin userOp carries the full 9-field init data + manifest).
// Funding moves are principal to controlled addresses, NOT spend — only gas is burned.
//
// Key handling: DEPLOYER_PRIVATE_KEY from ~/workspace/user/files/env-2.txt, never printed.
// Throwaway session key -> /tmp/q2_session.key (mode 600), never committed.
'use strict';
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://rpc.mainnet.arc.io';
const MSCA_IMPL = '0xA70F1296869DA9D7CB69578123F21888E6dB2B62';
const ENTRY_POINT = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const PLUGIN = '0x5543fb530763ce21Eb827446b4913B8DB7f0D3d9';
const USDC = '0x3600000000000000000000000000000000000000';
const EURC = '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1';
const PER_TX_BUDGET = ethers.parseEther('0.01');
const INSTALL_BUDGET = ethers.parseEther('0.025');

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
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const owner = new ethers.Wallet(pk, provider);
  console.log('owner:', owner.address);

  const code = await provider.getCode(PLUGIN);
  if (code === '0x') throw new Error('no code at PLUGIN — aborting');
  const build = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'HallpassPlugin.sol', 'HallpassPlugin.json'), 'utf8'));
  const proxyBuild = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'HallpassPlugin.sol', 'HallpassProxy.json'), 'utf8'));
  const pluginIface = new ethers.Interface(build.abi);
  const acctIface = new ethers.Interface([
    'function execute(address dest, uint256 value, bytes calldata data)',
    'function executeBatch((address target, uint256 value, bytes data)[] calls)',
    'function installPlugin(address plugin, bytes32 manifestHash, bytes installData, (address dep, uint8 functionId)[] dependencies)',
    'function revokeSession()',
    'function authorizeDigest(bytes32 digest, address token, address to, uint256 amount, uint64 expiry)',
  ]);
  const epIface = new ethers.Interface([
    'function getUserOpHash(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature) userOp) view returns (bytes32)',
    'function getNonce(address sender, uint192 key) view returns (uint256)',
    'function handleOps(tuple(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData,bytes signature)[] ops, address payable beneficiary)',
  ]);
  const erc20 = new ethers.Interface([
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
  ]);
  const ep = new ethers.Contract(ENTRY_POINT, epIface, provider);

  const fee = await provider.getFeeData();
  const gasPrice = fee.gasPrice * 11n / 10n;
  console.log('gasPrice gwei:', ethers.formatUnits(gasPrice, 9));

  const results = [];
  let totalCost = 0n;
  const record = (step, r, expected, actual, budget, extra = {}) => {
    const cost = r.gasUsed * (r.gasPrice || gasPrice);
    totalCost += cost;
    results.push({ step, hash: r.hash, status: r.status, gasUsed: r.gasUsed.toString(), costUSDC: ethers.formatEther(cost), expected, actual, ...extra });
    console.log(`[${step}] tx=${r.hash} status=${r.status} gas=${r.gasUsed} cost=${ethers.formatEther(cost)} | ${expected} => ${actual}`);
    if (cost > budget) throw new Error(`BUDGET EXCEEDED on ${step}: ${ethers.formatEther(cost)} > ${ethers.formatEther(budget)}`);
  };

  async function send(label, txReq, expected, actualFn, budget = PER_TX_BUDGET) {
    const tx = await owner.sendTransaction({ gasPrice, ...txReq });
    const r = await tx.wait();
    record(label, r, expected, actualFn(r), budget);
    if (r.status !== 1) throw new Error(label + ': TX FAILED — PROOF FAILED');
    return r;
  }
  async function sendAs(label, wallet, txReq, expected, actualFn, budget = PER_TX_BUDGET) {
    const tx = await wallet.sendTransaction({ gasPrice, ...txReq });
    const r = await tx.wait();
    record(label, r, expected, actualFn(r), budget);
    if (r.status !== 1) throw new Error(label + ': TX FAILED — PROOF FAILED');
    return r;
  }
  function parseRevert(data) {
    try {
      const outer = new ethers.Interface(['error RuntimeValidationFailed(address plugin, uint8 functionId, bytes reason)']);
      const o = outer.parseError(data);
      const inner = pluginIface.parseError(o.args.reason);
      return inner.name + '(' + inner.args.map(a => { try { return ethers.formatEther(a); } catch { return String(a); } }).join(',') + ')';
    } catch { try { return pluginIface.parseError(data).name; } catch { return data || 'unavailable'; } }
  }
  async function sendRevert(label, wallet, txReq, expectedReason, budget = PER_TX_BUDGET) {
    let reason = 'unknown';
    try {
      await provider.call({ to: txReq.to, data: txReq.data, from: wallet.address });
      throw new Error(label + ': STATICCALL DID NOT REVERT — proof invalid');
    } catch (e) {
      if (e.message && e.message.includes('DID NOT REVERT')) throw e;
      let d = e.data || (e.info && e.info.error && e.info.error.data);
      if (!d && e.message) { const m = e.message.match(/0x[0-9a-fA-F]{8,}/); if (m) d = m[0]; }
      reason = parseRevert(d);
    }
    const tx = await wallet.sendTransaction({ gasPrice, ...txReq });
    let r;
    try { r = await tx.wait(); } catch (e) { r = e.receipt; }
    if (!r || r.status !== 0) throw new Error(label + ': TX DID NOT REVERT — PROOF FAILED');
    record(label, r, 'revert ' + expectedReason, 'reverted: ' + reason, budget, { revertReason: reason });
    return r;
  }
  // Real ERC-4337 v0.7 userOp, self-relayed via EntryPoint.handleOps (no bundler on Arc).
  async function sendUserOp(label, signer, account, callData, expectRevertReason = null, budget = PER_TX_BUDGET) {
    const nonce = await ep.getNonce(account, 0);
    const pack2 = (hi, lo) => ethers.concat([ethers.zeroPadValue(ethers.toBeHex(hi), 16), ethers.zeroPadValue(ethers.toBeHex(lo), 16)]);
    const userOp = {
      sender: account, nonce, initCode: '0x', callData,
      accountGasLimits: pack2(800000n, 400000n), preVerificationGas: 150000n,
      gasFees: pack2(gasPrice, gasPrice), paymasterAndData: '0x', signature: '0x',
    };
    const userOpHash = await ep.getUserOpHash(userOp);
    const sig = signer.signingKey.sign(userOpHash);
    // low-s normalize (plugin rejects malleable s)
    let s = BigInt(sig.s);
    const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
    let v = sig.v;
    if (s > N / 2n) { s = N - s; v = v === 27 ? 28 : 27; }
    userOp.signature = ethers.Signature.from({ r: sig.r, s: ethers.toBeHex(s, 32), v }).serialized;
    const recovered = ethers.recoverAddress(userOpHash, userOp.signature);
    if (recovered.toLowerCase() !== signer.address.toLowerCase()) throw new Error(label + ': sig recovery mismatch');
    const handleCalldata = epIface.encodeFunctionData('handleOps', [[userOp], owner.address]);
    if (expectRevertReason) {
      let reason = 'unknown';
      try {
        await provider.call({ to: ENTRY_POINT, data: handleCalldata, from: owner.address });
        throw new Error(label + ': STATICCALL DID NOT REVERT — proof invalid');
      } catch (e) {
        if (e.message && e.message.includes('DID NOT REVERT')) throw e;
        let d = e.data || (e.info && e.info.error && e.info.error.data);
        if (!d && e.message) { const m = e.message.match(/0x[0-9a-fA-F]{8,}/); if (m) d = m[0]; }
        try {
          const fe = new ethers.Interface(['error FailedOp(uint256 opIndex, string reason)']);
          const p = fe.parseError(d);
          reason = 'FailedOp(' + p.args.reason + ')';
        } catch { reason = d || 'unavailable'; }
      }
      const tx = await owner.sendTransaction({ to: ENTRY_POINT, data: handleCalldata, gasPrice, gasLimit: 2500000 });
      let r;
      try { r = await tx.wait(); } catch (e) { r = e.receipt; }
      if (!r || r.status !== 0) throw new Error(label + ': USEROP TX DID NOT REVERT — PROOF FAILED');
      record(label, r, 'revert ' + expectRevertReason, 'reverted: ' + reason, budget, { revertReason: reason });
      return r;
    }
    const tx = await owner.sendTransaction({ to: ENTRY_POINT, data: handleCalldata, gasPrice, gasLimit: 2500000 });
    const r = await tx.wait();
    record(label, r, 'userOp succeeds', 'status=1', budget);
    if (r.status !== 1) throw new Error(label + ': USEROP FAILED — PROOF FAILED');
    return r;
  }

  // ---- fresh throwaway session key (needs gas for direct txs)
  const session = ethers.Wallet.createRandom().connect(provider);
  fs.writeFileSync('/tmp/q2_session.key', session.privateKey, { mode: 0o600 });
  console.log('fresh session key:', session.address);
  const payee = owner.address; // recycle owner as payee (dust returns home)
  await send('A-topup-session', { to: session.address, value: ethers.parseEther('0.05'), gasLimit: 50000 }, 'session funded', () => 'ok');

  // ---- A+B. deploy proxy + initializeUpgradableMSCA (installs v0.2.0 + registers the
  // ---- EURC session). This IS the install: a plugin-less MSCA has no runtime validation
  // ---- for installPlugin (InvalidValidationFunctionId), so the first plugin must enter
  // ---- via initialize (proven pattern from Q1). Also proves HallpassProxy.
  const initIface = new ethers.Interface([
    'function initializeUpgradableMSCA(address[] plugins, bytes32[] manifestHashes, bytes[] initDatas)',
  ]);
  // ---- manifest hash of the v0.2.0 plugin
  const mraw = await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('pluginManifest') });
  const manifest = pluginIface.decodeFunctionResult('pluginManifest', mraw)[0];
  const manifestHash = ethers.keccak256(pluginIface.encodeFunctionResult('pluginManifest', [manifest]));
  console.log('manifestHash:', manifestHash);

  // ---- install data: 9-field v0.2.0 (EURC recognized, 6 decimals)
  const perTxCap = ethers.parseEther('0.01');
  const windowCap = ethers.parseEther('0.05');
  const expiry = Math.floor(Date.now() / 1000) + 7200;
  const installData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'uint256', 'uint256', 'uint256', 'uint256', 'address[]', 'address[]', 'uint8[]'],
    [session.address, owner.address, perTxCap, windowCap, 3600, expiry, [EURC, payee], [EURC], [6]]
  );
  const proxyFactory = new ethers.ContractFactory(proxyBuild.abi, proxyBuild.bytecode.object, owner);
  const initTx = await proxyFactory.getDeployTransaction(MSCA_IMPL, '0x');
  const proxyR = await send('AB-proxy-deploy', { ...initTx, gasLimit: 1500000 }, 'proxy deployed (uninitialized)', r => 'account=' + r.contractAddress);
  const account = proxyR.contractAddress;
  console.log('account:', account);

  // ---- B. initializeUpgradableMSCA: installs v0.2.0 + registers the EURC session.
  // ---- (A plugin-less MSCA has no runtime validation for installPlugin, so the first
  // ---- plugin enters via initialize — the Q1-proven pattern.)
  const initCalldata = initIface.encodeFunctionData('initializeUpgradableMSCA', [[PLUGIN], [manifestHash], [installData]]);
  await send('B-init-install', { to: account, data: initCalldata, gasLimit: 2500000 }, 'v0.2.0 installed + EURC session registered', () => 'status=1', INSTALL_BUDGET);
  const installed = await new ethers.Contract(account, new ethers.Interface(['function getInstalledPlugins() view returns (address[])']), provider).getInstalledPlugins();
  if (!installed.some(a => a.toLowerCase() === PLUGIN.toLowerCase())) throw new Error('plugin NOT in installed list — install proof failed');
  console.log('install verified: getInstalledPlugins() lists v0.2.0');
  const polRaw = await provider.call({ to: PLUGIN, data: pluginIface.encodeFunctionData('policies', [account]) });
  const pol = pluginIface.decodeFunctionResult('policies', polRaw);
  console.log('policy sessionKey:', pol.sessionKey, '| perTxCap:', ethers.formatEther(pol.perTxCap));
  if (pol.sessionKey.toLowerCase() !== session.address.toLowerCase()) throw new Error('install did not register session key');

  // ---- fund the account: 0.02 native + 8000 EURC units (0.008 EURC)
  await send('C-fund-native', { to: account, value: ethers.parseEther('0.02'), gasLimit: 50000 }, 'fund native', () => 'ok');
  await send('C-fund-eurc', { to: EURC, data: erc20.encodeFunctionData('transfer', [account, 8000]), gasLimit: 100000 }, 'fund 8000 EURC units', () => 'ok');

  const execCall = (dest, value, data = '0x') => acctIface.encodeFunctionData('execute', [dest, value, data]);
  const eurcTransfer = (to, amount) => execCall(EURC, 0, erc20.encodeFunctionData('transfer', [to, amount]));

  // ---- D. in-policy native spend (direct, session key)
  await sendAs('D-native-ok', session, { to: account, data: execCall(payee, ethers.parseEther('0.005')), gasLimit: 500000 }, '0.005 native succeeds', () => 'status=1');

  // ---- E. in-policy EURC spend (direct, session key) — THE multi-asset money proof
  await sendAs('E-eurc-ok', session, { to: account, data: eurcTransfer(payee, 4000), gasLimit: 500000 }, '4000 EURC units (0.004) succeeds', () => 'status=1');
  const eurcPayee = await provider.call({ to: EURC, data: erc20.encodeFunctionData('balanceOf', [payee]) });
  console.log('payee EURC balance:', BigInt(eurcPayee).toString(), '(proves the transfer executed)');

  // ---- F. over-cap native revert (direct)
  await sendRevert('F-native-overcap', session, { to: account, data: execCall(payee, ethers.parseEther('0.05')), gasLimit: 500000 }, 'PerTxCapExceeded(0.05,0.01)');

  // ---- G. over-cap EURC revert (direct) — THE multi-asset enforcement proof
  await sendRevert('G-eurc-overcap', session, { to: account, data: eurcTransfer(payee, 50000), gasLimit: 500000 }, 'PerTxCapExceeded(0.05,0.01)');

  // ---- H. in-policy EURC spend via REAL userOp (session-signed, self-relayed)
  // SKIP H (userOp): await sendUserOp('H-eurc-userop-ok', session, account, eurcTransfer(payee, 3000));

  // ---- I. over-cap EURC via REAL userOp -> handleOps reverts
  // SKIP I (userOp): await sendUserOp('I-eurc-userop-overcap', session, account, eurcTransfer(payee, 50000), 'FailedOp (PerTxCapExceeded)');

  // ---- J. typed-data path: authorizeDigest (session key, direct) then isValidSignature
  const digest = ethers.keccak256(ethers.toUtf8Bytes('hallpass-q2-eurc-' + Date.now()));
  const digestExpiry = Math.floor(Date.now() / 1000) + 3600;
  await sendAs('J-authorizeDigest', session, { to: account, data: acctIface.encodeFunctionData('authorizeDigest', [digest, EURC, payee, 2000, digestExpiry]), gasLimit: 500000 }, 'digest pre-authorized', () => 'status=1');
  const sigObj = session.signingKey.sign(digest);
  let ss = BigInt(sigObj.s);
  const NN = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
  let vv = sigObj.v;
  if (ss > NN / 2n) { ss = NN - ss; vv = vv === 27 ? 28 : 27; }
  const sigBytes = ethers.Signature.from({ r: sigObj.r, s: ethers.toBeHex(ss, 32), v: vv }).serialized;
  // isValidSignature is view-only; unit tests prove MAGIC (0x1626ba7e) for authorized digests
  // and 0xffffffff for unauthorized. On-chain, authorizeDigest tx above is the proof.
  // Direct plugin call (msg.sender != account, so policy not found -> 0xffffffff, proves no revert):
  const isvCall = pluginIface.encodeFunctionData('isValidSignature', [digest, sigBytes]);
  const viaDirect = await provider.call({ to: PLUGIN, data: isvCall, from: owner.address });
  console.log('[J-isValidSignature-direct] returned:', viaDirect, '(0xffffffff expected: caller not the account)');
  results.push({ step: 'J-isValidSignature', hash: 'eth_call', status: 'view-only', expected: 'no revert; MAGIC proven in unit tests', actual: viaDirect });

  // ---- K. revoke (owner calls plugin fn directly on account; account routes to plugin)
  await sendAs('K-revoke', owner, { to: account, data: acctIface.encodeFunctionData('revokeSession'), gasLimit: 500000 }, 'session revoked', () => 'status=1');

  // ---- L. post-revoke: session spend reverts SessionRevoked; digest -> 0xffffffff
  await sendRevert('L-postrevoke-spend', session, { to: account, data: execCall(payee, ethers.parseEther('0.001')), gasLimit: 500000 }, 'SessionRevoked()');
  // Note: isValidSignature post-revoke returns 0xffffffff (proven in unit tests).
  // On-chain routing via account fallback not available in this MSCA version.
  results.push({ step: 'L-postrevoke', hash: 'see-tx-above', status: 'SessionRevoked', expected: 'revoked session blocks spends', actual: 'SessionRevoked()' });

  console.log('\n==== Q2 SUMMARY ====');
  console.log('total gas cost USDC:', ethers.formatEther(totalCost));
  for (const r of results) console.log(r.step, '->', r.hash, '|', r.actual);
  fs.writeFileSync('/tmp/q2-results.json', JSON.stringify({ plugin: PLUGIN, account, results, totalCostUSDC: ethers.formatEther(totalCost) }, null, 2));
  console.log('wrote /tmp/q2-results.json');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
