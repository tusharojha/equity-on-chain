<div align="center">

<img src="frontend/public/icon.svg" width="80" height="80" alt="EquityOnChain" />

# EquityOnChain

**Decentralised equity markets for every company, not just the chosen few.**

[![Live on BSC Testnet](https://img.shields.io/badge/BSC_Testnet-Live-brightgreen?logo=binance&logoColor=white)](https://testnet.bscscan.com)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636?logo=solidity)](https://soliditylang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=nextdotjs)](https://nextjs.org)
[![Foundry](https://img.shields.io/badge/Foundry-tested-orange)](https://book.getfoundry.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

[**Live App →**](https://equity-on-chain.vercel.app) · [Technical Docs →](TECHNICAL.md) · [Frontend Guide →](FRONTEND.md)

</div>

---

## The Problem

The global equity market is worth **over $109 trillion** — yet access to it is reserved for a privileged few.

A founder who wants to raise capital today faces a brutal gauntlet:

| Path | Cost | Minimum raise | Who gets access |
|------|------|--------------|-----------------|
| Traditional IPO | 3–7% underwriting + $500K+ legal/audit | $50M+ | Fortune 500 |
| SEBI SME Exchange (BSE SME / NSE Emerge) | ₹50L+ compliance costs | ₹1 crore | ~1,500 companies total |
| VC / Angel funding | 20–40% equity dilution + control loss | $250K+ | <0.1% of applicants |
| Private equity | Opaque, illiquid, 7–10 year lock-in | $5M+ | Institutional only |

India has **63+ million registered businesses**. Fewer than **5,500** are listed on public exchanges. The other 99.99% either bootstrap indefinitely, hand over control to VCs, or never scale.

The investors lose too. Retail investors can only participate in a company's growth **after** the most value-accretive early phase has already been captured by institutions. By the time a company IPOs, the 100x has already happened — in a private round no ordinary person could access.

---

## The Gap Nobody Has Filled

Existing "solutions" each solve half the problem:

**Equity crowdfunding platforms** (AngelList, Seedrs, Wefunder)
- ✅ Open to more companies
- ❌ Still illiquid — you can't sell your stake easily
- ❌ Centralised custodians hold your shares
- ❌ No price discovery until an exit event

**Traditional DeFi tokens**
- ✅ Liquid 24/7
- ❌ No real-world equity backing
- ❌ No investor protections (ownership limits, KYC)
- ❌ Unlimited minting and burning destroys value

**Security Token Offerings (STOs)**
- ✅ Legal equity backing
- ❌ Massive compliance overhead (still ~$200K to launch)
- ❌ Trading happens on centralised venues with limited hours
- ❌ Retail locked out in most jurisdictions

**None of them combine**: real company equity + permissionless liquidity + investor protections + zero gatekeepers + global access.

---

## The Solution: EquityOnChain

EquityOnChain is a **fully on-chain equity protocol** that lets any founder tokenise their company in one transaction and gives investors a liquid, regulated-feeling market from day one.

```
Founder deploys → Investors trade → LPs earn fees → Everyone benefits
```

### What makes it different

| Feature | Traditional Market | DeFi Tokens | EquityOnChain |
|---------|-------------------|-------------|---------------|
| Listing cost | $200K–$2M | ~$0 | ~$0 |
| Listing time | 6–18 months | Minutes | Minutes |
| Trading hours | 9am–4pm weekdays | 24/7 | 24/7 |
| Liquidity | Order book (can dry up) | AMM (always liquid) | AMM (always liquid) |
| Circuit breakers | Yes (exchange-level) | No | Yes (per-token) |
| KYC compliance | Mandatory | None | Optional per token |
| Ownership caps | Regulatory | None | Configurable per token |
| Short-term sell tax | Stamp duty | None | 0.45% (vs 0.02% long-term) |
| LP rewards | Market makers (institutions) | Yes | Yes — 80% of all sell fees |
| Price discovery | Open market | AMM | AMM |

---

## How It Works

### Three Roles, One Protocol

```
┌─────────────────────────────────────────────────────────────────────┐
│  FOUNDER                                                            │
│  Deploy equity token → configure rules → seed liquidity pool       │
│  Raises capital transparently. Retains chosen % as founder stake.  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ lists on
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  EquityExchange (AMM)                                               │
│  Constant-product x·y=k pool. No order books. Always liquid.       │
│  Circuit breakers halt trading on extreme moves (stock-mkt style). │
│  Long-term holders pay 22× less in fees than short-term sellers.   │
└───────┬──────────────────────────────────────┬───────────────────── ┘
        │ trade                                │ provide / remove liquidity
        ▼                                      ▼
┌────────────────────┐              ┌────────────────────────────┐
│  INVESTOR           │              │  LIQUIDITY PROVIDER (LP)   │
│  Buy/sell 24/7      │              │  Deposit BNB + tokens      │
│  No minimums        │              │  Earn 80% of all sell fees │
│  Global access      │              │  Withdraw proportionally   │
└────────────────────┘              └────────────────────────────┘
```

### Flow A — Founder Lists a Company

1. Connect wallet → go to **[/list](/list)**
2. Fill in: company name, ticker, max supply, pool token allocation, founder allocation, initial BNB liquidity
3. Configure trading rules: circuit breaker thresholds, KYC requirement, ownership cap
4. Send one transaction → `EquityFactory.create()` atomically:
   - Deploys `EquityToken`
   - Mints founder allocation directly to wallet
   - Seeds the liquidity pool with tokens + BNB
   - Lists on `EquityExchange`
   - Transfers token ownership to founder
5. Your company is live and tradeable in ~3 seconds (one BSC block)

**Cost:** Gas only (~0.002 BNB on testnet). No underwriters. No lawyers. No waiting.

### Flow B — Investor Buys Equity

1. Connect wallet → browse **[/companies](/companies)**
2. Filter by industry, compliance type, pool size, trading status
3. Click a token → review price, pool depth, circuit breaker status, fee tier
4. Enter BNB amount → see tokens out + slippage + fee breakdown
5. Click **Buy** → `EquityExchange.buyTokens()` executes at AMM price
6. **Zero buy fee.** Tokens appear in portfolio instantly.

> Long-term investors: hold your tokens for 6+ months and your sell fee drops from **0.45% → 0.02%** automatically.

### Flow C — Investor Sells

1. Open token page → enter token amount to sell
2. See exact BNB received after fee (computed client-side from pool reserves)
3. Approve token spend (once) → click **Sell**
4. Fee split: 80% → liquidity providers, 20% → protocol treasury

### Flow D — Liquidity Provider

1. Open token page → **Liquidity** tab
2. Enter BNB amount → UI computes required token amount to maintain pool ratio
3. Click **Add Liquidity** → `EquityExchange.addLiquidity()`
4. Receive LP shares proportional to your contribution
5. Earn 80% of every sell fee as BNB — accumulates in pool until you withdraw
6. Withdraw anytime: **Remove Liquidity** → burn LP shares → receive BNB + tokens

---

## Investor Protections Built Into the Protocol

EquityOnChain is not just "DeFi tokens for companies". It borrows the strongest protections from regulated equity markets and enforces them **at the smart contract level** — not by policy.

### Circuit Breakers
Modelled after NYSE Rule 48 and NSE/BSE index circuit limits. Each token has configurable upper/lower price-deviation thresholds for a rolling 24-hour window. When breached, trading halts for a configurable period. After the halt expires, the reference price resets to the current pool price — so protection resumes immediately rather than waiting for a new calendar day.

### KYC Gate (Optional)
Companies can require investor verification before tokens can be received. The KYC provider is pluggable — use the built-in whitelist, a third-party oracle, or your own off-chain bridge. The check lives at the **token level**, so it applies regardless of which exchange handles the trade.

### Ownership Caps
Prevent whale accumulation. Founders can set a max percentage of total supply any single wallet can hold (e.g., 10%). Scales proportionally if new tokens are minted.

### Non-Transferable Outside Exchange
Equity tokens cannot be peer-to-peer transferred. Every movement must go through a whitelisted exchange. This prevents unregulated OTC trades that bypass KYC, circuit breakers, and fee accounting.

### Non-Burnable Supply
Token supply cannot be reduced. `burn()` and `burnFrom()` are unconditionally reverted. The `maxSupply` is set immutably at deploy time — even the founder cannot inflate or deflate the cap.

### Hold-Duration Fee Tiers
Discourages short-term speculation. The longer you hold, the less you pay to sell:
- **Short-term** (< 6 months): 0.45% sell fee
- **Long-term** (≥ 6 months): 0.02% sell fee

The protocol tracks a weighted-average acquisition block per holder to calculate this fairly across multiple buy tranches.

---

## Deployed Contracts — BSC Testnet (Chain 97)

> Live deployment. Interact via the app or call directly on [BSCScan Testnet](https://testnet.bscscan.com).

| Contract | Address | Explorer |
|----------|---------|---------|
| **KYCRegistry** | `0x7199Ab4BD12EaaB852B1BeDBAd364dFD2e38a1e7` | [View on BSCScan ↗](https://testnet.bscscan.com/address/0x7199Ab4BD12EaaB852B1BeDBAd364dFD2e38a1e7) |
| **EquityExchange** | `0x34740D0bE3996A08AeC9A0d33A26Ae9cA21028cF` | [View on BSCScan ↗](https://testnet.bscscan.com/address/0x34740D0bE3996A08AeC9A0d33A26Ae9cA21028cF) |
| **EquityFactory** | `0xEA71916C6287991A1045F32E13137fc16EF91149` | [View on BSCScan ↗](https://testnet.bscscan.com/address/0xEA71916C6287991A1045F32E13137fc16EF91149) |

**Network:** Binance Smart Chain Testnet · Chain ID `97` · Native currency: tBNB

Get testnet BNB from the [BSC Faucet](https://testnet.bnbchain.org/faucet-smart).

---

## Why BSC?

| Criterion | Reason |
|-----------|--------|
| **~3s block time** | Near-instant trade confirmation |
| **Sub-cent gas fees** | Listing a company costs ~$0.01 |
| **Huge retail userbase** | 100M+ active BSC wallets |
| **Native BNB** | No WBNB wrapping — simpler, cheaper |
| **EVM compatible** | Full Solidity / Foundry / wagmi stack |

---

## Repository Structure

```
EquityOnChain/
├── src/
│   ├── EquityToken.sol        # Per-company ERC-20 with compliance
│   ├── EquityExchange.sol     # AMM + circuit breaker + fee tiers + LP
│   ├── EquityFactory.sol      # Atomic one-tx deploy + list
│   ├── KYCRegistry.sol        # Default pluggable KYC whitelist
│   └── interfaces/
│       ├── IEquityToken.sol
│       └── IKYCRegistry.sol
├── test/                      # Foundry test suite (exchange, factory, token)
├── script/
│   ├── Deploy.s.sol           # Full protocol deployment
│   └── DeployToken.s.sol      # Single token deployment helper
├── broadcast/                 # Deployment records (BSC Testnet chain 97)
└── frontend/                  # Next.js 15 app
    ├── app/
    │   ├── page.tsx           # Home / live market
    │   ├── companies/         # Marketplace with Amazon-style filters
    │   ├── tokens/[address]/  # Token detail — trade, LP, chart
    │   ├── list/              # Founder listing flow
    │   ├── portfolio/         # Holdings & LP positions
    │   └── api/               # Company profiles (AI-generated), trade events
    ├── components/
    │   ├── TradePanel.tsx
    │   ├── LiquidityPanel.tsx
    │   ├── PriceChart.tsx
    │   └── CircuitBreakerBadge.tsx
    └── lib/
        ├── contracts.ts       # ABIs + addresses + chain constants
        └── utils.ts           # Price, fee, block-time helpers
```

---

## Getting Started

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Bun](https://bun.sh) (or npm / pnpm)
- A BSC Testnet wallet with tBNB

### Clone & Install

```bash
git clone https://github.com/tusharojha/equity-on-chain
cd equity-on-chain

# Solidity dependencies
forge install

# Frontend
cd frontend && bun install
```

### Build & Test Contracts

```bash
forge build
forge test -vv
```

### Run Frontend

```bash
cd frontend
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_* addresses
bun dev
```

### Deploy to BSC Testnet

```bash
# Copy and fill in your private key + treasury address
cp .env.example .env

source .env
forge script script/Deploy.s.sol \
  --rpc-url bsc_testnet \
  --broadcast \
  -vvvv
```

Update `frontend/.env.local` with the printed contract addresses.

---

## Technical Architecture

For a deep dive into every design decision — AMM math, circuit breaker post-trade state commit pattern, weighted-average hold tracking, reentrancy guards, LP share accounting, and more — see **[TECHNICAL.md](TECHNICAL.md)**.

For the complete frontend integration guide — all contract call sequences, events to watch, error messages, slippage calculation, circuit breaker UI patterns — see **[FRONTEND.md](FRONTEND.md)**.

---

## Roadmap

- [x] Core protocol: AMM, circuit breakers, KYC, ownership caps, fee tiers
- [x] One-transaction company listing via EquityFactory
- [x] LP rewards (80% of sell fees)
- [x] Next.js frontend: trading, liquidity, portfolio
- [x] BSC Testnet deployment
- [ ] Dividend distribution mechanism
- [ ] Governance voting (equity-weighted)
- [ ] Fiat on-ramp integration
- [ ] Mainnet deployment
- [ ] DAO-controlled protocol treasury
- [ ] ZK-KYC integration (privacy-preserving verification)

---

## Contributing

Pull requests are welcome. For major changes, open an issue first to discuss the approach.

```bash
forge test          # all tests must pass
forge fmt           # format Solidity
cd frontend && bun run build   # no TypeScript errors
```

---

<div align="center">

Built with conviction that **every company deserves access to public capital markets.**

*EquityOnChain — Invest in Real Companies, On-Chain*

</div>
