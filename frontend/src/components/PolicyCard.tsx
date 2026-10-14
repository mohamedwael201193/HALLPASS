import React from "react";

/**
 * PolicyCard — one plugin in the Hallpass marketplace.
 *
 * Follows the design standard §2 module skeleton (7 slots, in order):
 *   label → contents list → fine-print asterisk → imperative how-to →
 *   name as heading → one-line tagline → bespoke visual.
 *
 * Presentational only: all chain truth and all wallet actions live in the
 * parent (Marketplace.tsx). This card never touches the network and never
 * fakes a state — every badge and every button state arrives as props.
 *
 * Identity tokens (design standard §9, HALLPASS):
 *   bg #121110 · paper text #FFF9EF · accent amber #FFB224 (status + CTA only).
 */

export type InstallState = "checking" | "installed" | "not-installed" | "coming-soon";

export interface PluginMeta {
  id: string;
  /** Slot 1 — small label, e.g. "PLUGIN · SESSION POLICY". */
  label: string;
  /** Slot 2 — contents list: plain-language "what this does" bullets. */
  enforces: string[];
  /** Slot 3 — asterisk-led fine print (caveats, verification status). */
  finePrint: string;
  /** Slot 4 — imperative how-to paragraph. */
  howTo: string;
  /** Slot 5 — product/feature name as heading. */
  name: string;
  /** Slot 6 — one-line tagline, sentence case, ends with a period. */
  tagline: string;
  /** Slot 7 — bespoke visual key, rendered by the card. */
  visual: "hallpass" | "caps" | "typeddata";
  /** Deployed plugin address on Arc mainnet (chain 5042). Omit for future plugins. */
  address?: string;
  /** keccak256(abi.encode(pluginManifest())) for the deployed build, if known. */
  manifestHash?: string;
  live: boolean;
}

export interface PolicyCardProps {
  plugin: PluginMeta;
  installState: InstallState;
  installDisabled: boolean;
  /** Exact plain-language reason shown while Install is disabled. Never omitted. */
  installDisabledReason?: string;
  uninstallDisabledReason?: string;
  installing: boolean;
  uninstalling: boolean;
  /** Inline policy form, rendered inside the live card only. */
  policyForm?: React.ReactNode;
  /** Inline destructive-confirm, rendered by the parent when uninstall is armed. */
  confirmUninstall?: React.ReactNode;
  uninstallArmed: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onCancelUninstall: () => void;
}

const INK = "#121110";
const PAPER = "#FFF9EF";
const PAPER_DIM = "#CFC6B8";
const AMBER = "#FFB224";
const CARD_BG = "#1B1916";
const CARD_EDGE = "#2E2A24";

/* Slot 7 — hand-made inline SVG. Stroke-only, transform/opacity animation only. */
function PluginVisual({ kind, dimmed }: { kind: PluginMeta["visual"]; dimmed: boolean }) {
  const stroke = dimmed ? "#6B6259" : AMBER;
  const ticket = (
    <g fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="20" width="104" height="64" rx="8" />
      <line x1="36" y1="20" x2="36" y2="84" strokeDasharray="5 5" />
      <path d="M50 44l8 8 16-18" />
      <circle cx="98" cy="34" r="3" />
    </g>
  );
  const caps = (
    <g fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="28" width="104" height="48" rx="8" />
      <line x1="60" y1="28" x2="60" y2="76" />
      <path d="M22 52h24M74 52h24" />
    </g>
  );
  const typed = (
    <g fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="20" y="14" width="80" height="76" rx="8" />
      <line x1="32" y1="32" x2="88" y2="32" />
      <line x1="32" y1="46" x2="88" y2="46" />
      <path d="M48 66l8 8 16-18" />
    </g>
  );
  return (
    <svg
      width="120"
      height="104"
      viewBox="0 0 120 104"
      role="img"
      aria-label={dimmed ? "Plugin illustration, coming soon" : "Plugin illustration"}
      style={{ opacity: dimmed ? 0.55 : 1 }}
    >
      {kind === "hallpass" ? ticket : kind === "caps" ? caps : typed}
    </svg>
  );
}

const cardStyle = (dimmed: boolean): React.CSSProperties => ({
  background: CARD_BG,
  border: `1px solid ${CARD_EDGE}`,
  borderRadius: 14,
  padding: 24,
  marginBottom: 20,
  color: PAPER,
  fontFamily: "system-ui, -apple-system, sans-serif",
  opacity: dimmed ? 0.75 : 1,
});

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 2,
  color: PAPER_DIM,
  margin: "0 0 12px",
};

const finePrintStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: PAPER_DIM,
  lineHeight: 1.6,
  margin: "0 0 14px",
};

function StatusWord({ state }: { state: InstallState }) {
  const map: Record<InstallState, { text: string; color: string }> = {
    installed: { text: "Installed", color: AMBER },
    "not-installed": { text: "Not installed", color: PAPER_DIM },
    "coming-soon": { text: "Coming soon", color: PAPER_DIM },
    checking: { text: "Checking…", color: PAPER_DIM },
  };
  const s = map[state];
  return (
    <span style={{ fontSize: 13, fontWeight: 700, color: s.color, marginLeft: 10 }}>
      {s.text}
    </span>
  );
}

export default function PolicyCard(props: PolicyCardProps) {
  const { plugin, installState } = props;
  const comingSoon = installState === "coming-soon" || !plugin.live;

  const primaryBtn: React.CSSProperties = {
    fontSize: 16,
    fontWeight: 800,
    padding: "12px 28px",
    borderRadius: 10,
    border: "none",
    minHeight: 48,
    background: props.installDisabled ? "#3A352E" : AMBER,
    color: props.installDisabled ? "#8A8177" : "#2A1A00",
    cursor: props.installDisabled ? "not-allowed" : props.installing ? "wait" : "pointer",
  };
  const dangerBtn: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    padding: "10px 22px",
    borderRadius: 10,
    minHeight: 44,
    background: "transparent",
    color: "#F87171",
    border: "1px solid #7F1D1D",
    cursor: props.uninstalling ? "wait" : "pointer",
  };
  const ghostBtn: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 600,
    padding: "10px 22px",
    borderRadius: 10,
    minHeight: 44,
    background: "transparent",
    color: PAPER_DIM,
    border: "1px solid #4A443C",
    cursor: "pointer",
    marginRight: 10,
  };

  return (
    <article
      style={cardStyle(comingSoon)}
      aria-label={plugin.name}
      data-testid={`plugin-card-${plugin.id}`}
    >
      {/* Slot 1 — label */}
      <p style={labelStyle}>
        {plugin.label}
        <StatusWord state={installState} />
      </p>

      {/* Slot 2 — contents list */}
      <ul style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 16, lineHeight: 1.6 }}>
        {plugin.enforces.map((line) => (
          <li key={line} style={{ marginBottom: 4 }}>{line}</li>
        ))}
      </ul>

      {/* Slot 3 — fine print */}
      <p style={finePrintStyle}>*{plugin.finePrint}</p>

      {/* Slot 4 — imperative how-to */}
      {!comingSoon && (
        <p style={{ fontSize: 15, lineHeight: 1.6, margin: "0 0 18px", maxWidth: "60ch" }}>
          {plugin.howTo}
        </p>
      )}

      {/* Slot 5 — name as heading */}
      <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, letterSpacing: 0.2 }}>
        {plugin.name}
      </h2>

      {/* Slot 6 — tagline */}
      <p style={{ margin: "0 0 18px", fontSize: 16, color: PAPER_DIM }}>{plugin.tagline}</p>

      {/* Slot 7 — bespoke visual */}
      <div style={{ marginBottom: 18 }}>
        <PluginVisual kind={plugin.visual} dimmed={comingSoon} />
      </div>

      {plugin.address && (
        <div style={{ fontSize: 13, color: PAPER_DIM, marginBottom: 16, lineHeight: 1.8 }}>
          <div>
            Contract{" "}
            <code style={{ color: PAPER, wordBreak: "break-all" }}>{plugin.address}</code>
          </div>
          <div>
            <a
              href={`https://repo.sourcify.dev/5042/${plugin.address}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: AMBER }}
            >
              View the source on Sourcify
            </a>
          </div>
          {plugin.manifestHash && (
            <div>
              Manifest hash{" "}
              <code style={{ color: PAPER, wordBreak: "break-all" }}>
                {plugin.manifestHash}
              </code>
            </div>
          )}
        </div>
      )}

      {comingSoon ? (
        <p style={{ fontSize: 15, color: PAPER_DIM, margin: 0, maxWidth: "60ch" }}>
          Not available yet. There is deliberately no install button here — nothing on
          this card can take your signature or your money.
        </p>
      ) : (
        <>
          {props.policyForm}
          {props.confirmUninstall && props.uninstallArmed ? (
            props.confirmUninstall
          ) : installState === "installed" ? (
            <div style={{ marginTop: 18 }}>
              <button style={dangerBtn} disabled={props.uninstalling} onClick={props.onUninstall}>
                {props.uninstalling ? "Removing…" : "Uninstall"}
              </button>
              {props.uninstallDisabledReason && (
                <p style={{ fontSize: 13, color: PAPER_DIM, marginTop: 8 }}>
                  {props.uninstallDisabledReason}
                </p>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 18 }}>
              <button
                style={primaryBtn}
                disabled={props.installDisabled || props.installing}
                onClick={props.onInstall}
                aria-describedby={`install-why-${plugin.id}`}
              >
                {props.installing ? (
                  <>
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        border: "2px solid #2A1A00",
                        borderTopColor: "transparent",
                        marginRight: 8,
                        verticalAlign: "-2px",
                        animation: "hp-spin 0.8s linear infinite",
                      }}
                    />
                    Installing…
                  </>
                ) : (
                  "Install"
                )}
              </button>
              {props.installDisabled && props.installDisabledReason && (
                <p
                  id={`install-why-${plugin.id}`}
                  style={{ fontSize: 14, color: AMBER, marginTop: 10, maxWidth: "60ch" }}
                >
                  {props.installDisabledReason}
                </p>
              )}
            </div>
          )}
        </>
      )}
      <style>{`@keyframes hp-spin{to{transform:rotate(360deg)}}`}</style>
    </article>
  );
}
