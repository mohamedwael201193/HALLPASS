// Deploy HallpassPlugin v0.2.0 on Arc mainnet (founder-authorized).
// Reads DEPLOYER_PRIVATE_KEY from ~/workspace/user/files/env-2.txt; never prints it.
'use strict';
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const RPC = 'https://rpc.mainnet.arc.io';

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
  let pk = env.DEPLOYER_PRIVATE_KEY;
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const deployer = new ethers.Wallet(pk, provider);
  console.log('deployer:', deployer.address);
  console.log('chain:', (await provider.getNetwork()).chainId.toString());

  const build = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contracts', 'out', 'HallpassPlugin.sol', 'HallpassPlugin.json'), 'utf8'));
  const factory = new ethers.ContractFactory(build.abi, build.bytecode.object, deployer);
  const fee = await provider.getFeeData();
  const gasPrice = fee.gasPrice * 11n / 10n;
  const tx = await factory.getDeployTransaction();
  const gasEst = await provider.estimateGas({ ...tx, from: deployer.address });
  console.log('gas estimate:', gasEst.toString());
  const deployTx = await deployer.sendTransaction({ ...tx, gasPrice, gasLimit: gasEst * 12n / 10n });
  console.log('deploy tx:', deployTx.hash);
  const r = await deployTx.wait();
  console.log('status:', r.status, 'contract:', r.contractAddress, 'gas:', r.gasUsed.toString());
  const cost = r.gasUsed * (r.gasPrice || gasPrice);
  console.log('cost USDC:', ethers.formatEther(cost));
  if (r.status !== 1) throw new Error('DEPLOY FAILED');
  // verify code present
  const code = await provider.getCode(r.contractAddress);
  console.log('code length:', (code.length - 2) / 2);
  fs.writeFileSync('/tmp/hallpass-v02.addr', r.contractAddress + '\n' + deployTx.hash + '\n' + r.blockNumber + '\n');
  console.log('wrote /tmp/hallpass-v02.addr');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
