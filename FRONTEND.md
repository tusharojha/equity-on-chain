# EquityOnChain — Frontend Integration Guide

> **Purpose:** Everything a frontend developer needs to build on top of the EOC protocol.
> Covers all user flows, every contract call in execution order, state to read, events to watch,
> errors to handle, and UX recommendations.
>
> **Chain:** opBNB (Chain ID `5611` testnet / `204` mainnet)
> **Stack assumptions:** ethers.js v6 / wagmi v2 / viem — but patterns are framework-agnostic.

---

## Table of Contents

1. [Contract Registry](#1-contract-registry)
2. [User Roles](#2-user-roles)
3. [Core Concepts for the UI](#3-core-concepts-for-the-ui)
4. [Flow A — List a Company (Founder)](#4-flow-a--list-a-company-founder)
5. [Flow B — Buy Equity Tokens (Investor)](#5-flow-b--buy-equity-tokens-investor)
6. [Flow C — Sell Equity Tokens (Investor)](#6-flow-c--sell-equity-tokens-investor)
7. [Flow D — Provide Liquidity (LP)](#7-flow-d--provide-liquidity-lp)
8. [Flow E — Remove Liquidity (LP)](#8-flow-e--remove-liquidity-lp)
9. [Flow F — KYC Verification (Admin / Company)](#9-flow-f--kyc-verification-admin--company)
10. [Flow G — Token Config Management (Founder)](#10-flow-g--token-config-management-founder)
11. [Reading State — All View Functions](#11-reading-state--all-view-functions)
12. [Events — Real-time Updates](#12-events--real-time-updates)
13. [Error Messages — User-Friendly Mapping](#13-error-messages--user-friendly-mapping)
14. [Circuit Breaker UI Patterns](#14-circuit-breaker-ui-patterns)
15. [Price & Slippage Calculation](#15-price--slippage-calculation)
16. [Fee Estimation Before Selling](#16-fee-estimation-before-selling)
17. [Global UX Checklist](#17-global-ux-checklist)

---

## 1. Contract Registry

```ts
// constants/contracts.ts
export const CONTRACTS = {
  KYC_REGISTRY:    "0x...",   // fill after deployment
  EQUITY_EXCHANGE: "0x...",   // fill after deployment
  EQUITY_FACTORY:  "0x...",   // fill after deployment
} as const;

export const CHAIN = {
  TESTNET_ID: 5611,
  MAINNET_ID: 204,
  BLOCK_TIME_SECONDS: 1,       // opBNB ~1s per block
  WINDOW_BLOCKS: 86_400n,      // 24h
  SHORT_TERM_BLOCKS: 15_552_000n, // 6 months (hold duration threshold)
} as const;
```

### Minimal ABIs (copy these — only what the frontend needs)

```ts
// abis/EquityFactory.ts
export const EQUITY_FACTORY_ABI = [
  "function create(string name, string symbol, uint256 maxSupply, uint256 poolTokens, uint256 founderTokens, tuple(uint8 upperCircuitPct, uint8 lowerCircuitPct, uint256 circuitHaltBlocks, bool limitOwnership, uint8 maxOwnershipPct, bool kycRequired, address kycProvider) cfg) payable returns (address)",
  "function exchange() view returns (address)",
  "function deployedTokens(uint256) view returns (address)",
  "function deployedTokenCount() view returns (uint256)",
  "function getTokensByFounder(address) view returns (address[])",
  "event EquityCreated(address indexed token, address indexed founder, string name, string symbol, uint256 maxSupply, uint256 founderTokens, uint256 poolTokens, uint256 initialBnb)",
] as const;

// abis/EquityExchange.ts
export const EQUITY_EXCHANGE_ABI = [
  // Listing
  "function listToken(address token, uint256 initialEquity) payable",
  "function listingFee() view returns (uint256)",
  // Liquidity
  "function addLiquidity(address token, uint256 equityDesired) payable",
  "function removeLiquidity(address token, uint256 lpShares)",
  "function getLPShares(address token, address provider) view returns (uint256)",
  // Trading
  "function buyTokens(address token, uint256 minEquityOut) payable",
  "function sellTokens(address token, uint256 equityIn, uint256 minBnbOut)",
  // Pool state
  "function getPool(address token) view returns (uint256 equityReserve, uint256 bnbReserve, uint256 totalLPShares, bool circuitBroken, uint256 haltedUntilBlock, uint256 protocolFeesAccrued)",
  "function getHoldRecord(address token, address holder) view returns (uint256 weightedBlockSum, uint256 totalAmount)",
  "function listedTokens(uint256) view returns (address)",
  "function listedTokenCount() view returns (uint256)",
  // Constants
  "function SHORT_TERM_BLOCKS() view returns (uint256)",
  "function WINDOW_BLOCKS() view returns (uint256)",
  "function SHORT_TERM_FEE_BPS() view returns (uint256)",
  "function LONG_TERM_FEE_BPS() view returns (uint256)",
  "function FEE_DENOM() view returns (uint256)",
  "function LP_FEE_SHARE_BPS() view returns (uint256)",
  "function treasury() view returns (address)",
  // Admin
  "function withdrawProtocolFees(address token)",
  "function setTreasury(address newTreasury)",
  "function setListingFee(uint256 newFee)",
  // Events
  "event TokenListed(address indexed token, uint256 initialEquity, uint256 initialBnb)",
  "event TokensBought(address indexed token, address indexed buyer, uint256 bnbIn, uint256 equityOut, uint256 fee)",
  "event TokensSold(address indexed token, address indexed seller, uint256 equityIn, uint256 bnbOut, uint256 fee)",
  "event CircuitBreaked(address indexed token, uint256 triggerBlock, uint256 resumeBlock, bool isUpper)",
  "event WindowReset(address indexed token, uint256 block_, uint256 newPriceNum, uint256 newPriceDenom)",
  "event LiquidityAdded(address indexed token, address indexed provider, uint256 equity, uint256 bnb, uint256 lpShares)",
  "event LiquidityRemoved(address indexed token, address indexed provider, uint256 equity, uint256 bnb, uint256 lpShares)",
] as const;

// abis/EquityToken.ts
export const EQUITY_TOKEN_ABI = [
  // ERC-20 standard
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  // EOC extensions
  "function maxSupply() view returns (uint256)",
  "function config() view returns (tuple(uint8 upperCircuitPct, uint8 lowerCircuitPct, uint256 circuitHaltBlocks, bool limitOwnership, uint8 maxOwnershipPct, bool kycRequired, address kycProvider))",
  "function isWhitelistedExchange(address) view returns (bool)",
  "function owner() view returns (address)",
  // Owner actions
  "function mint(address to, uint256 amount)",
  "function whitelistExchange(address exchange)",
  "function removeExchange(address exchange)",
  "function updateConfig(tuple(uint8 upperCircuitPct, uint8 lowerCircuitPct, uint256 circuitHaltBlocks, bool limitOwnership, uint8 maxOwnershipPct, bool kycRequired, address kycProvider) newConfig)",
  "function transferOwnership(address newOwner)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
  "event TokensMinted(address indexed to, uint256 amount)",
  "event ConfigUpdated(tuple(uint8,uint8,uint256,bool,uint8,bool,address) newConfig)",
] as const;

// abis/KYCRegistry.ts
export const KYC_REGISTRY_ABI = [
  "function isVerified(address account) view returns (bool)",
  "function verify(address account)",
  "function verifyBatch(address[] accounts)",
  "function revoke(address account)",
  "function owner() view returns (address)",
  "event AddressVerified(address indexed account)",
  "event AddressRevoked(address indexed account)",
] as const;
```

---

## 2. User Roles

| Role | Who | Key actions |
|------|-----|-------------|
| **Founder** | Company listing equity | `create()`, `mint()`, `updateConfig()`, `whitelistExchange()` |
| **Investor** | Retail buyer/seller | `buyTokens()`, `sellTokens()`, `approve()` |
| **LP Provider** | Liquidity market maker | `addLiquidity()`, `removeLiquidity()` |
| **KYC Admin** | Company or protocol | `verify()`, `verifyBatch()`, `revoke()` |
| **Protocol Admin** | EOC team wallet | `setListingFee()`, `setTreasury()`, `withdrawProtocolFees()` |

---

## 3. Core Concepts for the UI

### Price
Price is derived from pool reserves. There is no oracle.
```
price (BNB per equity token) = bnbReserve / equityReserve
```

### Circuit Breaker State
A pool can be in one of three states:
- **OPEN** — trading allowed
- **HALTED** — `circuitBroken = true` AND `block.number < haltedUntilBlock`
- **RESUMING** — `circuitBroken = true` BUT `block.number >= haltedUntilBlock` → next trade resets the window

Check this before showing trade buttons.

### Trading Window
Price is measured relative to the reference price set at the START of the 24h window.
The circuit trips if price moves ±N% from that reference — not from the current price.
After 86,400 blocks, the window resets automatically on the next trade.

### Hold Duration
The exchange tracks when you bought tokens using a weighted average acquisition block.
If your average hold ≥ 6 months (15,552,000 blocks), you get the long-term fee tier (0.02% instead of 0.45%).

---

## 4. Flow A — List a Company (Founder)

### When to use
A business owner wants to issue equity tokens and seed an initial liquidity pool.

### Why one call
`EquityFactory.create()` is atomic — it deploys the token, whitelists the exchange, mints tokens, and seeds the pool in a single transaction. If any step fails the entire transaction reverts, so there's no partial state.

### Pre-checks (show in the UI before enabling the submit button)
```ts
async function canList(
  founder: Address,
  poolTokens: bigint,
  founderTokens: bigint,
  maxSupply: bigint,
  initialBnb: bigint,
): Promise<{ ok: boolean; reason?: string }> {
  const listingFee = await exchange.read.listingFee();
  const totalBnb   = listingFee + initialBnb;
  const balance    = await publicClient.getBalance({ address: founder });

  if (poolTokens + founderTokens > maxSupply)
    return { ok: false, reason: "Pool + founder allocation exceeds max supply" };
  if (poolTokens === 0n)
    return { ok: false, reason: "Pool must receive at least some tokens" };
  if (balance < totalBnb)
    return { ok: false, reason: `Need ${formatEther(totalBnb)} BNB (listing fee + pool seed)` };

  return { ok: true };
}
```

### Config struct — field-by-field

| Field | Type | Recommended default | Description |
|-------|------|---------------------|-------------|
| `upperCircuitPct` | `uint8` | `10` | Halt if price rises >10% in 24h |
| `lowerCircuitPct` | `uint8` | `10` | Halt if price falls >10% in 24h |
| `circuitHaltBlocks` | `uint256` | `100` | ~100 seconds halt on opBNB |
| `limitOwnership` | `bool` | `false` | Enable per-wallet cap |
| `maxOwnershipPct` | `uint8` | `5` | If `limitOwnership = true`: max 5% per wallet |
| `kycRequired` | `bool` | `false` | Require KYC to hold/trade |
| `kycProvider` | `address` | `address(0)` | KYC contract (0 = none) |

### Transaction

```ts
// Step 1: Read current listing fee
const listingFee  = await exchange.read.listingFee();        // bigint, in wei
const initialBnb  = parseEther("0.1");                        // your choice
const totalValue  = listingFee + initialBnb;

// Step 2: Build the config tuple
const config = {
  upperCircuitPct:   10,
  lowerCircuitPct:   10,
  circuitHaltBlocks: 100n,
  limitOwnership:    true,
  maxOwnershipPct:   5,
  kycRequired:       false,
  kycProvider:       zeroAddress,
};

// Step 3: Send the single create() transaction
const txHash = await factory.write.create(
  [
    "Acme Corp",          // name
    "ACME",               // symbol
    parseEther("1000000"), // maxSupply (1M tokens)
    parseEther("100000"),  // poolTokens (100k to seed pool)
    parseEther("200000"),  // founderTokens (200k to founder wallet)
    config,
  ],
  { value: totalValue }
);

// Step 4: Wait for confirmation and parse the EquityCreated event
const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
const log = parseEventLogs({
  abi: EQUITY_FACTORY_ABI,
  logs: receipt.logs,
  eventName: "EquityCreated",
})[0];

const tokenAddress = log.args.token;  // store this — it's the new equity token
```

### Post-listing checklist (show to founder)
- [ ] Token address: `{tokenAddress}` — save this
- [ ] You are the token owner; you can `mint()` up to `maxSupply`
- [ ] The exchange is already whitelisted — trading is live immediately
- [ ] `{founderTokens}` tokens are in your wallet
- [ ] Pool seeded with `{poolTokens}` equity / `{initialBnb}` BNB

---

## 5. Flow B — Buy Equity Tokens (Investor)

### When to use
User wants to invest in a company by purchasing equity tokens with BNB.

### Why no approve needed
The user is sending BNB (native), not an ERC-20. The exchange receives the BNB directly via `msg.value`.

### Pre-checks

```ts
async function canBuy(
  token: Address,
  bnbIn: bigint,
  userAddress: Address,
): Promise<{ ok: boolean; reason?: string }> {
  const [er, br, , broken, haltedUntil] = await exchange.read.getPool([token]);

  // 1. Pool exists?
  if (er === 0n) return { ok: false, reason: "Token not listed on exchange" };

  // 2. Circuit breaker
  const block = await publicClient.getBlockNumber();
  if (broken && block < haltedUntil)
    return { ok: false, reason: circuitBreakerMessage(haltedUntil, block) };

  // 3. Balance
  const balance = await publicClient.getBalance({ address: userAddress });
  if (balance < bnbIn)
    return { ok: false, reason: "Insufficient BNB balance" };

  // 4. KYC check (if required)
  const cfg = await equityToken(token).read.config();
  if (cfg.kycRequired) {
    const kyc = getContract({ address: cfg.kycProvider, abi: KYC_REGISTRY_ABI });
    const verified = await kyc.read.isVerified([userAddress]);
    if (!verified) return { ok: false, reason: "KYC verification required to buy this token" };
  }

  // 5. Ownership cap check
  if (cfg.limitOwnership) {
    const tokenContract = equityToken(token);
    const currentBalance = await tokenContract.read.balanceOf([userAddress]);
    const totalSupply    = await tokenContract.read.totalSupply();
    const equityOut      = calcAmountOut(bnbIn, br, er); // see §15
    const newBalance     = currentBalance + equityOut;
    const maxAllowed     = (totalSupply * BigInt(cfg.maxOwnershipPct)) / 100n;
    if (newBalance > maxAllowed)
      return { ok: false, reason: `This purchase would exceed the ${cfg.maxOwnershipPct}% ownership cap` };
  }

  return { ok: true };
}
```

### Slippage calculation

```ts
// Calculate expected output and minimum acceptable output
function calcBuyQuote(bnbIn: bigint, equityReserve: bigint, bnbReserve: bigint) {
  const expectedOut = calcAmountOut(bnbIn, bnbReserve, equityReserve);
  // Apply slippage tolerance (default 0.5%)
  const slippageBps  = 50n;  // 0.5%
  const minEquityOut = (expectedOut * (10_000n - slippageBps)) / 10_000n;
  return { expectedOut, minEquityOut };
}
```

### Transaction

```ts
// Step 1: Read pool state
const [equityReserve, bnbReserve] = await exchange.read.getPool([tokenAddress]);

// Step 2: Calculate expected output and minimum
const bnbIn = parseEther("0.1");
const { expectedOut, minEquityOut } = calcBuyQuote(bnbIn, equityReserve, bnbReserve);

// Step 3: Send transaction
const txHash = await exchange.write.buyTokens(
  [tokenAddress, minEquityOut],
  { value: bnbIn }
);

// Step 4: Confirm
await publicClient.waitForTransactionReceipt({ hash: txHash });
// Refresh user's token balance, pool state
```

### What the user sees after
- Token balance increases
- BNB balance decreases by `bnbIn` + gas
- Hold record is created (acquisition block = current block)

---

## 6. Flow C — Sell Equity Tokens (Investor)

### When to use
User wants to exit their position by exchanging equity tokens for BNB.

### Why approve is required
Equity tokens are non-transferable P2P — the exchange must pull them via `transferFrom`. The user must first approve the exchange as a spender.

### Fee tier awareness
Before showing the sell UI, calculate which fee tier the user is in. This materially affects how much BNB they receive.

```ts
async function getSellFeeInfo(token: Address, holder: Address) {
  const { weightedBlockSum, totalAmount } = await exchange.read.getHoldRecord([token, holder]);
  const currentBlock = await publicClient.getBlockNumber();

  if (totalAmount === 0n) {
    return { feeBps: 45n, tier: "short-term", avgAcquiredBlock: null };
  }

  const avgAcquiredBlock = weightedBlockSum / totalAmount;
  const shortTermBlocks  = await exchange.read.SHORT_TERM_BLOCKS();
  const isLongTerm       = currentBlock >= avgAcquiredBlock + shortTermBlocks;

  const feeBps = isLongTerm ? 2n : 45n;  // 0.02% or 0.45%

  // Blocks until long-term tier kicks in (if still short-term)
  const blocksLeft = isLongTerm
    ? 0n
    : (avgAcquiredBlock + shortTermBlocks) - currentBlock;

  return {
    feeBps,
    tier: isLongTerm ? "long-term" : "short-term",
    avgAcquiredBlock,
    blocksUntilLongTerm: blocksLeft,
    // Convert blocks to approximate days (opBNB: 1 block ≈ 1 second)
    daysUntilLongTerm: Number(blocksLeft) / 86_400,
  };
}
```

### Pre-checks

```ts
async function canSell(
  token: Address,
  equityIn: bigint,
  userAddress: Address,
): Promise<{ ok: boolean; reason?: string }> {
  // 1. Balance
  const tokenContract  = equityToken(token);
  const balance        = await tokenContract.read.balanceOf([userAddress]);
  if (balance < equityIn)
    return { ok: false, reason: "Insufficient token balance" };

  // 2. Allowance (check before prompting approve)
  const allowance = await tokenContract.read.allowance([userAddress, CONTRACTS.EQUITY_EXCHANGE]);
  // (handle in transaction step — approve if needed)

  // 3. Circuit breaker
  const [er, br, , broken, haltedUntil] = await exchange.read.getPool([token]);
  const block = await publicClient.getBlockNumber();
  if (broken && block < haltedUntil)
    return { ok: false, reason: circuitBreakerMessage(haltedUntil, block) };

  // 4. Liquidity
  const rawBnbOut = calcAmountOut(equityIn, er, br);
  if (rawBnbOut === 0n)
    return { ok: false, reason: "Pool has insufficient BNB liquidity" };

  return { ok: true };
}
```

### Transaction (two steps — approve then sell)

```ts
// Step 1: Check and set allowance
const tokenContract = equityToken(tokenAddress);
const allowance = await tokenContract.read.allowance([userAddress, CONTRACTS.EQUITY_EXCHANGE]);

if (allowance < equityIn) {
  // Show "Step 1 of 2: Approve exchange" in UI
  const approveTx = await tokenContract.write.approve([CONTRACTS.EQUITY_EXCHANGE, equityIn]);
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
}

// Step 2: Read current pool state (price may have moved since approval)
const [equityReserve, bnbReserve] = await exchange.read.getPool([tokenAddress]);

// Step 3: Calculate expected output and apply fee
const { feeBps } = await getSellFeeInfo(tokenAddress, userAddress);
const rawBnbOut  = calcAmountOut(equityIn, equityReserve, bnbReserve);
const fee        = (rawBnbOut * feeBps) / 10_000n;
const netBnbOut  = rawBnbOut - fee;

// Step 4: Apply slippage tolerance
const slippageBps = 50n;  // 0.5%
const minBnbOut   = (netBnbOut * (10_000n - slippageBps)) / 10_000n;

// Step 5: Sell
// Show "Step 2 of 2: Sell tokens" in UI
const txHash = await exchange.write.sellTokens([tokenAddress, equityIn, minBnbOut]);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

### What the user sees after
- Token balance decreases to 0 (or partial)
- BNB balance increases by `netBnbOut` minus gas
- Hold record is reduced proportionally

---

## 7. Flow D — Provide Liquidity (LP)

### When to use
A user wants to earn fees by providing liquidity to an equity/BNB pool.

### Why provide liquidity
LP providers earn 80% of all sell fees. As trading volume grows, their position appreciates. Unlike web2 stock markets, anyone can be a market maker for equity tokens.

### LP math to display to user

```ts
async function getLiquidityQuote(
  token: Address,
  bnbIn: bigint,         // how much BNB the user wants to provide
  equityDesired: bigint, // max equity they're willing to contribute
) {
  const [er, br, totalShares] = await exchange.read.getPool([token]);

  // Actual equity needed to match the BNB ratio
  const equityOptimal = (bnbIn * er) / br;
  const equityActual  = equityOptimal < equityDesired ? equityOptimal : equityDesired;

  // BNB actually consumed (based on equityActual)
  const bnbActual = (equityActual * br) / er;

  // LP shares to be minted
  const newShares = (equityActual * totalShares) / er;

  // Pool share percentage
  const poolShareBps = (newShares * 10_000n) / (totalShares + newShares);

  return { equityActual, bnbActual, newShares, poolShareBps };
}
```

### Pre-checks

```ts
// User needs sufficient BNB + equity tokens + equity approved
const userEquityBalance = await tokenContract.read.balanceOf([userAddress]);
const userBnbBalance    = await publicClient.getBalance({ address: userAddress });

if (userEquityBalance < equityActual) → "Insufficient token balance"
if (userBnbBalance    < bnbActual)    → "Insufficient BNB balance"
```

### Transaction (approve + add)

```ts
// Step 1: Approve exchange to pull equity tokens
const allowance = await tokenContract.read.allowance([userAddress, CONTRACTS.EQUITY_EXCHANGE]);
if (allowance < equityActual) {
  await tokenContract.write.approve([CONTRACTS.EQUITY_EXCHANGE, equityActual]);
}

// Step 2: Add liquidity — send BNB, exchange pulls equity
// Note: send slightly more BNB than bnbActual to handle minor slippage;
// the contract refunds the excess.
const txHash = await exchange.write.addLiquidity(
  [tokenAddress, equityActual],
  { value: bnbActual }
);
await publicClient.waitForTransactionReceipt({ hash: txHash });

// Step 3: Read new LP share count
const lpShares = await exchange.read.getLPShares([tokenAddress, userAddress]);
```

---

## 8. Flow E — Remove Liquidity (LP)

### When to use
An LP wants to withdraw their position and receive BNB + equity tokens back.

### What they receive
Proportional share of both reserves. If the pool has grown since they deposited (due to trading fees), they receive more BNB than they put in.

```ts
async function getRemoveLiquidityQuote(token: Address, lpShares: bigint) {
  const [er, br, totalShares] = await exchange.read.getPool([token]);

  const equityOut = (lpShares * er) / totalShares;
  const bnbOut    = (lpShares * br) / totalShares;

  return { equityOut, bnbOut };
}
```

### Transaction (no approve needed — LP shares live inside the exchange contract)

```ts
// Step 1: Check LP shares
const lpShares = await exchange.read.getLPShares([tokenAddress, userAddress]);
if (lpShares === 0n) → "No LP position to withdraw"

// Step 2: Calculate what they'll receive
const { equityOut, bnbOut } = await getRemoveLiquidityQuote(tokenAddress, lpShares);

// Step 3: Remove (all or partial — pass any amount ≤ lpShares)
const txHash = await exchange.write.removeLiquidity([tokenAddress, lpShares]);
await publicClient.waitForTransactionReceipt({ hash: txHash });
```

---

## 9. Flow F — KYC Verification (Admin / Company)

### When to use
A company has `kycRequired = true` in their token config. Before any user can receive equity tokens, their wallet must be verified in the KYC registry that the token points to.

### Check if user needs KYC before attempting to trade

```ts
async function checkKYCStatus(token: Address, userAddress: Address) {
  const cfg = await equityToken(token).read.config();
  if (!cfg.kycRequired) return { required: false, verified: true };

  const kycContract = getContract({ address: cfg.kycProvider, abi: KYC_REGISTRY_ABI });
  const verified    = await kycContract.read.isVerified([userAddress]);
  return { required: true, verified, kycProvider: cfg.kycProvider };
}
```

### Verify a single address (Admin only)

```ts
// Only callable by the KYCRegistry owner
const txHash = await kycRegistry.write.verify([userAddress]);
```

### Verify multiple addresses at once

```ts
// Gas-efficient — one transaction for N users
const addresses: Address[] = ["0x...", "0x...", "0x..."];
const txHash = await kycRegistry.write.verifyBatch([addresses]);
```

### Revoke a user's KYC

```ts
const txHash = await kycRegistry.write.revoke([userAddress]);
// After this, the user cannot receive transfers for tokens using this registry
// Existing holdings are unaffected — they just can't receive more
```

---

## 10. Flow G — Token Config Management (Founder)

### When to use
After listing, the founder (token owner) may want to adjust the regulatory parameters — e.g., after the token is established, they might tighten circuit breakers or enable KYC.

### Important: This is the token owner only

```ts
const tokenOwner = await equityToken(tokenAddress).read.owner();
// Only show this UI to wallets matching tokenOwner
```

### Update the full config in one call

```ts
const newConfig = {
  upperCircuitPct:   10,    // tighten from 50% to 10%
  lowerCircuitPct:   10,
  circuitHaltBlocks: 100n,
  limitOwnership:    true,  // now enable ownership cap
  maxOwnershipPct:   5,
  kycRequired:       true,  // now require KYC
  kycProvider:       KYC_REGISTRY_ADDRESS,
};

const txHash = await equityToken(tokenAddress).write.updateConfig([newConfig]);
```

### Mint additional tokens (to the founder's wallet for future rounds)

```ts
// Check how much headroom is left
const totalSupply = await equityToken(tokenAddress).read.totalSupply();
const maxSupply   = await equityToken(tokenAddress).read.maxSupply();
const remaining   = maxSupply - totalSupply;

// Mint up to `remaining` tokens
const txHash = await equityToken(tokenAddress).write.mint([founderAddress, mintAmount]);
```

### Whitelist a new exchange (future proofing)

```ts
// If a second exchange is deployed or upgraded:
const txHash = await equityToken(tokenAddress).write.whitelistExchange([newExchangeAddress]);
```

---

## 11. Reading State — All View Functions

### Pool overview (main data source for the trading UI)

```ts
async function getPoolState(token: Address) {
  const [equityReserve, bnbReserve, totalLPShares, circuitBroken, haltedUntilBlock, protocolFees]
    = await exchange.read.getPool([token]);

  const currentBlock = await publicClient.getBlockNumber();
  const price        = Number(bnbReserve) / Number(equityReserve); // BNB per token

  // Market cap = price × totalSupply
  const totalSupply = await equityToken(token).read.totalSupply();
  const marketCapBnb = (bnbReserve * totalSupply) / equityReserve;

  // Circuit state
  const isHalted  = circuitBroken && currentBlock < haltedUntilBlock;
  const resumesIn = isHalted ? haltedUntilBlock - currentBlock : 0n; // blocks

  return {
    equityReserve,
    bnbReserve,
    price,                    // display as "0.0001 BNB"
    marketCapBnb,
    totalLPShares,
    isHalted,
    resumesInBlocks: resumesIn,
    resumesInSeconds: Number(resumesIn), // opBNB: 1 block ≈ 1 second
  };
}
```

### All listed tokens (for the exchange/explore page)

```ts
async function getAllListedTokens() {
  const count = await exchange.read.listedTokenCount();
  const tokens = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) =>
      exchange.read.listedTokens([BigInt(i)])
    )
  );
  return tokens; // Address[]
}
```

### Full token metadata (for token detail page)

```ts
async function getTokenMetadata(token: Address) {
  const tokenContract = equityToken(token);
  const [name, symbol, decimals, totalSupply, maxSupply, owner, cfg] = await Promise.all([
    tokenContract.read.name(),
    tokenContract.read.symbol(),
    tokenContract.read.decimals(),
    tokenContract.read.totalSupply(),
    tokenContract.read.maxSupply(),
    tokenContract.read.owner(),
    tokenContract.read.config(),
  ]);

  return {
    name, symbol, decimals,
    totalSupply, maxSupply,
    circulationPct: (Number(totalSupply) / Number(maxSupply)) * 100,
    owner,
    config: {
      upperCircuitPct:    cfg.upperCircuitPct,
      lowerCircuitPct:    cfg.lowerCircuitPct,
      circuitHaltBlocks:  cfg.circuitHaltBlocks,
      limitOwnership:     cfg.limitOwnership,
      maxOwnershipPct:    cfg.maxOwnershipPct,
      kycRequired:        cfg.kycRequired,
      kycProvider:        cfg.kycProvider,
    },
  };
}
```

### User's full position (for portfolio page)

```ts
async function getUserPosition(token: Address, userAddress: Address) {
  const tokenContract = equityToken(token);
  const [balance, lpShares, holdRecord, totalSupply, cfg] = await Promise.all([
    tokenContract.read.balanceOf([userAddress]),
    exchange.read.getLPShares([token, userAddress]),
    exchange.read.getHoldRecord([token, userAddress]),
    tokenContract.read.totalSupply(),
    tokenContract.read.config(),
  ]);

  const ownershipPct = totalSupply > 0n
    ? (Number(balance) / Number(totalSupply)) * 100
    : 0;

  // Hold duration
  const currentBlock = await publicClient.getBlockNumber();
  const avgAcquiredBlock = holdRecord.totalAmount > 0n
    ? holdRecord.weightedBlockSum / holdRecord.totalAmount
    : null;
  const holdBlocksDuration = avgAcquiredBlock ? currentBlock - avgAcquiredBlock : 0n;
  const shortTermBlocks    = 15_552_000n;
  const isLongTerm         = holdBlocksDuration >= shortTermBlocks;

  return {
    balance,
    ownershipPct,
    lpShares,
    feeTier:   isLongTerm ? "long-term (0.02%)" : "short-term (0.45%)",
    holdDays:  Number(holdBlocksDuration) / 86_400,
    daysUntilLongTerm: isLongTerm ? 0 : Number(shortTermBlocks - holdBlocksDuration) / 86_400,
  };
}
```

---

## 12. Events — Real-time Updates

Use events to update UI without polling. Subscribe on page mount, unsubscribe on unmount.

### Token listed (global — for updating the exchange listing page)

```ts
const unwatch = publicClient.watchContractEvent({
  address: CONTRACTS.EQUITY_FACTORY,
  abi: EQUITY_FACTORY_ABI,
  eventName: "EquityCreated",
  onLogs: (logs) => {
    logs.forEach(log => {
      // Add new token to the listed tokens list
      addToTokenList({
        address:   log.args.token,
        founder:   log.args.founder,
        name:      log.args.name,
        symbol:    log.args.symbol,
        poolBnb:   log.args.initialBnb,
      });
    });
  },
});
```

### Trade executed (for the token's activity feed)

```ts
publicClient.watchContractEvent({
  address: CONTRACTS.EQUITY_EXCHANGE,
  abi: EQUITY_EXCHANGE_ABI,
  eventName: "TokensBought",
  args: { token: tokenAddress },    // filter to specific token
  onLogs: (logs) => {
    logs.forEach(log => {
      addTradeToFeed({
        type:      "buy",
        buyer:     log.args.buyer,
        bnbIn:     log.args.bnbIn,
        equityOut: log.args.equityOut,
      });
      refreshPoolState();           // price changed — refresh reserves
    });
  },
});

publicClient.watchContractEvent({
  address: CONTRACTS.EQUITY_EXCHANGE,
  abi: EQUITY_EXCHANGE_ABI,
  eventName: "TokensSold",
  args: { token: tokenAddress },
  onLogs: (logs) => {
    logs.forEach(log => {
      addTradeToFeed({ type: "sell", ... });
      refreshPoolState();
    });
  },
});
```

### Circuit breaker triggered (critical — immediately update trading UI)

```ts
publicClient.watchContractEvent({
  address: CONTRACTS.EQUITY_EXCHANGE,
  abi: EQUITY_EXCHANGE_ABI,
  eventName: "CircuitBreaked",
  args: { token: tokenAddress },
  onLogs: (logs) => {
    logs.forEach(log => {
      setCircuitState({
        broken:          true,
        haltedUntilBlock: log.args.resumeBlock,
        isUpper:          log.args.isUpper,
        triggeredAt:      log.args.triggerBlock,
      });
      // Immediately disable buy/sell buttons with countdown
      showCircuitBreakerBanner(log.args.isUpper, log.args.resumeBlock);
    });
  },
});
```

### Window reset (price reference changed — refresh circuit % display)

```ts
publicClient.watchContractEvent({
  address: CONTRACTS.EQUITY_EXCHANGE,
  abi: EQUITY_EXCHANGE_ABI,
  eventName: "WindowReset",
  args: { token: tokenAddress },
  onLogs: () => {
    refreshPoolState();
    clearCircuitBreakerBanner();
  },
});
```

---

## 13. Error Messages — User-Friendly Mapping

Map contract revert strings to UI-friendly messages. Catch these from the transaction error.

```ts
const ERROR_MAP: Record<string, string> = {
  // EquityToken
  "EquityToken: direct transfers disabled, use the exchange":
    "Equity tokens cannot be sent directly between wallets. Use the exchange.",
  "EquityToken: caller is not a whitelisted exchange":
    "This action can only be performed by a registered exchange.",
  "EquityToken: recipient not KYC verified":
    "Your wallet needs to complete KYC verification to hold this token.",
  "EquityToken: exceeds max ownership limit":
    "This purchase would exceed the maximum ownership limit for this token.",
  "EquityToken: exceeds max supply":
    "Cannot mint more tokens — the maximum supply has been reached.",
  "EquityToken: burning disabled":
    "Equity tokens cannot be destroyed.",

  // EquityExchange
  "EquityExchange: circuit breaker active, trading halted":
    "Trading is temporarily halted due to a large price movement. Please try again shortly.",
  "EquityExchange: circuit breaker triggered, trade would breach price limits":
    "This trade was rejected because it would move the price beyond the allowed range.",
  "EquityExchange: slippage exceeded":
    "The price moved too much before your transaction confirmed. Try increasing your slippage tolerance.",
  "EquityExchange: insufficient equity liquidity":
    "The pool doesn't have enough tokens to fill this order. Try a smaller amount.",
  "EquityExchange: insufficient BNB liquidity":
    "The pool doesn't have enough BNB to fill this order. Try a smaller amount.",
  "EquityExchange: already listed":
    "This token is already listed on the exchange.",
  "EquityExchange: insufficient BNB (listing fee + initial liquidity)":
    "You need to send more BNB to cover both the listing fee and the initial pool seed.",
  "EquityExchange: insufficient LP shares":
    "You don't have enough LP shares to remove that amount of liquidity.",
  "EquityExchange: zero BNB":
    "Please enter a BNB amount greater than zero.",
  "EquityExchange: zero equity":
    "Please enter a token amount greater than zero.",
  "EquityExchange: BNB transfer failed":
    "BNB could not be sent to your wallet. Check that your wallet can receive BNB.",

  // EquityFactory
  "EquityFactory: poolTokens must be > 0":
    "You must deposit at least some tokens into the liquidity pool.",
  "EquityFactory: mint exceeds maxSupply":
    "Pool tokens + founder allocation cannot exceed the max supply.",
  "EquityFactory: need listingFee + initial BNB":
    "Send more BNB to cover the listing fee plus the initial pool liquidity.",

  // KYCRegistry
  "KYCRegistry: zero address":
    "Cannot verify the zero address.",
};

function parseContractError(error: unknown): string {
  const msg = extractRevertReason(error); // your ethers/viem error parser
  return ERROR_MAP[msg] ?? `Transaction failed: ${msg}`;
}
```

---

## 14. Circuit Breaker UI Patterns

### Determine trading status

```ts
type TradingStatus =
  | { status: "open" }
  | { status: "halted"; resumesAt: bigint; resumesInSeconds: number; isUpper: boolean }
  | { status: "window-resetting" }; // halted block has passed but window not reset yet

async function getTradingStatus(token: Address): Promise<TradingStatus> {
  const [, , , broken, haltedUntil] = await exchange.read.getPool([token]);
  const block = await publicClient.getBlockNumber();

  if (!broken) return { status: "open" };

  if (block < haltedUntil) {
    return {
      status: "halted",
      resumesAt: haltedUntil,
      resumesInSeconds: Number(haltedUntil - block), // 1 block ≈ 1s on opBNB
      isUpper: true, // you'd need to cache the event direction
    };
  }

  // Block has passed but window hasn't been reset by a trade yet
  return { status: "window-resetting" };
}
```

### Banner component text

```ts
function circuitBreakerMessage(haltedUntilBlock: bigint, currentBlock: bigint): string {
  const blocksLeft   = haltedUntilBlock - currentBlock;
  const secondsLeft  = Number(blocksLeft);
  const minutesLeft  = Math.ceil(secondsLeft / 60);

  if (secondsLeft <= 90) return `Trading resumes in ~${secondsLeft} seconds.`;
  return `Trading is halted. Resumes in ~${minutesLeft} minutes.`;
}
```

### Show the circuit breaker threshold to users (transparency)

```ts
async function getCircuitBreakerInfo(token: Address) {
  const cfg = await equityToken(token).read.config();
  const [, , , , , , , refNum, refDenom] = ...; // if you expose refPrice
  return {
    upperThresholdPct: cfg.upperCircuitPct,
    lowerThresholdPct: cfg.lowerCircuitPct,
    haltDurationSeconds: Number(cfg.circuitHaltBlocks), // 1 block ≈ 1s
    message: `Trading halts if price moves more than ±${cfg.upperCircuitPct}% within 24 hours.`,
  };
}
```

---

## 15. Price & Slippage Calculation

### Core AMM math (use everywhere — no contract call needed)

```ts
/**
 * Constant-product output formula: amountOut = reserveOut * amountIn / (reserveIn + amountIn)
 */
function calcAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;
  return (amountIn * reserveOut) / (reserveIn + amountIn);
}

/**
 * Spot price: how many BNB you'd receive for 1 whole equity token (in wei)
 */
function getSpotPrice(equityReserve: bigint, bnbReserve: bigint): bigint {
  const oneToken = 10n ** 18n;
  return calcAmountOut(oneToken, equityReserve, bnbReserve);
}

/**
 * Price impact of a trade, in basis points
 */
function calcPriceImpactBps(amountIn: bigint, reserveIn: bigint): bigint {
  // Impact ≈ amountIn / (reserveIn + amountIn), expressed in bps
  return (amountIn * 10_000n) / (reserveIn + amountIn);
}

/**
 * Full buy quote with fee (no fee on buys, but useful for display)
 */
function getBuyQuote(
  bnbIn: bigint,
  equityReserve: bigint,
  bnbReserve: bigint,
  slippageBps = 50n,
) {
  const expectedOut  = calcAmountOut(bnbIn, bnbReserve, equityReserve);
  const priceImpact  = calcPriceImpactBps(bnbIn, bnbReserve);
  const minEquityOut = (expectedOut * (10_000n - slippageBps)) / 10_000n;
  return { expectedOut, minEquityOut, priceImpactBps: priceImpact };
}

/**
 * Full sell quote with fee applied
 */
function getSellQuote(
  equityIn: bigint,
  equityReserve: bigint,
  bnbReserve: bigint,
  feeBps: bigint,        // 45n (short-term) or 2n (long-term)
  slippageBps = 50n,
) {
  const rawBnbOut   = calcAmountOut(equityIn, equityReserve, bnbReserve);
  const fee         = (rawBnbOut * feeBps) / 10_000n;
  const netBnbOut   = rawBnbOut - fee;
  const minBnbOut   = (netBnbOut * (10_000n - slippageBps)) / 10_000n;
  const priceImpact = calcPriceImpactBps(equityIn, equityReserve);
  return { rawBnbOut, fee, netBnbOut, minBnbOut, priceImpactBps: priceImpact };
}
```

### Price impact UX guidance

| Impact | Color | Message |
|--------|-------|---------|
| < 1% | green | — |
| 1–3% | yellow | "Moderate price impact" |
| 3–5% | orange | "High price impact" |
| > 5% | red | "Very high price impact — consider a smaller trade" |

---

## 16. Fee Estimation Before Selling

Show users the **exact BNB they'll receive** and the fee breakdown before they confirm.

```ts
async function getSellPreview(token: Address, equityIn: bigint, userAddress: Address) {
  const [equityReserve, bnbReserve] = await exchange.read.getPool([token]);
  const { feeBps, tier, daysUntilLongTerm } = await getSellFeeInfo(token, userAddress);

  const { rawBnbOut, fee, netBnbOut, priceImpactBps } = getSellQuote(
    equityIn, equityReserve, bnbReserve, feeBps
  );

  // Fee split
  const lpFeeBps       = 8_000n; // 80%
  const lpFee          = (fee * lpFeeBps) / 10_000n;
  const protocolFee    = fee - lpFee;

  return {
    youReceive:      netBnbOut,
    feeTier:         tier,
    feePct:          Number(feeBps) / 100,       // 0.45 or 0.02
    feeAmount:       fee,
    lpFeeAmount:     lpFee,
    protocolFeeAmount: protocolFee,
    priceImpactPct:  Number(priceImpactBps) / 100,
    daysUntilLongTerm: daysUntilLongTerm,         // show countdown if > 0
  };
}
```

### Recommended sell preview UI

```
You sell:     1,000 ACME
You receive:  0.09955 BNB
─────────────────────────────
Fee tier:     Short-term (0.45%)     [Upgrade in 142 days]
Fee amount:   0.00045 BNB
  └ 80% to LPs     0.00036 BNB
  └ 20% protocol   0.00009 BNB
Price impact: 0.8%
─────────────────────────────
Minimum received (0.5% slippage): 0.09905 BNB
```

---

## 17. Global UX Checklist

### Before every transaction
- [ ] Check wallet is connected and on the correct network (chain ID 5611 / 204)
- [ ] Check BNB balance covers tx value + estimated gas
- [ ] Check circuit breaker state — disable trade buttons if halted
- [ ] Check KYC status if token requires it — show verification prompt instead of trade form

### During every transaction
- [ ] Show pending state with block explorer link
- [ ] Disable submit button to prevent double-submission
- [ ] Show transaction step if multi-step (e.g., "1/2: Approve" → "2/2: Sell")

### After every transaction
- [ ] Refresh pool state (price, reserves, circuit status)
- [ ] Refresh user balances (BNB, token, LP shares)
- [ ] Update hold record display if buy or sell

### Token detail page — must-have data
- [ ] Current price (BNB and USD equivalent if you have a BNB/USD price feed)
- [ ] 24h price change % (calculate from `WindowReset` events or pool state snapshots)
- [ ] Circuit breaker thresholds and current status
- [ ] Total supply / max supply / circulation %
- [ ] KYC required? (show badge)
- [ ] Ownership cap? (show badge)
- [ ] Pool liquidity depth (equityReserve, bnbReserve)
- [ ] Company info (name, symbol, owner address)

### Portfolio page — must-have data
- [ ] Token balance + USD value
- [ ] Ownership % of total supply
- [ ] LP shares + estimated current value
- [ ] Current fee tier (short / long term)
- [ ] Days until long-term fee tier (progress bar)

### Exchange/listing page — must-have data
- [ ] All listed tokens with price, market cap, 24h volume
- [ ] Circuit breaker status badge per token
- [ ] Quick buy/sell from the list view

### Numbers to always display in human-readable form
```ts
// Tokens: always divide by 1e18, format with commas
formatTokenAmount(raw: bigint) → "1,234.56 ACME"

// BNB: show to 4 decimal places
formatBnb(raw: bigint) → "0.0054 BNB"

// Percentages: 1 decimal place
formatPct(bps: bigint) → "0.4%" (from 45n)

// Blocks to time: on opBNB, 1 block ≈ 1 second
formatBlocksToTime(blocks: bigint) → "2h 14m" or "3 days"
```

---

*All contract addresses are to be filled in after deployment. Run `forge script script/Deploy.s.sol --rpc-url opbnb_testnet --broadcast` and update `CONTRACTS` in your frontend constants.*
