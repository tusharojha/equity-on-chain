# EquityOnChain — 6-Month Dedicated Plan on BNBChain

> **Project:** EquityOnChain (EOC)
> **Website:** https://equity-on-chain.vercel.app
> **Repository:** https://github.com/tusharojha/equity-on-chain
> **Network:** Binance Smart Chain (BSC Testnet live — Chain 97)
> **Team Lead:** Tushar Ojha · tusharojha2001@gmail.com

---

## Executive Summary

EquityOnChain (EOC) is a fully on-chain equity protocol that lets any company tokenise its shares in a single transaction and gives investors a liquid, regulated-feeling market from day one — powered entirely by BSC.

The protocol brings **real-world equity market mechanics** (circuit breakers, KYC gates, ownership caps, hold-duration fee tiers, LP rewards) to the blockchain without sacrificing permissionlessness or composability. Today, $109 trillion in global equity value sits behind gatekeepers — IPO underwriters, SEBI compliance lawyers, VC term sheets. EOC removes every one of those gatekeepers while keeping the investor protections that make equity markets trustworthy.

We have chosen BNBChain as our **permanent home** because of its 3-second finality, near-zero gas costs, 100M+ active wallets, and the alignment between BSC's retail-first philosophy and EOC's mission of democratising capital markets.

---

## Current State (Pre-Plan Baseline)

| Component | Status |
|-----------|--------|
| Smart contracts (EquityToken, EquityExchange, EquityFactory, KYCRegistry) | ✅ Deployed on BSC Testnet |
| AMM with circuit breakers, fee tiers, LP rewards | ✅ Live |
| Next.js 15 frontend (trading, LP, portfolio, marketplace) | ✅ Live on Vercel |
| AI-generated company profiles | ✅ Live |
| Foundry test suite | ✅ Passing |
| Security audit | ⬜ Planned |
| BSC Mainnet deployment | ⬜ Planned |
| Governance / DAO | ⬜ Planned |
| Dividend mechanism | ⬜ Planned |

---

## 6-Month Roadmap

### Month 1 — Harden & Audit (March 2026)

**Goal:** Make the protocol production-safe and community-trusted.

**Deliverables:**
- [ ] Commission and complete a third-party smart contract security audit (targeting firms active in the BSC ecosystem)
- [ ] Resolve all audit findings; publish the full audit report publicly in the repository
- [ ] Expand the Foundry test suite to ≥95% branch coverage — edge cases for circuit breaker windows, LP rounding, and ownership cap interaction
- [ ] Fuzz testing via `forge fuzz` for AMM math, fee calculation and hold-record accounting
- [ ] Formal documentation of all upgrade paths and emergency pause mechanisms
- [ ] Deploy a dedicated BSC Testnet environment for community testing with a faucet + guided onboarding

**Success metric:** Audit completed, zero critical/high findings unresolved, test coverage ≥95%.

---

### Month 2 — BSC Mainnet Launch (April 2026)

**Goal:** Go live on BSC Mainnet with real companies and real capital.

**Deliverables:**
- [ ] Deploy KYCRegistry, EquityExchange, EquityFactory to **BSC Mainnet**
- [ ] Onboard 3–5 founding companies to list on EOC at launch (pre-sourced from startup communities — targeting Indian, Southeast Asian and African founders who face the highest IPO barriers)
- [ ] Each listing includes: founder AMA, published company profile, verified on-chain KYC for initial investors
- [ ] Launch a **seed liquidity programme** — commit protocol-owned BNB to bootstrap initial pool depth for each founding listing
- [ ] Frontend update: mainnet/testnet network switcher, real-time BSCScan transaction links
- [ ] Public launch announcement on Twitter/X, BNBChain forum and relevant Discord communities

**Success metric:** ≥3 companies live on mainnet, ≥50 unique investor wallets, ≥5 BNB TVL across all pools.

---

### Month 3 — Liquidity & Ecosystem Growth (May 2026)

**Goal:** Build sustainable liquidity depth and attract LP capital.

**Deliverables:**
- [ ] **LP Incentive Programme:** Launch a time-limited BNB rewards programme for early LPs — funded by protocol fee revenue — to bootstrap deeper pools
- [ ] **Referral mechanism (on-chain):** Founders can share a referral link; the smart contract tracks and attributes early investor wallets to referrers; referrers earn a share of protocol fees from their referred wallets
- [ ] **Analytics dashboard** integrated into the frontend: TVL per pool, 24h volume, fee APY for LPs, circuit breaker event history
- [ ] **BNBChain ecosystem integrations:** Apply to be listed on BNB Chain DApp catalogue; pursue integration with BSC-native wallets (Trust Wallet, Binance Web3 Wallet)
- [ ] Community: launch Telegram + Discord with founder and investor channels

**Success metric:** ≥20 BNB TVL across all pools, ≥5 active LP positions per leading token, ≥200 unique wallets.

---

### Month 4 — Mobile Experience & Accessibility (June 2026)

**Goal:** Remove the mobile friction that shuts out the majority of retail investors in our target markets (India, SE Asia, Africa).

**Deliverables:**
- [ ] **Mobile-first frontend redesign:** Rebuild key flows (browse companies, buy/sell, add liquidity) for sub-400px screens with thumb-friendly tap targets and progressive disclosure
- [ ] **WalletConnect v2 deep integration:** One-tap connect from Trust Wallet, MetaMask Mobile, Binance Web3 Wallet with session persistence
- [ ] **Push notifications (via PUSH Protocol or equivalent):** Alert investors when circuit breakers trip on tokens they hold, when their LP rewards exceed a threshold, or when a company they follow lists
- [ ] **PWA (Progressive Web App):** Install-to-homescreen experience for users without App Store access
- [ ] **Localisation framework:** English, Hindi, Bahasa Indonesia, Portuguese (BR) — targeting the four largest underserved retail investor markets
- [ ] Accessibility audit (WCAG 2.1 AA compliance)

**Success metric:** Lighthouse mobile score ≥90, ≥40% of active sessions from mobile wallets.

---

### Month 5 — Governance & Dividends (July 2026)

**Goal:** Give token holders real economic rights and a voice in protocol evolution.

**Deliverables:**
- [ ] **On-chain governance:** Implement `EquityGovernor` — equity token holders vote on company proposals (board resolutions, capital raises, strategy pivots). Voting power proportional to holdings with a 24h timelock before enactment.
- [ ] **Proposal system:** Founders can submit proposals on-chain; investors vote; passed proposals are executed automatically if executable, or emitted as binding events if off-chain.
- [ ] **Dividend distribution mechanism:** Founders can deposit BNB/stablecoins into their token's dividend pool; the contract distributes pro-rata to all token holders based on their balance at a snapshot block.
- [ ] **Dividend claim flow in frontend:** Investors see unclaimed dividends on the token detail page and in their portfolio; one-click claim.
- [ ] **Protocol governance (DAO):** Transfer EquityExchange ownership to a multi-sig controlled by community-elected guardians; protocol parameter changes (listing fee, fee splits) require governance vote.

**Success metric:** ≥1 dividend distributed on-chain, ≥2 company governance votes cast, DAO multi-sig live.

---

### Month 6 — Scale, Partnerships & Sustainability (August 2026)

**Goal:** Establish EOC as the canonical on-chain equity layer for BSC — with institutional-grade features and a self-sustaining flywheel.

**Deliverables:**
- [ ] **Institutional LP support:** Enable multi-sig wallets and smart contract accounts as LP providers; remove EOA-only assumptions from the LP accounting code
- [ ] **ZK-KYC integration:** Partner with a privacy-preserving identity provider (e.g., Polygon ID, zkPass, or BNBChain-native solution) so investors can prove KYC compliance without revealing personal data on-chain
- [ ] **Secondary market tooling:** Public REST + WebSocket API for EOC pool data, trade history and circuit breaker events — enabling third-party aggregators (CoinGecko, DeFiLlama, DEX Screener) to index EOC pools
- [ ] **Incubator partnership:** Partner with ≥1 BSC-ecosystem startup accelerator to become their preferred equity tokenisation layer; commit to co-marketing and technical integration support
- [ ] **Sustainability milestone:** Protocol fee revenue (20% of sell fees across all pools) should exceed infrastructure + operational costs — demonstrated via public treasury dashboard
- [ ] **Public developer SDK:** `@equityonchain/sdk` npm package wrapping all contract interactions so external teams can build on top of EOC without reading the ABI directly

**Success metric:** ≥10 companies live, ≥500 unique investor wallets, ≥50 BNB TVL, EOC indexed on ≥1 major DeFi aggregator, protocol revenue ≥ costs.

---

## 6-Month Milestone Summary

| Month | Theme | Key Milestone |
|-------|-------|---------------|
| 1 | Harden & Audit | Security audit complete, ≥95% test coverage |
| 2 | Mainnet Launch | ≥3 companies live, ≥50 investor wallets |
| 3 | Liquidity Growth | ≥20 BNB TVL, LP incentive programme live |
| 4 | Mobile Access | Mobile score ≥90, ≥40% mobile sessions |
| 5 | Governance & Dividends | First dividend distributed, DAO multi-sig live |
| 6 | Scale & Sustainability | ≥10 companies, ≥500 wallets, protocol self-sustaining |

---

## Why BNBChain — and Only BNBChain

We are not chain-agnostic. EOC is built specifically for BSC and we intend to keep it that way.

- **3-second blocks** make trading feel instant — critical for retail adoption
- **Sub-cent gas** means a founder in Nigeria or rural India can list a company for the cost of a text message
- **Native BNB** as the base currency aligns with the largest retail DeFi userbase in the world
- **100M+ active BSC wallets** is the distribution channel no other chain can match
- **Trust Wallet + Binance Web3 Wallet** puts EOC one tap away from hundreds of millions of users
- **BNBChain builder ecosystem** — grants, hackathons, accelerator programmes — is the community we want to grow with

Every architectural decision (block-time constants, AMM base currency, gas optimisations) is calibrated for BSC. There is no Ethereum or other chain deployment planned. BSC is the chain.

---

## Team

| Name | Role |
|------|------|
| Tushar Ojha | Protocol design, Solidity contracts, full-stack frontend |

*Currently a solo project open to co-founders, contributors and ecosystem partners.*

---

## Open Source Commitment

All protocol code is MIT-licensed and publicly available at:
**https://github.com/tusharojha/equity-on-chain**

The protocol is non-custodial. EOC never holds user funds. All logic executes in audited, immutable smart contracts on BSC.
