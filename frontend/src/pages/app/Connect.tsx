// F5 — (a) Connect. One enormous, obvious connect button.
//
// Live flow via src/lib (useHallpass): connect → wrong-network → connected.
// Never renders a fake "connected" state: every branch below is driven by
// real wallet state, and the wallet-stack-down case is an honest panel.

import { Link } from 'react-router-dom';
import type { UseHallpass } from '../../lib/useHallpass';
import { DashedTapeArt } from '../../components/TapeEmptyState';
import {
  ARC_CHAIN_ID,
  CopyButton,
  HallpassGate,
  IconWallet,
  WalletDownState,
  truncateAddress,
} from './shared';

const PRIMARY_BTN =
  'inline-flex min-h-[80px] items-center justify-center rounded-full bg-amber px-12 font-display text-xl font-extrabold text-ink transition-transform duration-200 hover:scale-[1.03] active:scale-[0.99] md:px-20 md:text-2xl';

function TrustDisclosure() {
  return (
    <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-amber/25 bg-amber/[0.05] p-5 text-left">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber">
        Before you connect
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-text/75">
        Anyone who controls your wallet controls these accounts. If your wallet
        is compromised, no policy can save the funds — the same is true of every
        smart account. Keep your owner key somewhere safe.
      </p>
    </div>
  );
}

function ConnectLive({ hp }: { hp: UseHallpass }) {
  /* Not connected — the one enormous button. */
  if (!hp.isConnected) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center md:py-16">
        <div className="mb-6 text-amber/80">
          <DashedTapeArt className="h-24 w-24" label="Connect your wallet" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-amber">
          Step 1 of 1 to start
        </p>
        <h1 className="mt-4 font-display text-4xl font-extrabold leading-tight text-text md:text-5xl">
          Connect your wallet to begin.
        </h1>

        <div className="mt-10">
          <button type="button" onClick={hp.connect} className={PRIMARY_BTN}>
            Connect wallet
          </button>
        </div>
        <p className="mt-4 text-sm text-text/50">
          Opens the wallet picker — pick any wallet, then approve on Arc.
        </p>

        <div className="mt-12 grid w-full gap-4 text-left md:grid-cols-3">
          {[
            {
              t: 'A session key is a spare key',
              d: 'You hand your agent a key that can spend — instead of your real keys.',
            },
            {
              t: 'The hall pass sets the bounds',
              d: 'Per-payment cap, spending window, expiry, allowed destinations.',
            },
            {
              t: 'The chain enforces it',
              d: 'Over the limit, the transaction reverts on-chain. Revoke anytime.',
            },
          ].map((s) => (
            <div
              key={s.t}
              className="rounded-2xl border border-text/10 bg-text/[0.03] p-5"
            >
              <p className="font-display font-bold text-text">{s.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-text/65">{s.d}</p>
            </div>
          ))}
        </div>

        <TrustDisclosure />

        <p className="mt-8 text-sm text-text/50">
          Next: pick or add a smart account on the{' '}
          <Link to="/app/accounts" className="font-semibold text-amber hover:underline">
            Accounts
          </Link>{' '}
          screen.
        </p>
      </div>
    );
  }

  /* Connected to the wrong network — switch prompt, never silent signing. */
  if (!hp.isArc) {
    return (
      <div className="mx-auto max-w-xl py-10 text-center md:py-16">
        <h1 className="font-display text-4xl font-extrabold text-text">
          Wrong network
        </h1>
        <p className="mx-auto mt-4 max-w-md leading-relaxed text-text/70">
          Your wallet is connected, but not on Arc. HALLPASS only signs on Arc
          (chain {ARC_CHAIN_ID}) — switch networks to continue.
        </p>
        <button
          type="button"
          onClick={hp.switchToArc}
          className="mt-8 inline-flex min-h-[64px] items-center rounded-full bg-amber px-10 font-display text-lg font-extrabold text-ink transition-transform duration-200 hover:scale-[1.03]"
        >
          Switch to Arc
        </button>
        <p className="mt-4 font-mono text-sm text-text/50">
          {truncateAddress(hp.address ?? '')} · connected
        </p>
      </div>
    );
  }

  /* Connected on Arc — confirm identity, name the next action. */
  return (
    <div className="mx-auto max-w-xl py-10 text-center md:py-16">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber/15 text-amber">
        <IconWallet className="h-8 w-8" />
      </div>
      <h1 className="mt-6 font-display text-4xl font-extrabold text-text">
        You're connected.
      </h1>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-text/15 bg-text/[0.04] py-2 pl-4 pr-2">
        <span className="font-mono text-sm text-text/85">
          {truncateAddress(hp.address ?? '')}
        </span>
        <CopyButton value={hp.address ?? ''} label="Copy wallet address" />
        <span className="mr-1 rounded-full bg-amber/15 px-3 py-1 text-xs font-bold text-amber">
          Arc · {ARC_CHAIN_ID}
        </span>
      </div>
      <p className="mx-auto mt-6 max-w-md leading-relaxed text-text/70">
        This wallet owns your smart accounts. Add one to install its first hall
        pass.
      </p>
      <Link
        to="/app/accounts"
        className="mt-8 inline-flex min-h-[64px] items-center rounded-full bg-amber px-10 font-display text-lg font-extrabold text-ink transition-transform duration-200 hover:scale-[1.03]"
      >
        View my accounts
      </Link>
    </div>
  );
}

export default function Connect() {
  return (
    <HallpassGate
      render={(hp) => <ConnectLive hp={hp} />}
      fallback={<WalletDownState />}
    />
  );
}
