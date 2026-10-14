// Swap USDC -> EURC on Arc mainnet via pinned Uniswap v3 (founder-authorized dust).
// Reads DEPLOYER_PRIVATE_KEY from ~/workspace/user/files/env-2.txt; never prints it.
'use strict';
const { ethers } = require('ethers');
const fs = require('fs');

const RPC = 'https://rpc.mainnet.arc.io';
const USDC = '0x3600000000000000000000000000000000000000'; // 6-decimal ERC-20 mirror
const EURC = '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1'; // 6 decimals
const ROUTER = '0x53BF6B0684Ec7eF91e1387Da3D1a1769bC5A6F77';
const QUOTER = '0x7DfD4F31be6814D2906BDE155c3e1B146EAc1468';
const FEE = 500;

const erc20 = new ethers.Interface([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
]);
const quoterIface = new ethers.Interface([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);
const routerIface = new ethers.Interface([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
]);

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
  const amountIn = BigInt(process.argv[2] || '30000'); // USDC 6-decimal units
  const dest = process.argv[3]; // optional: forward EURC to this address
  const env = loadEnv();
  const provider = new ethers.JsonRpcProvider(RPC);
  let pk = env.DEPLOYER_PRIVATE_KEY;
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  const w = new ethers.Wallet(pk, provider);
  console.log('swapper:', w.address);

  const fee = await provider.getFeeData();
  const gasPrice = fee.gasPrice * 11n / 10n;

  // quote
  const qdata = quoterIface.encodeFunctionData('quoteExactInputSingle', [{ tokenIn: USDC, tokenOut: EURC, amountIn, fee: FEE, sqrtPriceLimitX96: 0 }]);
  const qraw = await provider.call({ to: QUOTER, data: qdata });
  const [amountOut] = quoterIface.decodeFunctionResult('quoteExactInputSingle', qraw);
  console.log('quote:', amountIn.toString(), 'USDC units ->', amountOut.toString(), 'EURC units');
  const minOut = amountOut * 95n / 100n; // 5% slippage

  // approve
  let r = await (await w.sendTransaction({ to: USDC, data: erc20.encodeFunctionData('approve', [ROUTER, amountIn]), gasPrice, gasLimit: 100000 })).wait();
  console.log('approve tx:', r.hash, 'status:', r.status);

  // swap
  const params = { tokenIn: USDC, tokenOut: EURC, fee: FEE, recipient: w.address, amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0 };
  r = await (await w.sendTransaction({ to: ROUTER, data: routerIface.encodeFunctionData('exactInputSingle', [params]), gasPrice, gasLimit: 500000 })).wait();
  console.log('swap tx:', r.hash, 'status:', r.status, 'gas:', r.gasUsed.toString());
  if (r.status !== 1) throw new Error('SWAP FAILED');
  const eurcBal = await provider.call({ to: EURC, data: erc20.encodeFunctionData('balanceOf', [w.address]) });
  console.log('deployer EURC balance:', BigInt(eurcBal).toString());

  if (dest) {
    const amt = BigInt(eurcBal);
    r = await (await w.sendTransaction({ to: EURC, data: erc20.encodeFunctionData('transfer', [dest, amt]), gasPrice, gasLimit: 100000 })).wait();
    console.log('forward tx:', r.hash, 'status:', r.status, 'amount:', amt.toString(), 'to:', dest);
  }
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
