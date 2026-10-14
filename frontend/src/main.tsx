import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { WagmiProvider, type Config as WagmiConfig } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import { wagmiAdapter, queryClient, WALLET_READY } from './lib/wagmi'

// Wallet provider wiring (fix 2026-10-14): previously no WagmiProvider existed
// anywhere in the tree, so even a correctly configured deployment could never
// connect a wallet — every wagmi hook threw and the error boundaries rendered
// the wallet-down state unconditionally.
//
// - WALLET_READY (VITE_REOWN_PROJECT_ID set): full provider stack. wagmi hooks
//   work; the /app Connect screen shows the real connect button.
// - Not configured: NO WagmiProvider. wagmi hooks throw inside the
//   HallpassGate error boundaries, which render the designed "Wallet setup
//   incomplete" state (plain language + what to do) — never a black screen.

function Providers({ children }: { children: React.ReactNode }) {
  const withQuery = (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  if (WALLET_READY && wagmiAdapter) {
    // wagmiAdapter.wagmiConfig is typed against the top-level @wagmi/core v3
    // (pulled in by @reown/appkit-adapter-wagmi), while wagmi@2 types Config
    // against its nested @wagmi/core v2 — hence the cast. The runtime config
    // shape is identical across both (same state keys: connections/current —
    // verified in dist), WagmiProvider is version-agnostic context, and this
    // is Reown's shipped/tested tree. Do NOT "fix" by version-aligning:
    // forcing core v2 breaks @wagmi/connectors@8 (needs the v3-only
    // core/tempo export), and wagmi v2→v3 is a breaking migration.
    const config = wagmiAdapter.wagmiConfig as unknown as WagmiConfig
    return <WagmiProvider config={config}>{withQuery}</WagmiProvider>
  }
  return withQuery
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Providers>
        <App />
      </Providers>
    </BrowserRouter>
  </React.StrictMode>,
)
