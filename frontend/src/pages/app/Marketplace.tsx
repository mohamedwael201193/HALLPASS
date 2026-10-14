import React, { useCallback, useEffect, useRef, useState } from "react";
import PolicyCard, { InstallState, PluginMeta } from "../../components/PolicyCard";

/**
 * Marketplace — the Hallpass plugin marketplace screen.
 *
 * Design standard: dashboard, contained max-width (not full-bleed), HALLPASS
 * identity tokens (bg #121110, paper #FFF9EF, amber #FFB224 on status + CTA).
 * One primary action per screen: the Install button on the live card.
 *
 * Chain truth (no mocks, no placeholders):
 *  - Installed state comes ONLY from account.getInstalledPlugins() on Arc 5042.
 *  - The plugin card is installable ONLY if the plugin address has code AND
 *    Sourcify reports an exact source match. Anything else disables Install
 *    with the exact reason shown.
 *  - Install/Uninstall run through F9's wallet module (see contract below).
 *    While the module is not loaded, Install is DISABLED with the reason
 *    "Wallet module loading." — never a fake success.
 *
 * ── Expected F9 wallet module: src/lib/wallet ─────────────────────────────
 *  export async function installPlugin(args: {
 *    account: string; plugin: string;
 *    policy: { sessionKey: string; perTxCapWei: string; windowCapWei: string;
 *              windowSecs: number; expiry: number; allowlist: string[] };
 *  }): Promise<{ txHash?: string; userOpHash?: string }>;
 *  export async function uninstallPlugin(args: { account: string; plugin: string })
 *    : Promise<{ txHash?: string }>;
 *  The module computes manifestHash from the deployed plugin's on-chain
 *  pluginManifest() (bible §7 Flow A) and submits either a direct owner tx or
 *  an owner-signed userOp via the EntryPoint, per the account type.
 * ────────────────────────────────────────────────────────────────────────────
 */

const RPC_URL = "https://rpc.mainnet.arc.io";
const CHAIN_ID = 5042;

/* Selectors computed with keccak256 (js-sha3), 2026-10-14. Sanity-checked:
   installPlugin(...) -> 0xf85730f4 and uninstallPlugin(...) -> 0xc1a221f3,
   both byte-identical to the build bible §4.1. Never hand-write a selector. */
const SEL_GET_INSTALLED_PLUGINS = "0x3a0cac56"; // getInstalledPlugins()

/* Full Hallpass policy plugin — W1B2 enforcement-proven research deployment.
   NOTE: the build bible §4.2 prints this address 3 hex digits short
   (0x7C912e73…17ABDd); the correct 42-char address below was recovered from
   the original H9 ledgers (w1b-enforcement.md) and re-verified: it has code
   on Arc mainnet but Sourcify reports NO match, so Install stays disabled
   until the fixed production build is deployed + exact-match verified. */
const HALLPASS_PLUGIN = "0x7C912e73f9b8B60e4c68d58d52DeC5524e17ABDd";

const EXPLORER_TX = (h: string) => `https://explorer.arc.io/tx/${h}`;

interface WalletModule {
  installPlugin: (args: InstallArgs) => Promise<{ txHash?: string; userOpHash?: string }>;
  uninstallPlugin: (args: { account: string; plugin: string }) => Promise<{ txHash?: string }>;
}
interface InstallArgs {
  account: string;
  plugin: string;
  policy: {
    sessionKey: string;
    perTxCapWei: string;
    windowCapWei: string;
    windowSecs: number;
    expiry: number;
    allowlist: string[];
  };
}

let walletPromise: Promise<WalletModule | null> | null = null;
function loadWalletModule(): Promise<WalletModule | null> {
  if (!walletPromise) {
    walletPromise = import("../../lib/wallet")
      .then((m) =>
        typeof m?.installPlugin === "function" && typeof m?.uninstallPlugin === "function"
          ? (m as WalletModule)
          : null
      )
      .catch(() => null);
  }
  return walletPromise;
}

async function rpcCall(method: string, params: unknown[]): Promise<string> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Arc RPC unreachable (HTTP ${res.status}).`);
  const json = await res.json();
  if (json.error) throw new Error(`Arc RPC error: ${json.error.message || "unknown"}.`);
  return json.result as string;
}

function decodeAddressArray(hex: string): string[] {
  const words: string[] = [];
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  const n = parseInt(body.slice(64, 128), 16);
  for (let i = 0; i < n; i++) {
    const w = body.slice(128 + i * 64, 128 + (i + 1) * 64);
    words.push("0x" + w.slice(-40));
  }
  return words;
}

async function sourcifyStatus(address: string): Promise<"exact" | "partial" | "none" | "unknown"> {
  try {
    const res = await fetch(`https://sourcify.dev/server/v2/contract/${CHAIN_ID}/${address}`);
    if (!res.ok) return "unknown";
    const j = await res.json();
    if (j.match === "perfect") return "exact";
    if (j.match === "partial") return "partial";
    return "none";
  } catch {
    return "unknown";
  }
}

function usdcToWei(input: string): string | null {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(input.trim());
  if (!m) return null;
  const frac = (m[2] || "").padEnd(18, "0");
  return (BigInt(m[1]) * 10n ** 18n + BigInt(frac)).toString();
}
const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s.trim());

const PLUGINS: PluginMeta[] = [
  {
    id: "hallpass-policy",
    label: "PLUGIN · SESSION POLICY",
    enforces: [
      "Caps each single payment your agent's key can make.",
      "Caps total spending inside a rolling time window you choose.",
      "Limits payments to addresses you approve — or anyone, if you leave the list empty.",
      "Shuts the key off automatically at an expiry time you set.",
      "Lets you revoke the key instantly, any time.",
    ],
    finePrint:
      "Research deployment shown for reference. The production build ships after the signature-handling fix is re-verified on mainnet, and install opens only when Sourcify shows an exact source match.",
    howTo:
      "Install it on your smart account, add your agent's key, and set its limits. From then on the account itself blocks anything outside the limits — no server in between.",
    name: "Hallpass session policy",
    tagline: "A spending rule your agent's key cannot outrun.",
    visual: "hallpass",
    address: HALLPASS_PLUGIN,
    live: true,
  },
  {
    id: "hallpass-minimal",
    label: "PLUGIN · CAPS ONLY",
    enforces: [
      "Caps each single payment on accounts that already have their own setup.",
      "Adds no new keys and changes nothing else about the account.",
    ],
    finePrint: "Future plugin. Address and manifest below are the research deployment, for reference only.",
    howTo: "",
    name: "Caps-only policy",
    tagline: "Just the cap, for accounts that already exist.",
    visual: "caps",
    address: "0x5780e3DEd211ee13494909432C89Be7b8D6441A3",
    manifestHash: "0xb058e6dcf9dcd9bf9b20674c96c796223c9ddb030e5b84332dfc8e52c7185a64",
    live: false,
  },
  {
    id: "hallpass-typeddata",
    label: "PLUGIN · SIGNED APPROVALS",
    enforces: [
      "Pre-approves specific signed payment authorizations, within your caps.",
      "Lets payment networks verify the approval against your account on-chain.",
    ],
    finePrint: "Future plugin. Address below is the research deployment, for reference only.",
    howTo: "",
    name: "Signed approvals policy",
    tagline: "Your caps, applied to signed payment authorizations too.",
    visual: "typeddata",
    address: "0x202034589739214Dd4daC17C66FCf53e875B6531",
    live: false,
  },
];

const inputStyle = (bad: boolean): React.CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  background: "#121110",
  border: `1px solid ${bad ? "#F87171" : "#4A443C"}`,
  borderRadius: 8,
  color: "#FFF9EF",
  fontSize: 15,
  padding: "10px 12px",
  minHeight: 44,
});
const fieldErr: React.CSSProperties = { fontSize: 13, color: "#F87171", margin: "6px 0 0" };
const labelS: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: "#FFF9EF", margin: "0 0 6px" };
const helpS: React.CSSProperties = { fontSize: 13, color: "#CFC6B8", margin: "6px 0 0", lineHeight: 1.5 };

function EmptyState() {
  return (
    <div
      style={{
        border: "1px dashed #4A443C",
        borderRadius: 14,
        padding: 40,
        textAlign: "center",
        color: "#CFC6B8",
        marginBottom: 20,
      }}
    >
      <svg width="48" height="48" viewBox="0 0 48 48" role="img" aria-label="No account selected" style={{ marginBottom: 12 }}>
        <g fill="none" stroke="#FFB224" strokeWidth="2.5" strokeLinecap="round">
          <rect x="8" y="12" width="32" height="24" rx="6" />
          <line x1="18" y1="12" x2="18" y2="36" strokeDasharray="4 4" />
        </g>
      </svg>
      <p style={{ fontSize: 16, margin: 0 }}>Select an account to see its plugins.</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div
      aria-label="Loading plugin information"
      style={{ background: "#1B1916", border: "1px solid #2E2A24", borderRadius: 14, padding: 24, marginBottom: 20 }}
    >
      {[70, 100, 55].map((w, i) => (
        <div
          key={i}
          style={{
            height: 16,
            width: `${w}%`,
            borderRadius: 8,
            background: "#2E2A24",
            marginBottom: 12,
            animation: "hp-pulse 1.2s ease-in-out infinite",
          }}
        />
      ))}
      <style>{`@keyframes hp-pulse{0%,100%{opacity:.5}50%{opacity:1}}`}</style>
    </div>
  );
}

export default function Marketplace({ accountAddress }: { accountAddress?: string }) {
  const [installState, setInstallState] = useState<InstallState>("checking");
  const [hasCode, setHasCode] = useState<boolean | null>(null);
  const [verification, setVerification] = useState<"exact" | "partial" | "none" | "unknown">("unknown");
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [uninstallArmed, setUninstallArmed] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "bad"; text: string; tx?: string } | null>(null);

  const [sessionKey, setSessionKey] = useState("");
  const [perTx, setPerTx] = useState("0.10");
  const [windowCap, setWindowCap] = useState("1.00");
  const [windowHours, setWindowHours] = useState("24");
  const [expiryHours, setExpiryHours] = useState("168");
  const [allowlist, setAllowlist] = useState("");
  const [touched, setTouched] = useState(false);

  const pollRef = useRef<number>(0);

  const refreshFromChain = useCallback(async () => {
    if (!accountAddress) {
      setInstallState("checking");
      return;
    }
    setRpcError(null);
    try {
      const [installedHex, code] = await Promise.all([
        rpcCall("eth_call", [{ to: accountAddress, data: SEL_GET_INSTALLED_PLUGINS }, "latest"]),
        rpcCall("eth_getCode", [HALLPASS_PLUGIN, "latest"]),
      ]);
      const installed = decodeAddressArray(installedHex).map((a) => a.toLowerCase());
      setInstallState(installed.includes(HALLPASS_PLUGIN.toLowerCase()) ? "installed" : "not-installed");
      setHasCode(code !== "0x" && code.length > 2);
      setVerification(await sourcifyStatus(HALLPASS_PLUGIN));
    } catch (e) {
      setRpcError(e instanceof Error ? e.message : "Could not reach Arc.");
      setInstallState("checking");
    }
  }, [accountAddress]);

  useEffect(() => {
    refreshFromChain();
    loadWalletModule().then((m) => setWalletReady(m !== null));
    return () => {
      pollRef.current += 1;
    };
  }, [refreshFromChain]);

  /* ---- policy form validation (one input = one fact; errors adjacent) ---- */
  const perTxWei = usdcToWei(perTx);
  const windowWei = usdcToWei(windowCap);
  const windowSecs = /^\d+$/.test(windowHours.trim()) ? parseInt(windowHours.trim(), 10) * 3600 : NaN;
  const expirySecs = /^\d+$/.test(expiryHours.trim()) ? parseInt(expiryHours.trim(), 10) * 3600 : NaN;
  const allowlistAddrs = allowlist.split(",").map((s) => s.trim()).filter(Boolean);
  const errs = {
    sessionKey: !isAddress(sessionKey) ? "Enter the agent key's address (0x followed by 40 hex characters)." : "",
    perTx: perTxWei === null || BigInt(perTxWei) <= 0n ? "Enter an amount above 0, like 0.10." : "",
    windowCap:
      windowWei === null || BigInt(windowWei) <= 0n
        ? "Enter an amount above 0, like 1.00."
        : perTxWei !== null && BigInt(windowWei) < BigInt(perTxWei)
        ? "The window total can't be smaller than the per-payment cap."
        : "",
    windowHours: !Number.isFinite(windowSecs) || windowSecs <= 0 ? "Enter whole hours above 0, like 24." : "",
    expiryHours: !Number.isFinite(expirySecs) || expirySecs <= 0 ? "Enter whole hours above 0, like 168." : "",
    allowlist: allowlistAddrs.some((a) => !isAddress(a))
      ? "One of the addresses doesn't look right — each must be 0x + 40 hex characters."
      : "",
  };
  const formValid = Object.values(errs).every((e) => e === "");

  const installDisabledReason: string | undefined = !accountAddress
    ? "Install is off: select an account first."
    : rpcError
    ? "Install is off: Arc is unreachable right now. Check your connection and refresh."
    : installState === "checking"
    ? "Install is off: still checking the chain…"
    : hasCode === false
    ? "Install is off: the plugin contract has no code on Arc mainnet, so there is nothing to install."
    : verification !== "exact"
    ? "Install is off: the plugin's source isn't verified on Sourcify yet (exact match required). Install opens when the production build is verified."
    : !walletReady
    ? "Install is off: wallet module loading."
    : touched && !formValid
    ? "Install is off: fix the highlighted fields above first."
    : undefined;

  async function waitForChainState(wantInstalled: boolean): Promise<boolean> {
    const myPoll = ++pollRef.current;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      if (pollRef.current !== myPoll) return false;
      try {
        const hex = await rpcCall("eth_call", [{ to: accountAddress, data: SEL_GET_INSTALLED_PLUGINS }, "latest"]);
        const list = decodeAddressArray(hex).map((a) => a.toLowerCase());
        const isIn = list.includes(HALLPASS_PLUGIN.toLowerCase());
        if (isIn === wantInstalled) return true;
      } catch {
        /* keep polling; a transient RPC miss is not a verdict */
      }
    }
    return false;
  }

  async function handleInstall() {
    setTouched(true);
    if (!formValid || !accountAddress) return;
    const mod = await loadWalletModule();
    if (!mod) {
      setNotice({ kind: "bad", text: "The wallet module isn't ready yet, so nothing was submitted. Try again in a moment." });
      return;
    }
    setInstalling(true);
    setNotice(null);
    try {
      const res = await mod.installPlugin({
        account: accountAddress,
        plugin: HALLPASS_PLUGIN,
        policy: {
          sessionKey: sessionKey.trim(),
          perTxCapWei: perTxWei as string,
          windowCapWei: windowWei as string,
          windowSecs,
          expiry: Math.floor(Date.now() / 1000) + expirySecs,
          allowlist: allowlistAddrs,
        },
      });
      const tx = res.txHash || res.userOpHash || "";
      const confirmed = await waitForChainState(true);
      if (confirmed) {
        setInstallState("installed");
        setNotice({ kind: "ok", text: "Installed. The chain confirms the plugin is on your account.", tx });
      } else {
        /* Never claim installed without chain confirmation. */
        setNotice({
          kind: "bad",
          text: "Submitted, but the plugin isn't showing on-chain yet. Nothing is marked installed — refresh to re-check.",
          tx,
        });
        refreshFromChain();
      }
    } catch (e) {
      setNotice({ kind: "bad", text: `Install didn't go through: ${e instanceof Error ? e.message : "unknown error"}. Nothing was installed.` });
    } finally {
      setInstalling(false);
    }
  }

  async function handleUninstall() {
    if (!accountAddress) return;
    const mod = await loadWalletModule();
    if (!mod) {
      setNotice({ kind: "bad", text: "The wallet module isn't ready yet, so nothing was submitted. Try again in a moment." });
      setUninstallArmed(false);
      return;
    }
    setUninstalling(true);
    try {
      const res = await mod.uninstallPlugin({ account: accountAddress, plugin: HALLPASS_PLUGIN });
      const confirmed = await waitForChainState(false);
      if (confirmed) {
        setInstallState("not-installed");
        setNotice({ kind: "ok", text: "Removed. The chain confirms the plugin is off your account.", tx: res.txHash });
      } else {
        setNotice({ kind: "bad", text: "Submitted, but the plugin still shows on-chain. Nothing is marked removed — refresh to re-check.", tx: res.txHash });
        refreshFromChain();
      }
    } catch (e) {
      setNotice({ kind: "bad", text: `Removal didn't go through: ${e instanceof Error ? e.message : "unknown error"}. The plugin is still installed.` });
    } finally {
      setUninstalling(false);
      setUninstallArmed(false);
    }
  }

  const policyForm = (
    <div style={{ marginTop: 4, marginBottom: 8 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 12px", color: "#FFB224", letterSpacing: 1 }}>SET THE LIMITS</h3>
      <div style={{ display: "grid", gap: 14, maxWidth: 520 }}>
        <div>
          <p style={labelS}>Agent key address</p>
          <input value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} placeholder="0x…" style={inputStyle(touched && !!errs.sessionKey)} inputMode="text" autoComplete="off" />
          {touched && errs.sessionKey ? <p style={fieldErr}>{errs.sessionKey}</p>
            : <p style={helpS}>The key your agent will spend with. Add it on the Session keys screen if you don't have one yet.</p>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <p style={labelS}>Max per payment (USDC)</p>
            <input value={perTx} onChange={(e) => setPerTx(e.target.value)} inputMode="decimal" style={inputStyle(touched && !!errs.perTx)} />
            {touched && errs.perTx && <p style={fieldErr}>{errs.perTx}</p>}
          </div>
          <div>
            <p style={labelS}>Max per window (USDC)</p>
            <input value={windowCap} onChange={(e) => setWindowCap(e.target.value)} inputMode="decimal" style={inputStyle(touched && !!errs.windowCap)} />
            {touched && errs.windowCap && <p style={fieldErr}>{errs.windowCap}</p>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <p style={labelS}>Window length (hours)</p>
            <input value={windowHours} onChange={(e) => setWindowHours(e.target.value)} inputMode="numeric" style={inputStyle(touched && !!errs.windowHours)} />
            {touched && errs.windowHours ? <p style={fieldErr}>{errs.windowHours}</p>
              : <p style={helpS}>The spending total resets every window.</p>}
          </div>
          <div>
            <p style={labelS}>Key expires after (hours)</p>
            <input value={expiryHours} onChange={(e) => setExpiryHours(e.target.value)} inputMode="numeric" style={inputStyle(touched && !!errs.expiryHours)} />
            {touched && errs.expiryHours ? <p style={fieldErr}>{errs.expiryHours}</p>
              : <p style={helpS}>The key stops working automatically.</p>}
          </div>
        </div>
        <div>
          <p style={labelS}>Allowed addresses <span style={{ fontWeight: 400, color: "#CFC6B8" }}>(optional)</span></p>
          <input value={allowlist} onChange={(e) => setAllowlist(e.target.value)} placeholder="0x…, 0x… (comma-separated)" style={inputStyle(touched && !!errs.allowlist)} autoComplete="off" />
          {touched && errs.allowlist ? <p style={fieldErr}>{errs.allowlist}</p>
            : <p style={helpS}>Leave empty and the key can pay anyone — the caps still apply.</p>}
        </div>
      </div>
      {!touched && (
        <p style={{ ...helpS, marginTop: 12, maxWidth: "60ch" }}>
          {`In plain words: this key may spend at most $${perTx || "…"} per payment, $${windowCap || "…"} every ${windowHours || "…"} hours${allowlistAddrs.length ? `, only to ${allowlistAddrs.length} address${allowlistAddrs.length > 1 ? "es" : ""}` : ", to anyone"}, for the next ${expiryHours || "…"} hours.`}
        </p>
      )}
    </div>
  );

  const confirmUninstall = (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label="Confirm removal"
      style={{ marginTop: 18, border: "1px solid #7F1D1D", borderRadius: 10, padding: 16, background: "#1B1916", maxWidth: 560 }}
    >
      <p style={{ fontSize: 15, fontWeight: 700, margin: "0 0 8px", color: "#FFF9EF" }}>Remove this spending rule?</p>
      <p style={{ fontSize: 14, color: "#CFC6B8", margin: "0 0 14px", lineHeight: 1.6 }}>
        The on-chain limits come off your account. Your agent's key keeps working, but
        with no caps, no allowlist, and no expiry until you add a new rule.
      </p>
      <button onClick={() => setUninstallArmed(false)} style={{ fontSize: 15, fontWeight: 600, padding: "10px 22px", borderRadius: 10, minHeight: 44, background: "transparent", color: "#CFC6B8", border: "1px solid #4A443C", cursor: "pointer", marginRight: 10 }}>
        Keep it
      </button>
      <button onClick={handleUninstall} disabled={uninstalling} style={{ fontSize: 15, fontWeight: 700, padding: "10px 22px", borderRadius: 10, minHeight: 44, background: "#7F1D1D", color: "#FFF9EF", border: "none", cursor: uninstalling ? "wait" : "pointer" }}>
        {uninstalling ? "Removing…" : "Yes, remove"}
      </button>
    </div>
  );

  const livePlugin = PLUGINS[0];

  return (
    <div style={{ background: "#121110", minHeight: "100vh", color: "#FFF9EF", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 20px 80px" }}>
        <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2, color: "#CFC6B8", margin: "0 0 10px" }}>
          HALLPASS · MARKETPLACE
        </p>
        <h1 style={{ fontSize: 34, fontWeight: 900, margin: "0 0 8px", letterSpacing: 0.5, textTransform: "uppercase" }}>
          Spending rules for agent keys.
        </h1>
        <p style={{ fontSize: 16, color: "#CFC6B8", margin: "0 0 28px", maxWidth: "60ch", lineHeight: 1.6 }}>
          Install a rule on your smart account and your agent's key can only spend inside it. The account enforces it — not a server.
        </p>

        <div aria-live="polite">
          {notice && (
            <div
              style={{
                border: `1px solid ${notice.kind === "ok" ? "#FFB224" : "#7F1D1D"}`,
                borderRadius: 10,
                padding: 14,
                marginBottom: 20,
                fontSize: 15,
                lineHeight: 1.6,
                background: "#1B1916",
              }}
            >
              {notice.text}{" "}
              {notice.tx && (
                <a href={EXPLORER_TX(notice.tx)} target="_blank" rel="noreferrer" style={{ color: "#FFB224" }}>
                  View on the explorer
                </a>
              )}
            </div>
          )}
          {rpcError && (
            <div style={{ border: "1px solid #7F1D1D", borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 15, lineHeight: 1.6, background: "#1B1916" }}>
              Can't reach Arc right now ({rpcError}) Nothing below can be trusted until the connection is back — refresh to retry.
            </div>
          )}
        </div>

        {!accountAddress && <EmptyState />}

        {installState === "checking" && accountAddress && !rpcError ? (
          <SkeletonCard />
        ) : (
          <PolicyCard
            plugin={{ ...livePlugin, verification }}
            installState={accountAddress ? installState : "checking"}
            installDisabled={!!installDisabledReason || installing}
            installDisabledReason={installing ? undefined : installDisabledReason}
            installing={installing}
            uninstalling={uninstalling}
            uninstallArmed={uninstallArmed}
            confirmUninstall={confirmUninstall}
            policyForm={policyForm}
            onInstall={handleInstall}
            onUninstall={() => setUninstallArmed(true)}
            onCancelUninstall={() => setUninstallArmed(false)}
          />
        )}

        {PLUGINS.slice(1).map((p) => (
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
            onUninstall={() => {}}
            onCancelUninstall={() => {}}
          />
        ))}

        <p style={{ fontSize: 12.5, color: "#CFC6B8", marginTop: 28, lineHeight: 1.7, maxWidth: "60ch" }}>
          *Every state on this screen is read from Arc mainnet (chain 5042). If the network is unreachable, nothing here is shown as true.
          Installing or removing a rule is an on-chain action signed by the account owner — it costs a small amount of gas.
        </p>
      </div>
    </div>
  );
}
