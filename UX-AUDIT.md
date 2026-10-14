# HALLPASS UX Audit — the founder's eyes

**Date:** 2026-10-14 · **Auditor:** Q4 · **Scope:** every rendered screen — landing + dashboard — plus every built-but-unmounted screen (they're part of the UX the founder will see the moment they're routed).
**Source of truth:** `hallpass-frontend-prompt.md` §§5, 6, 9 (dashboard laws, UX laws) + `hallpass-build-bible.md` §8.
**Verdict:** **8 blockers, 16 majors, 12 minors.** The 5-click stranger test fails at click 2 and cannot recover. The single largest structural finding: **the real landing page and two real dashboard screens exist but are not mounted** — visitors see placeholders while the actual product sits orphaned in `src/`.

---

## The 5-click stranger test (static walkthrough)

Intended path: landing → connect → see accounts → install plugin → set policy → read activity.

| # | Click / step | What actually happens | Result |
|---|--------------|----------------------|--------|
| 1 | Land on `/` | Renders `LandingShell`: a headline, one line of scaffold copy, a "Launch app" button. No wallet connect, no story, no proof. The *real* landing (`src/pages/Landing.tsx`, 11 sections) exists but is not routed. | ❌ Confusion: is this the product or a wireframe? |
| 2 | Click "Launch app" (or Nav "Connect wallet") | Lands on `/app` → "Connect" placeholder: *"Screen placeholder. The owning worker builds this as a real on-chain flow…"* There is **no connect button anywhere** — wallet provider wiring is explicitly deferred (main.tsx). | ❌ **Test ends here.** The stranger cannot proceed and is told to wait for "the owning worker." |
| 3 | "See accounts" → `/app/accounts` | Placeholder. | ❌ |
| 4 | "Install a plugin" → `/app/marketplace` | Placeholder. | ❌ |
| 5 | "Set a policy" → `/app/policy` | Placeholder — even though a full `PolicyEditor.tsx` exists unmounted. | ❌ |
| 6 | "Read activity" → `/app/activity` | Placeholder. | ❌ |

Even if the orphaned screens were mounted today, the test would still fail at click 2 (no wallet), click 4 (no marketplace screen exists at all), and click 5 (the editor's save is intentionally unwired and its "set up your first hall pass" link loops back to the placeholder — see B8).

---

## BLOCKERS (8)

### B1. The finished landing page is not mounted — `/` serves a placeholder
`src/App.tsx:42` routes `/` to `LandingShell`, while `src/pages/Landing.tsx` (Nav → Hero → Problem → Metaphor → HowItWorks → LiveProof → Features → Builders → Faq → Cta → Footer) is imported by nothing. Every landing-section worker's output is invisible. The founder's UX law #3 (one obvious connect button on the first screen) and prompt §5 (12 sections, live proof, wallet connect in nav) all fail at the root route.

### B2. Two finished dashboard screens are not mounted — routes serve placeholders
`src/pages/app/PolicyEditor.tsx` and `src/pages/app/SessionKeys.tsx` are real, carefully-built screens, but `src/App.tsx:46-60` routes `/app/policy` and `/app/accounts` (SessionKeys has no route at all) to `ScreenPlaceholder`. The placeholder copy is developer-facing (*"The owning worker builds this as a real on-chain flow — no mock data, no demo mode"*), which violates the founder's hard line: nothing demo, nothing mock, nothing placeholder-shaped in front of users. `src/App.tsx:64-72`.

### B3. The landing page cannot compile in this project (Next.js imports in a Vite app)
`src/components/landing/Nav.tsx:3`, `src/components/landing/Hero.tsx:4-7` import `next/link`, `next/image`, and `@/assets/hero.png`. The project is Vite (`package.json`, `vite.config.ts`); `next` is not a dependency and there is no `@` alias. `npm run build` runs `tsc --noEmit` over all of `src/**`, so **the build fails on these files today** — mounting the landing (B1) would require porting them first. This is the hidden dependency behind B1.

### B4. There is no wallet connection anywhere — UX law #3 violated
Nav's "Connect wallet" button (`src/components/landing/Nav.tsx:44-50`) is an `<a href="/app">` — it does not connect a wallet, it routes to a placeholder telling you to connect your wallet. `src/main.tsx:7-10` explicitly defers the Reown/wagmi provider to worker F9. The 5-click test cannot pass click 2 until a real connect button exists on the landing nav *and* on `/app`.

### B5. Hero shows "0" for live stats — a false claim, contradicting the proven record
`src/components/landing/Hero.tsx:27` fetches `/api/stats`, which does not exist in this static SPA (`vercel.json` only rewrites to `index.html`) — it will 404. The catch handler sets all stats to **0** and prints *"Live feed unavailable — showing zeros, not estimates"* (`Hero.tsx:39-45, 175-181`). Zero is not honest here: the bible documents a real on-chain install. Prompt §5 is explicit: *"if the indexer isn't live yet, show the proven counts from §10 with 'mainnet' labels — never fake a number."* Big amber "0 plugins installed" is a fake number and directly contradicts the footer's *"Nothing here is a demo, mock, or placeholder."*

### B6. SessionKeys' data source does not exist — the screen always renders an error
`src/pages/app/SessionKeys.tsx:254` fetches `${API_BASE}/api/accounts/${account}/policies`. There is no backend or indexer in this repo (the grep for an API implementation returns nothing; `VITE_API_BASE_URL` is optional). Every visit → `ErrorState` → *"The key list comes from the indexer, and it didn't answer."* The error copy is honest, but the screen is permanently non-functional and the message will confuse users ("what indexer?"). The indexer (or a direct RPC read path, per bible §8: "every screen reads from chain") is a hard dependency for this screen.

### B7. The revoke button can never become enabled — dynamic-import probing of phantom modules
`src/pages/app/SessionKeys.tsx:236-251` tries to `import()` four candidate paths (`../../lib/sessionKeyOps`, `../lib/revoke`, …) hoping F9's module "lands." Until then, Revoke is disabled with *"Revoking is still being wired to a real on-chain transaction — it stays disabled until the wallet module lands."* — developer-facing copy leaking to users. Worse, the mechanism is fragile: it silently swallows all import failures and the disabled state has no timeout or owner override. A control that can never go live is a disabled button with an excuse, not a reason.

### B8. Circular dead end: "Set up your first hall pass" loops back to where it came from
`SessionKeys.tsx:346` empty state → `/app/policy?account=<addr>`. But `PolicyEditor` requires a `sessionKeyAddress` prop (it reads no `?account=` param) → renders *"No session key selected"* → *"Go to my accounts"* (`PolicyEditor.tsx:278-288`) → back to the accounts screen → back to the empty state. Even fully mounted and wired, the first-run flow is an infinite loop with no key-generation step anywhere (generate/rotate flows don't exist in the repo).

---

## MAJORS (16)

### M1. "Connect wallet" is a mislabeled link — it connects nothing
`Nav.tsx:44-50`. The comment admits it's a placeholder. The user clicks a button labeled "Connect wallet" and gets a placeholder page that tells them to connect their wallet. Rename to "Launch app" (there are already two) or remove until the real AppKit button lands. (Related to B4; kept separate because the *label* is its own lie.)

### M2. The final CTA omits the single most important action
`src/components/landing/Cta.tsx` — the big amber closing section offers "Verify the live proof" and "Read the FAQ" but **no "Launch app" button**. The page's conversion goal disappears at the moment of highest intent. Add the primary CTA alongside the proof links.

### M3. PolicyEditor is missing the spending-window controls — a core policy dimension
Prompt §6(d) and bible §8.4 require cap, **window cap + window length**, expiry, destinations. `PolicyEditor.tsx` has per-payment cap, expiry, allowlist — no window cap, no window-length input. Meanwhile `SessionKeys.tsx` *displays* window caps and window spend the user can never edit. The live preview sentence never mentions the window. This is a functional hole in the product's defining feature.

### M4. Features section uses unicode glyphs instead of hand-crafted SVG icons
`src/components/landing/Features.tsx` — `icon: "⚖"`, `"◔"`, `"⏱"`, `"☰"`, `"✒"`, `"✕"`, `"◇"`. Prompt §3: *"hand-craft every icon… Consistent 2px-style stroke language"* and *"NEVER placeholder boxes."* (It also contradicts `EmptyState.tsx`'s own "emoji-free" guidance.) The rest of the landing uses proper custom SVGs — these seven glyphs look like placeholders by comparison.

### M5. Fixed nav has no background — unreadable over content on scroll
`Nav.tsx:14` — `fixed inset-x-0 top-0 z-50` with no `bg-*` or backdrop blur. Scroll one viewport and the nav text sits on top of imagery/type. Add `bg-[#121110]/80 backdrop-blur` (or solid on scroll).

### M6. Dashboard header nav will crowd/overflow on mobile
`src/App.tsx:76-92` — five text links + logo in a single `flex` row with `gap-5`, no wrapping, no hamburger, no horizontal scroll. On a 360px phone, "Connect Accounts Marketplace Policy Activity" overflows. Add `flex-wrap`, `overflow-x-auto`, or collapse to a menu. (UX law #6.)

### M7. `Landing.tsx` overrides the brand typography for the whole page
`src/pages/Landing.tsx:19-24` sets `fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto"` on `<main>` — wiping out Inter + Space Grotesk (the prompt §2 font philosophy, loaded in `index.html`). The landing would render in system fonts, not the brand pair.

### M8. SessionKeys uses `window.location.href` — full-page reloads kill wallet state
`SessionKeys.tsx:336` and `:346`. In a wagmi/Reown SPA, `window.location.href = '/app/accounts'` tears down the session. Use `useNavigate()` (already imported in the file) like `PolicyEditor` does.

### M9. No gated progression in the dashboard — all five screens exposed to strangers
`App.tsx:44-60` shows Connect / Accounts / Marketplace / Policy / Activity to everyone, in no enforced order, with no stepper or "you are here" state. A first-time unconnected user can click straight into Policy. Bible §8.1 requires: next action always visible ("Create a smart account" / "Select an account"), Arc 5042 network badge, wrong-chain switch prompt. None of this is scaffolded. When the screens land, ungated nav will strand users on screens that can't function.

### M10. FAQ wallet answer is incoherent jargon
`src/components/landing/Faq.tsx` — *"The factory allowlist path is real, so we use the direct-proxy route with identical code paths."* This sentence contradicts itself and means nothing to a non-builder. Proposed: *"Two ways: if we create your smart account, the plugin is installed from the start. If you already have a Circle smart account — even a multisig — we install it afterwards with one transaction you sign."*

### M11. Two Features bodies are jargon-heavy (UX law #2: plain words, zero jargon)
- *"Typed-data coverage (EIP-712 / EIP-3009)"* — *"Session-key typed data is pre-authorized per-digest through the account and verified via the plugin's isValidSignature gate — the x402 facilitator settlement path, closed on-chain."* (`Features.tsx`)
- *"ERC-6900 native"* — *"the same manifest/manifest-hash machinery Circle's own plugins ship on."* (`Features.tsx`)
Proposed: *"Typed-data coverage — approvals your agent signs (like payment authorizations) are checked against the same caps before they count. Nothing slips around the pass."* / *"Built in, not bolted on — the policy lives inside your Circle smart account itself, so it can't be bypassed."*

### M12. Builders section references an internal document users can't access
`src/components/landing/Builders.tsx` — *"Full install flows and contract specs ship in the HALLPASS build bible (the project's technical reference)."* Users have no build bible. Either link real docs or cut the sentence — it's a nowhere-reference.

### M13. Footer honesty claim overreaches current reality
`src/components/landing/Footer.tsx` — *"Nothing here is a demo, mock, or placeholder."* True of the hashes/addresses; false of the page (fake "Connect wallet", zeroed stats, B1/B2 placeholders one route away). Either the page earns the sentence or the sentence goes.

### M14. FAQ revert-string answers lead with machine language
`Faq.tsx` — *"reverted PerTxCapExceeded(0.05, 0.01)"* and *"reverts SessionRevoked()"* appear in landing answers without a human sentence first. Dashboard law (prompt §6): human sentence FIRST, technical detail collapsible. On the landing: *"the payment bounced back with the reason 'over your per-payment cap' — the money never moved."*

### M15. Disabled-button law has a loophole: reason is optional
`src/components/EmptyState.tsx:21-22` — `disabledReason` is optional while `actionDisabled` is not. A future caller can render a disabled button with **no explanation**, violating the law this component was built to enforce. Make `disabledReason` required whenever `actionDisabled` is true.

### M16. Hero stats squeeze on small phones
`Hero.tsx:157-172` — `grid-cols-3` with `text-4xl` numbers and wide-tracked uppercase labels ("plugins installed") at 360px: labels wrap mid-word and columns collide. Switch to `grid-cols-3 gap-3` with `text-2xl` on mobile, or stack.

---

## MINORS (12)

1. **Token drift on "denied" red.** `index.css` defines `--hp-muted-red: #b0523c`, but `Problem.tsx:110`, `HowItWorks.tsx` icons, and `LiveProof.tsx` hardcode `#FF5C5C` / `#E0655F`; `ErrorState.tsx` and `SessionKeys.tsx` use Tailwind `red-400/300/700`. Three different reds for one semantic. (`index.css`, `ErrorState.tsx`, `SessionKeys.tsx`, `Problem.tsx`, `HowItWorks.tsx`)
2. **Eyebrow color muddies the amber/red language.** `Problem.tsx:110` renders the neutral eyebrows "Option one / Option two" in red (`#FF5C5C/80`) — red should mean *blocked*, per the brand system. Use amber or neutral.
3. **Metaphor detail line uses "allowlist".** `Metaphor.tsx` — *"Destination allowlist — or caps-only mode, your call."* → *"A list of approved addresses — or no list at all; the caps still apply."*
4. **PolicyEditor "unix seconds" hint.** `PolicyEditor.tsx` — *"Stored on-chain as 1,790,123,456 (unix seconds)."* → *"That's how the blockchain records it — Friday, Oct 16, 2026, 2:00 PM."* (The formatted date is already computed; lead with it.)
5. **LiveProof card label jargon.** `LiveProof.tsx` — *"Owner revokeSession() — status 1"* → *"Owner revoked the pass — confirmed on-chain."*
6. **404 copy is cute, not plain.** `App.tsx` — *"Head back where things are real."* → *"Back to the homepage."*
7. **Missing social/meta tags.** `index.html` — no `og:title/description/image`, no `theme-color`. First impression on shares is a blank card.
8. **Banner dismiss uses float.** `SessionKeys.tsx` revoked banner — `float-right` ✕ can overlap text on narrow screens; use flex layout.
9. **`"use client"` directives in a Vite codebase.** `Problem.tsx`, `Metaphor.tsx`, `HowItWorks.tsx`, `Nav.tsx`, `Hero.tsx` — Next.js noise; harmless but signals the port was never finished (see B3).
10. **`import.meta as any`.** `SessionKeys.tsx` — type it (`import.meta.env.VITE_API_BASE_URL`) instead of casting.
11. **Anchor sections hide under the fixed nav.** Nav links (`#how-it-works`, `#live-proof`, `#faq`) will scroll targets under the fixed header — add `scroll-margin-top` to sections.
12. **"Copied ✓" uses a text checkmark** (`PolicyEditor.tsx`) — fine, but inconsistent with the SVG icon language elsewhere; trivial.

---

## What's actually good (so the builders know what to keep)

- `PolicyEditor.tsx` is the strongest screen in the repo: live plain-words preview, inline validation in human language, exact-values collapsible, Save disabled **with the reason shown inline** (the law, honored), old-policy-stays-in-force messaging, real explorer link on success. Port this pattern everywhere.
- `EmptyState.tsx` / `ErrorState.tsx` are excellent primitives — human sentence first, technical detail collapsed, next action named. (Just close the M15 loophole.)
- `LiveProof.tsx` is exemplary honesty engineering: real hashes, real explorer links, disclosed bounds ("userOps were self-relayed"), nothing invented.
- `SessionKeys.tsx` revoke confirm dialog is plain-words and correct ("This can't be undone; … you'll need a new key").
- Landing visual system (custom SVG art, amber-on-charcoal, motion language) is coherent and premium.

## Recommended fix order for the parent orchestrator

1. **B3 → B1 → B2**: port landing components off Next.js imports (or switch the project to Next.js — a project-level decision), then mount `pages/Landing.tsx` at `/` and the app screens in `App.tsx`. Everything else is moot until the built UI is reachable and the build passes.
2. **B4**: wire the real Reown AppKit provider (F9) — unblocks the entire 5-click test.
3. **B5**: replace zeroed hero stats with the proven §10 counts + "mainnet" labels (one-line change, high trust impact).
4. **M2, M5, M7, M6**: final-CTA button, nav background, font override, mobile nav — cheap, high-visibility.
5. **B6, B7, B8, M3**: indexer/RPC data path, real revoke wiring, break the policy-loop, add window-cap controls — the dashboard becomes a real product.
6. Copy pass (M10–M14, minors 2–6) — owned by the polish worker, not this auditor.

**Blocker count: 8.** No edits were made to the repo during this audit.
