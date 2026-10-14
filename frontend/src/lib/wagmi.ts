// HALLPASS wallet layer — Reown AppKit + wagmi + viem.
// Bible §9 verdict: Reown, NOT Privy (Privy has a documented eth_sendTransaction
// 401 quirk on Arc plus a snake_case primary_type requirement on its EIP-712
// endpoint — integration risk on the exact paths this product lives on).
//
// Required npm deps (whoever wires package.json):
//   @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query react
//
// Provider wiring (App root, owned by the app shell — NOT this file):
//   import { WagmiProvider } from 'wagmi';
//   import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
//   import { wagmiAdapter, queryClient } from './lib/wagmi';
//   <WagmiProvider config={wagmiAdapter.wagmiConfig}>
//     <QueryClientProvider client={queryClient}> ... </QueryClientProvider>
//   </WagmiProvider>

import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain, http } from 'viem';
import { QueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Arc chain definition (chain 5042). Matches bible §9 official config.
// nativeCurrency is USDC with 18 decimals for GAS accounting; the ERC-20 USDC
// token contract is a separate 6-decimal token (see contracts.ts).
// ---------------------------------------------------------------------------

const RPC_URL =
  (import.meta.env as unknown as Record<string, string | undefined>).VITE_RPC_URL ||
  'https://rpc.mainnet.arc.io';

export const arc = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' },
  },
});

export const ARC_CHAIN_ID = 5042;

// ---------------------------------------------------------------------------
// Reown project id — from env ONLY. Never a hardcoded value, never a fake.
// ---------------------------------------------------------------------------

const REOWN_PROJECT_ID = (import.meta.env as unknown as Record<string, string | undefined>)
  .VITE_REOWN_PROJECT_ID;

export const WALLET_SETUP_ERROR: string | null = REOWN_PROJECT_ID
  ? null
  : [
      'Wallet is not configured: VITE_REOWN_PROJECT_ID is not set.',
      'Get a project ID from the Reown dashboard (https://dashboard.reown.com),',
      'put it in your .env as VITE_REOWN_PROJECT_ID, and restart the dev server.',
      'No wallet features are available until this is set — this is a',
      'configuration gap, not a product failure.',
    ].join(' ');

if (WALLET_SETUP_ERROR) {
  // Fail loudly in the console so it cannot be mistaken for a broken wallet.
  console.error(`[hallpass] ${WALLET_SETUP_ERROR}`);
}

// ---------------------------------------------------------------------------
// wagmi adapter + AppKit. Only initialized when a real project id exists.
// ---------------------------------------------------------------------------

export const queryClient = new QueryClient();

export const wagmiAdapter = REOWN_PROJECT_ID
  ? new WagmiAdapter({
      networks: [arc],
      projectId: REOWN_PROJECT_ID,
      ssr: false,
      transports: { [arc.id]: http(RPC_URL) },
    })
  : null;

export const wagmiConfig = wagmiAdapter?.wagmiConfig ?? null;

/** True when the wallet stack is fully initialized and usable. */
export const WALLET_READY = wagmiAdapter !== null;

if (wagmiAdapter) {
  createAppKit({
    adapters: [wagmiAdapter],
    networks: [arc],
    projectId: REOWN_PROJECT_ID as string,
    metadata: {
      name: 'HALLPASS',
      description: 'On-chain session-key spend policy for Circle smart accounts on Arc',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://hallpass.app',
      icons: [],
    },
    // Only Arc. The app must never silently sign on another chain (bible §8.1).
    allowUnsupportedChain: false,
    features: { analytics: false },
    themeMode: 'dark',
  });
}
