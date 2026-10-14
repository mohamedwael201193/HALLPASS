import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useWalletClient } from 'wagmi'
import { type Address, type Hex, isAddress } from 'viem'
import { useHallpass } from '../../lib/useHallpass'
import {
  parsedAccountAbi,
  usdcToNativeWei,
  USDC_ADDRESS,
  EURC_ADDRESS,
  type PolicyParams,
  type PluginVerification,
} from '../../lib/contracts'
import PolicyCard, {
  type InstallState,
  type PluginMeta,
  type VerificationNote,
} from '../../components/PolicyCard'
import TokenIcon, { type TokenKind } from '../../components/TokenIcon'
import GetEurcPanel, { useTokenBalances } from '../../components/GetEurcPanel'
import TapeEmptyState, { TapePrimaryAction } from '../../components/TapeEmptyState'
import { ErrorState } from '../../components/ErrorState'
import { HallpassGate, WalletDownState } from './shared'

/**
 * Marketplace — the Hallpass plugin marketplace screen.
 *
 * Design standard: dashboard, contained max-width, HALLPASS identity tokens
 * (ink #121110, amber #FFB224, text #FFF9EF). One primary action per screen:
 * the Install button on the live card.
 *
 * Honesty rules (bible §11):
 *  - Installed state comes ONLY from getInstalledPlugins() on Arc 5042.
 *  - Install is disabled with the exact reason unless: wallet connected on
 *    Arc, plugin address configured, contract has code, manifest matches.
 *  - While the wallet module isn't ready, Install is DISABLED with the
 *    reason shown — never a fake success toast.
 *  - After submit, "Installed" appears ONLY after the chain confirms it.
 *
 * Install path: owner-signed ERC-4337 v0.7 userOp through the EntryPoint
 * (bible §4.6, proven recipe), self-relayed. Uninstall: owner-signed
 * uninstallPlugin transaction on the account.
 */

const EXPLORER_TX = (h: string) => `https://explorer.arc.io/tx/${h}`

const COMING_SOON: PluginMeta[] = [
  {
    id: 'hallpass-minimal',
    label: 'PLUGIN · CAPS ONLY',
    enforces: [
      'Caps each single payment on accounts that already have their own setup.',
      'Adds no new keys and changes nothing else about the account.',
    ],
    finePrint:
      'Future plugin. Address and manifest below are the research deployment, for reference only.',
    howTo: '',
    name: 'Caps-only policy',
    tagline: 'Just the cap, for accounts that already exist.',
    visual: 'caps',
    address: '0x5780e3DEd211ee13494909432C89Be7b8D6441A3',
    manifestHash: '0xb058e6dcf9dcd9bf9b20674c96c796223c9ddb030e5b84332dfc8e52c7185a64',
    live: false,
  },
  {
    id: 'hallpass-typeddata',
    label: 'PLUGIN · SIGNED APPROVALS',
    enforces: [
      'Pre-approves specific signed payment authorizations, within your caps.',
      'Lets payment networks verify the approval against your account on-chain.',
    ],
    finePrint:
      'Future plugin. Address below is the research deployment, for reference only.',
    howTo: '',
    name: 'Signed approvals policy',
    tagline: 'Your caps, applied to signed payment authorizations too.',
    visual: 'typeddata',
    address: '0x202034589739214Dd4daC17C66FCf53e875B6531',
    live: false,
  },
]

const inputCls = (bad: boolean) =>
  `w-full rounded-lg border bg-ink px-3 py-2.5 font-body text-[15px] text-text outline-none transition-colors min-h-[44px] ${
    bad ? 'border-red-400/60' : 'border-text/15 focus:border-amber/60'
  }`

function Field({
  label,
  children,
  error,
  help,
}: {
  label: string
  children: ReactNode
  error?: string
  help?: string
}) {
  return (
    <div>
      <p className="mb-1.5 font-body text-sm font-bold text-text">{label}</p>
      {children}
      {error ? (
        <p className="mt-1.5 font-body text-[13px] text-red-300">{error}</p>
      ) : help ? (
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-text/50">{help}</p>
      ) : null}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div
      aria-label="Loading plugin information"
      className="rounded-2xl border border-text/10 bg-white/[0.03] p-6 sm:p-8"
    >
      {[70, 100, 55].map((w, i) => (
        <div
          key={i}
          style={{ width: `${w}%` }}
          className="mb-3 h-4 animate-pulse rounded-lg bg-text/10"
        />
      ))}
    </div>
  )
}

/**
 * Inner screen — calls useHallpass()/useWalletClient() directly, so it must
 * only render inside the gate below. The gate only runs its render prop when
 * the wallet stack is configured (P1: no wagmi hook ever runs unconfigured,
 * nothing throws); otherwise it renders WalletDownState.
 */
function MarketplaceLive({ accountAddress }: { accountAddress?: Address }) {
  const hp = useHallpass()
  const { data: walletClient } = useWalletClient()

  const [installState, setInstallState] = useState<InstallState>('checking')
  const [verification, setVerification] = useState<PluginVerification | null>(null)
  const [chainError, setChainError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [uninstalling, setUninstalling] = useState(false)
  const [uninstallArmed, setUninstallArmed] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'bad'; text: string; tx?: string } | null>(null)

  const [sessionKey, setSessionKey] = useState('')
  const [perTx, setPerTx] = useState('0.10')
  const [windowCap, setWindowCap] = useState('1.00')
  const [windowHours, setWindowHours] = useState('24')
  const [expiryHours, setExpiryHours] = useState('168')
  const [allowlist, setAllowlist] = useState('')
  const [touched, setTouched] = useState(false)
  /** Multi-asset cap tokens (plugin v0.2.0): at least one of USDC / EURC. */
  const [capTokens, setCapTokens] = useState<Record<TokenKind, boolean>>({
    USDC: true,
    EURC: false,
  })

  const tokenBalances = useTokenBalances(hp.address)

  const pollRef = useRef(0)
  const plugin = hp.pluginAddress

  const refreshFromChain = useCallback(async () => {
    if (!accountAddress || !plugin) {
      setInstallState('checking')
      return
    }
    setChainError(null)
    try {
      const [installed, ver] = await Promise.all([
        hp.isPluginInstalled(accountAddress),
        hp.verifyPlugin(plugin),
      ])
      setInstallState(installed ? 'installed' : 'not-installed')
      setVerification(ver)
    } catch (e) {
      setChainError(e instanceof Error ? e.message : 'Could not reach Arc.')
      setInstallState('checking')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountAddress, plugin])

  useEffect(() => {
    refreshFromChain()
    return () => {
      pollRef.current += 1
    }
  }, [refreshFromChain])

  /* ---- policy form validation (one input = one fact; errors adjacent) ---- */
  const allowlistAddrs = allowlist.split(',').map((s) => s.trim()).filter(Boolean)
  let perTxWei: bigint | null = null
  let windowWei: bigint | null = null
  try {
    perTxWei = usdcToNativeWei(perTx)
  } catch {
    perTxWei = null
  }
  try {
    windowWei = usdcToNativeWei(windowCap)
  } catch {
    windowWei = null
  }
  const windowSecs = /^\d+$/.test(windowHours.trim()) ? BigInt(windowHours.trim()) * 3600n : null
  const expirySecs = /^\d+$/.test(expiryHours.trim()) ? BigInt(expiryHours.trim()) * 3600n : null

  const errs = {
    sessionKey: !isAddress(sessionKey.trim())
      ? "Enter the agent key's address (0x followed by 40 hex characters)."
      : '',
    capTokens:
      !capTokens.USDC && !capTokens.EURC
        ? 'Pick at least one capped token — USDC, EURC, or both.'
        : '',
    perTx: perTxWei === null || perTxWei <= 0n ? 'Enter an amount above 0, like 0.10.' : '',
    windowCap:
      windowWei === null || windowWei <= 0n
        ? 'Enter an amount above 0, like 1.00.'
        : perTxWei !== null && windowWei < perTxWei
          ? "The window total can't be smaller than the per-payment cap."
          : '',
    windowHours: windowSecs === null || windowSecs <= 0n ? 'Enter whole hours above 0, like 24.' : '',
    expiryHours: expirySecs === null || expirySecs <= 0n ? 'Enter whole hours above 0, like 168.' : '',
    allowlist: allowlistAddrs.some((a) => !isAddress(a))
      ? "One of the addresses doesn't look right — each must be 0x + 40 hex characters."
      : '',
  }
  const formValid = Object.values(errs).every((e) => e === '')

  const checking = installState === 'checking' && !chainError
  const installDisabledReason: string | undefined = !hp.isConnected
    ? 'Install is off: connect your wallet first.'
    : !hp.isArc
      ? 'Install is off: switch to the Arc network first.'
      : hp.walletSetupError
        ? hp.walletSetupError
        : hp.pluginConfigError
          ? hp.pluginConfigError
          : checking
            ? 'Install is off: still checking the chain…'
      : verification && !verification.hasCode
        ? 'Install is off: the plugin contract has no code on Arc mainnet, so there is nothing to install.'
        : verification && !verification.supportsIPlugin
          ? 'Install is off: the configured address is not a valid plugin.'
          : verification && verification.matchesConfigured === false
            ? 'Install is off: the on-chain manifest does not match the configured one — the plugin binary changed.'
            : touched && !formValid
              ? 'Install is off: fix the highlighted fields above first.'
              : undefined

  const verificationNote: VerificationNote | undefined = !plugin
    ? undefined
    : !verification
      ? 'unknown'
      : !verification.hasCode
        ? 'no-code'
        : verification.matchesConfigured === false
          ? 'manifest-mismatch'
          : 'onchain-ok'

  const livePlugin: PluginMeta = {
    id: 'hallpass-policy',
    label: 'PLUGIN · SESSION POLICY',
    enforces: [
      "Caps each single payment your agent's key can make.",
      'Caps total spending inside a rolling time window you choose.',
      'Limits payments to addresses you approve — or anyone, if you leave the list empty.',
      'Shuts the key off automatically at an expiry time you set.',
      'Lets you revoke the key instantly, any time.',
    ],
    finePrint:
      'This address was configured by the deployer after the production build was verified. The install button opens only while the on-chain checks above pass.',
    howTo:
      "Install it on your smart account, add your agent's key, and set its limits. From then on the account itself blocks anything outside the limits — no server in between.",
    name: 'Hallpass session policy',
    tagline: "A spending rule your agent's key cannot outrun.",
    visual: 'hallpass',
    address: plugin,
    manifestHash: verification?.manifestHash && verification.manifestHash !== '0x' ? verification.manifestHash : undefined,
    live: true,
  }

  async function waitForInstalled(want: boolean): Promise<boolean> {
    const myPoll = ++pollRef.current
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      if (pollRef.current !== myPoll || !accountAddress) return false
      try {
        if ((await hp.isPluginInstalled(accountAddress)) === want) return true
      } catch {
        /* a transient RPC miss is not a verdict — keep polling */
      }
    }
    return false
  }

  function buildPolicy(): PolicyParams {
    // v0.2.0 multi-asset: tokens + parallel decimals (USDC 18, EURC 6).
    const tokens: Address[] = [];
    const tokenDecimals: number[] = [];
    if (capTokens.USDC) {
      tokens.push(USDC_ADDRESS);
      tokenDecimals.push(18);
    }
    if (capTokens.EURC) {
      tokens.push(EURC_ADDRESS);
      tokenDecimals.push(6);
    }
    // The plugin gates the token contract for token spends — when EURC is a
    // capped asset its contract address must be allowlisted, automatically.
    const allowlistFinal = [...(allowlistAddrs as Address[])];
    if (
      capTokens.EURC &&
      !allowlistFinal.some((a) => a.toLowerCase() === EURC_ADDRESS.toLowerCase())
    ) {
      allowlistFinal.push(EURC_ADDRESS);
    }
    return {
      sessionKey: sessionKey.trim() as Address,
      owner: hp.address as Address,
      perTxCapWei: perTxWei as bigint,
      windowCapWei: windowWei as bigint,
      windowSecs: windowSecs as bigint,
      expiry: BigInt(Math.floor(Date.now() / 1000)) + (expirySecs as bigint),
      allowlist: allowlistFinal,
      tokens,
      tokenDecimals,
    };
  }

  // Show the Get EURC panel when EURC is a capped asset but the connected
  // wallet holds none — never strand a USDC-only user.
  const showGetEurc =
    capTokens.EURC && !!hp.address && tokenBalances.loaded && tokenBalances.eurc === 0n;

  async function handleInstall() {
    setTouched(true)
    if (!formValid || !accountAddress || !plugin) return
    setInstalling(true)
    setNotice(null)
    try {
      const { userOpHash, txHash } = await hp.signAndSendUserOp(accountAddress, buildPolicy(), {
        ownerKind: 'eoa',
        via: 'direct',
      })
      const confirmed = await waitForInstalled(true)
      if (confirmed) {
        setInstallState('installed')
        setNotice({ kind: 'ok', text: 'Installed. The chain confirms the plugin is on your account.', tx: txHash })
      } else {
        /* Never claim installed without chain confirmation. */
        setNotice({
          kind: 'bad',
          text: `Submitted (userOp ${userOpHash.slice(0, 18)}…) but the plugin isn't showing on-chain yet. Nothing is marked installed — refresh to re-check.`,
          tx: txHash,
        })
        refreshFromChain()
      }
    } catch (e) {
      setNotice({
        kind: 'bad',
        text: `Install didn't go through: ${e instanceof Error ? e.message : 'unknown error'}. Nothing was installed.`,
      })
    } finally {
      setInstalling(false)
    }
  }

  async function handleUninstall() {
    if (!accountAddress || !plugin || !walletClient || !hp.address) return
    setUninstalling(true)
    try {
      const txHash = await walletClient.writeContract({
        address: accountAddress,
        abi: parsedAccountAbi,
        functionName: 'uninstallPlugin',
        args: [plugin, '0x' as Hex, '0x' as Hex],
        account: hp.address,
        chain: walletClient.chain,
      })
      const confirmed = await waitForInstalled(false)
      if (confirmed) {
        setInstallState('not-installed')
        setNotice({ kind: 'ok', text: 'Removed. The chain confirms the plugin is off your account.', tx: txHash })
      } else {
        setNotice({
          kind: 'bad',
          text: 'Submitted, but the plugin still shows on-chain. Nothing is marked removed — refresh to re-check.',
          tx: txHash,
        })
        refreshFromChain()
      }
    } catch (e) {
      setNotice({
        kind: 'bad',
        text: `Removal didn't go through: ${e instanceof Error ? e.message : 'unknown error'}. The plugin is still installed.`,
      })
    } finally {
      setUninstalling(false)
      setUninstallArmed(false)
    }
  }

  const capTokenOptions: { kind: TokenKind; decimals: number; note: string }[] = [
    { kind: 'USDC', decimals: 18, note: "Arc's gas token" },
    { kind: 'EURC', decimals: 6, note: 'Euro stablecoin' },
  ]

  const selectedTokenNames = (['USDC', 'EURC'] as TokenKind[]).filter((t) => capTokens[t])

  const policyForm = (
    <div className="mb-2 mt-1">
      <h3 className="mb-3 text-sm font-extrabold uppercase tracking-[0.15em] text-amber">
        Set the limits
      </h3>
      <div className="grid max-w-[520px] gap-4">
        <Field
          label="Agent key address"
          error={touched ? errs.sessionKey || undefined : undefined}
          help="The key your agent will spend with. Create one on the Session keys screen if you don't have one yet."
        >
          <input
            value={sessionKey}
            onChange={(e) => setSessionKey(e.target.value)}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            className={inputCls(touched && !!errs.sessionKey)}
          />
        </Field>
        <Field
          label="Capped tokens"
          error={touched ? errs.capTokens || undefined : undefined}
          help="The caps below apply to each token in its own units."
        >
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Capped tokens">
            {capTokenOptions.map((opt) => {
              const on = capTokens[opt.kind]
              return (
                <button
                  key={opt.kind}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setCapTokens((s) => ({ ...s, [opt.kind]: !s[opt.kind] }))
                  }
                  className={`flex min-h-[64px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                    on
                      ? 'border-amber/60 bg-amber/[0.08]'
                      : 'border-text/15 bg-ink hover:border-text/30'
                  }`}
                >
                  <TokenIcon token={opt.kind} size={28} />
                  <span>
                    <span className="block font-body text-base font-bold text-text">
                      {opt.kind}
                    </span>
                    <span className="block font-body text-xs text-text/50">
                      {opt.note} · {opt.decimals} decimals
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`ml-auto flex h-5 w-5 items-center justify-center rounded-md border text-[13px] font-bold ${
                      on ? 'border-amber bg-amber text-ink' : 'border-text/30 text-transparent'
                    }`}
                  >
                    ✓
                  </span>
                </button>
              )
            })}
          </div>
        </Field>
        {capTokens.EURC && (
          <p className="rounded-xl border border-amber/25 bg-amber/[0.05] px-4 py-3 font-body text-[13px] leading-relaxed text-text/70">
            EURC's contract address is added to the destination list automatically —
            the plugin gates the token contract whenever a token spend happens.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Max per payment"
            error={touched ? errs.perTx || undefined : undefined}
            help="Per capped token, in that token's own units."
          >
            <input
              value={perTx}
              onChange={(e) => setPerTx(e.target.value)}
              inputMode="decimal"
              className={inputCls(touched && !!errs.perTx)}
            />
          </Field>
          <Field
            label="Max per window"
            error={touched ? errs.windowCap || undefined : undefined}
            help="Per capped token, in that token's own units."
          >
            <input
              value={windowCap}
              onChange={(e) => setWindowCap(e.target.value)}
              inputMode="decimal"
              className={inputCls(touched && !!errs.windowCap)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            label="Window length (hours)"
            error={touched ? errs.windowHours || undefined : undefined}
            help="The spending total resets every window."
          >
            <input
              value={windowHours}
              onChange={(e) => setWindowHours(e.target.value)}
              inputMode="numeric"
              className={inputCls(touched && !!errs.windowHours)}
            />
          </Field>
          <Field
            label="Key expires after (hours)"
            error={touched ? errs.expiryHours || undefined : undefined}
            help="The key stops working automatically."
          >
            <input
              value={expiryHours}
              onChange={(e) => setExpiryHours(e.target.value)}
              inputMode="numeric"
              className={inputCls(touched && !!errs.expiryHours)}
            />
          </Field>
        </div>
        <Field
          label="Allowed addresses (optional)"
          error={touched ? errs.allowlist || undefined : undefined}
          help="Leave empty and the key can pay anyone — the caps still apply."
        >
          <input
            value={allowlist}
            onChange={(e) => setAllowlist(e.target.value)}
            placeholder="0x…, 0x… (comma-separated)"
            autoComplete="off"
            spellCheck={false}
            className={inputCls(touched && !!errs.allowlist)}
          />
        </Field>
      </div>
      {showGetEurc && hp.address && (
        <div className="mt-5 max-w-[640px]">
          <GetEurcPanel address={hp.address} title="You picked EURC but hold none" />
        </div>
      )}
      <p className="mt-3 max-w-[60ch] font-body text-[13px] leading-relaxed text-text/50">
        {`In plain words: this key may spend at most $${perTx || '…'} per payment, $${windowCap || '…'} every ${windowHours || '…'} hours, in ${selectedTokenNames.length ? selectedTokenNames.join(' and ') : '…'}${
          allowlistAddrs.length
            ? `, only to ${allowlistAddrs.length} address${allowlistAddrs.length > 1 ? 'es' : ''}`
            : ', to anyone'
        }, for the next ${expiryHours || '…'} hours.`}
      </p>
    </div>
  )

  const confirmUninstall = (
    <div
      role="alertdialog"
      aria-label="Confirm removal"
      className="mt-6 max-w-[560px] rounded-[10px] border border-red-400/30 bg-ink p-4"
    >
      <p className="mb-2 font-body text-[15px] font-bold text-text">Remove this spending rule?</p>
      <p className="mb-4 font-body text-sm leading-relaxed text-text/60">
        The on-chain limits come off your account. Your agent's key keeps working, but
        with no caps, no allowlist, and no expiry until you add a new rule.
      </p>
      <button
        type="button"
        onClick={() => setUninstallArmed(false)}
        className="mr-3 min-h-[44px] rounded-[10px] border border-text/20 bg-transparent px-6 py-2.5 font-body text-[15px] font-semibold text-text/70 transition-colors hover:border-text/40"
      >
        Keep it
      </button>
      <button
        type="button"
        onClick={handleUninstall}
        disabled={uninstalling}
        className="min-h-[44px] rounded-[10px] bg-red-900 px-6 py-2.5 font-body text-[15px] font-bold text-text disabled:cursor-wait disabled:opacity-60"
      >
        {uninstalling ? 'Removing…' : 'Yes, remove'}
      </button>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-[960px] px-5 py-10 sm:px-8">
      <p className="mb-2.5 text-xs font-extrabold uppercase tracking-[0.2em] text-text/50">
        Hallpass · Marketplace
      </p>
      <h1 className="mb-2 font-body text-3xl font-semibold text-text sm:text-4xl">
        Spending rules for agent keys.
      </h1>
      <p className="mb-7 max-w-[60ch] font-body text-base leading-relaxed text-text/60">
        Install a rule on your smart account and your agent's key can only spend
        inside it. The account enforces it — not a server.
      </p>

      {!accountAddress ? (
        hp.isConnected ? (
          <TapeEmptyState
            title="No account selected."
            copy="Pick an account on the Accounts screen to see its spending rules."
            action={
              <TapePrimaryAction to="/app/accounts">
                Go to my accounts
              </TapePrimaryAction>
            }
          />
        ) : (
          <TapeEmptyState
            title="No wallet connected."
            copy="Connect your wallet to see which spending rules are on your accounts. Nothing is shown until then — nothing is guessed."
            action={
              <TapePrimaryAction onClick={() => hp.connect()}>
                Connect wallet
              </TapePrimaryAction>
            }
          />
        )
      ) : chainError ? (
        <ErrorState
          title="Can't reach Arc right now"
          message={`${chainError} Nothing below can be trusted until the connection is back.`}
          retryLabel="Retry"
          onRetry={refreshFromChain}
        />
      ) : (
        <>
          {checking || !plugin ? (
            <SkeletonCard />
          ) : (
            <PolicyCard
              plugin={livePlugin}
              installState={installState}
              verification={verificationNote}
              installDisabled={!!installDisabledReason || installing}
              installDisabledReason={installing ? undefined : installDisabledReason}
              installing={installing}
              uninstalling={uninstalling}
              uninstallArmed={uninstallArmed}
              policyForm={policyForm}
              confirmUninstall={confirmUninstall}
              onInstall={handleInstall}
              onArmUninstall={() => setUninstallArmed(true)}
            />
          )}

          <div aria-live="polite">
            {notice && (
              <div
                className={`mb-5 rounded-[10px] border p-4 font-body text-[15px] leading-relaxed ${
                  notice.kind === 'ok' ? 'border-amber/40 bg-ink' : 'border-red-400/30 bg-ink'
                }`}
              >
                <span className="text-text">{notice.text}</span>{' '}
                {notice.tx && (
                  <a
                    href={EXPLORER_TX(notice.tx)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-amber underline decoration-dotted underline-offset-4 hover:text-amber/80"
                  >
                    View on the explorer
                  </a>
                )}
              </div>
            )}
          </div>

          {(!hp.isConnected || !hp.isArc) && !checking && (
            <div className="mb-5">
              {!hp.isConnected ? (
                <button
                  type="button"
                  onClick={() => hp.connect()}
                  className="min-h-[44px] rounded-full border border-amber/50 px-6 py-2.5 font-body text-sm font-semibold text-amber transition-colors hover:border-amber"
                >
                  Connect wallet
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => hp.switchToArc()}
                  className="min-h-[44px] rounded-full border border-amber/50 px-6 py-2.5 font-body text-sm font-semibold text-amber transition-colors hover:border-amber"
                >
                  Switch to Arc
                </button>
              )}
            </div>
          )}

          <div className="mt-8 space-y-5">
            {COMING_SOON.map((p) => (
              <PolicyCard
                key={p.id}
                plugin={p}
                installState="coming-soon"
                installDisabled
                installDisabledReason="Coming soon."
                installing={false}
                uninstalling={false}
                uninstallArmed={false}
                onInstall={() => {}}
                onArmUninstall={() => {}}
              />
            ))}
          </div>

          <p className="mt-7 max-w-[60ch] font-body text-[13px] leading-relaxed text-text/50">
            *Every state on this screen is read from Arc mainnet (chain 5042). If the
            network is unreachable, nothing here is shown as true. Installing or
            removing a rule is an on-chain action signed by the account owner.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Gated default export — the wallet gate. When unconfigured, the gate
 * wallet stack isn't ready (no provider yet, or no Reown project id); the
 * boundary turns that into the honest WalletDownState instead of a crash.
 */
export default function Marketplace({ accountAddress }: { accountAddress?: Address }) {
  return (
    <HallpassGate
      render={() => <MarketplaceLive accountAddress={accountAddress} />}
      fallback={<WalletDownState />}
    />
  )
}
