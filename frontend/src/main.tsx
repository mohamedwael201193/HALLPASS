import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// NOTE (F1): wallet provider setup (Reown AppKit + wagmi + viem) is owned by
// worker F9. Do NOT add env-file reads or a projectId here — F9 wires the
// WagmiProvider / AppKitProvider around <App /> when the config lands.

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
