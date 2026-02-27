# EquityOnChain — Technical Architecture

> This document explains **how** every protocol feature is implemented at the Solidity level — what pattern enables it, why it was designed that way, and where the tradeoffs are.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Non-Transferable Equity Tokens](#2-non-transferable-equity-tokens)
3. [Non-Burnable Supply](#3-non-burnable-supply)
4. [Exchange Whitelist (Approved-Spender Pattern)](#4-exchange-whitelist--approved-spender-pattern)
5. [KYC Gate](#5-kyc-gate)
6. [Max Ownership Cap](#6-max-ownership-cap)
7. [Constant-Product AMM](#7-constant-product-amm)
8. [Circuit Breaker](#8-circuit-breaker)
9. [24-Hour Price Window](#9-24-hour-price-window)
10. [Hold-Duration Fee Tiers](#10-hold-duration-fee-tiers)
11. [Liquidity Pool & LP Shares](#11-liquidity-pool--lp-shares)
12. [Fee Distribution (LP vs Treasury)](#12-fee-distribution-lp-vs-treasury)
13. [Atomic Token Deployment (EquityFactory)](#13-atomic-token-deployment-equityfactory)
14. [Security Patterns](#14-security-patterns)
15. [BSC Testnet-Specific Choices](#15-bsc-testnet-specific-choices)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    EquityFactory                        │
│  One-click: deploy token + whitelist + list (1 tx)     │
└──────────────┬─────────────────────────────────────────┘
               │ creates & lists
               ▼
┌──────────────────────┐     approve+transferFrom    ┌──────────────────────┐
│    EquityToken        │◄────────────────────────────│   EquityExchange     │
│  (per company)        │                             │  (single contract,   │
│                       │──── config() ─────────────►│   all pools inside)  │
│  - ERC-20 modified    │                             │                      │
│  - non-transferable   │                             │  - AMM (x·y=k)       │
│  - non-burnable       │                             │  - Circuit breaker   │
│  - KYC gated          │                             │  - Fee tiers         │
│  - ownership capped   │                             │  - LP accounting     │
└──────────────────────┘                             └──────────┬───────────┘
                                                                │ reads
               ┌────────────────────────────────────────────────┘
               ▼
┌──────────────────────┐
│    KYCRegistry        │  implements IKYCRegistry
│  (pluggable)          │  can be replaced with any
│  - address whitelist  │  on-chain KYC oracle
└──────────────────────┘
```

**Contract addresses are the protocol's anchors.** The exchange address is stored in the token's `_whitelistedExchanges` mapping; the KYC provider address is stored in the token's `Config` struct. All relationships are on-chain and verifiable.

---

## 2. Non-Transferable Equity Tokens

### The Problem
Standard ERC-20 `transfer()` allows any holder to send tokens to any address. Equity tokens must not behave like currencies — they should only move through regulated exchange contracts.

### The Solution: Override `transfer()` with a whitelist check

```solidity
// src/EquityToken.sol:107
function transfer(address to, uint256 amount) public override returns (bool) {
    require(
        _whitelistedExchanges[msg.sender],
        "EquityToken: direct transfers disabled, use the exchange"
    );
    _applyReceiveChecks(to, amount);
    return super.transfer(to, amount);
}
```

**Key insight:** ERC-20's `transfer` is `public virtual`, so it can be overridden. The override gates it on `msg.sender` being a whitelisted exchange. For all non-exchange callers, it unconditionally reverts.

The exchange itself holds equity tokens as pool reserves, so it legitimately calls `transfer(buyer, amount)` when a buy executes. Since the exchange is whitelisted, this passes.

Similarly `transferFrom` is overridden:
```solidity
// src/EquityToken.sol:115
function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
    require(_whitelistedExchanges[msg.sender], "...");
    _applyReceiveChecks(to, amount);
    return super.transferFrom(from, to, amount);
}
```

This is used when a seller has `approve`d the exchange to pull their tokens.

### Why Not Just Disable `transfer` Entirely?
The exchange needs a way to send equity tokens to buyers from its pool reserves. Since the exchange owns those tokens (they're in its balance), the natural ERC-20 call is `transfer(buyer, amount)`. Overriding to allow whitelisted callers is cleaner than adding a separate custom function.

---

## 3. Non-Burnable Supply

### Implementation

```solidity
// src/EquityToken.sol:122-130
function burn(uint256) public pure {
    revert("EquityToken: burning disabled");
}

function burnFrom(address, uint256) public pure {
    revert("EquityToken: burning disabled");
}
```

Both `burn` and `burnFrom` are unconditionally reverted with `pure` (no state reads needed). OpenZeppelin's ERC20 does not inherit `ERC20Burnable` by default, so these are added as explicit rejections for any future caller or ABI that might try to invoke them.

**Why `pure` instead of `view`?** Since neither function reads any state before reverting, `pure` is the correct mutability. It also makes the intent explicit at the ABI level.

### Why Keep `maxSupply` Immutable?
```solidity
// src/EquityToken.sol:26
uint256 private immutable _maxSupply;
```

`immutable` is set once in the constructor and stored directly in contract bytecode (not storage). This costs zero gas to read and makes the cap permanently unforgeable — even the owner cannot change it. Equity supply limits must be trustworthy.

---

## 4. Exchange Whitelist / Approved-Spender Pattern

### State
```solidity
// src/EquityToken.sol:31
mapping(address => bool) private _whitelistedExchanges;
```

### Management
```solidity
function whitelistExchange(address exchange) external onlyOwner { ... }
function removeExchange(address exchange) external onlyOwner { ... }
```

Only the token owner (the company) controls which exchanges can touch its equity tokens. This means:
- A malicious exchange cannot list the token without the company's approval.
- The company can delist from a compromised exchange instantly by calling `removeExchange`.

### Exchange Exemption from Receive-Side Checks

```solidity
// src/EquityToken.sol:141
function _applyReceiveChecks(address to, uint256 amount) internal view {
    if (to == address(0)) return;
    if (_whitelistedExchanges[to]) return; // exchange reserves are exempt
    // ... KYC and ownership checks ...
}
```

When the exchange receives tokens (from sellers depositing to the pool, or from the factory seeding the pool), it is exempt from KYC and ownership-limit checks. The exchange is a contract holding reserves, not a retail investor. Without this exemption, the pool itself would hit the ownership cap immediately.

---

## 5. KYC Gate

### Interface
```solidity
// src/interfaces/IKYCRegistry.sol
interface IKYCRegistry {
    function isVerified(address account) external view returns (bool);
}
```

The token holds only an interface reference, not a concrete implementation. Any contract that implements `IKYCRegistry` can be wired as the KYC provider — including:
- The built-in `KYCRegistry.sol` (whitelist operated by the company)
- A third-party on-chain identity oracle (e.g., Civic, Worldcoin, zkKYC)
- A company-operated off-chain attestation bridge

### Enforcement Point

```solidity
// src/EquityToken.sol:143-148
if (_config.kycRequired) {
    require(_config.kycProvider != address(0), "EquityToken: KYC provider not set");
    require(
        IKYCRegistry(_config.kycProvider).isVerified(to),
        "EquityToken: recipient not KYC verified"
    );
}
```

The check is at the **token level**, not the exchange level. This means every equity movement — whether buy, sell, or LP withdrawal — will fail if the recipient isn't verified, regardless of which exchange is used. The invariant is enforced at the asset itself.

### KYCRegistry Implementation

```solidity
// src/KYCRegistry.sol
mapping(address => bool) private _verified;

function verify(address account) external onlyOwner { ... }
function verifyBatch(address[] calldata accounts) external onlyOwner { ... }
function revoke(address account) external onlyOwner { ... }
```

Batch verification is provided as a gas-saving convenience for onboarding multiple users simultaneously (one transaction instead of N).

---

## 6. Max Ownership Cap

### Configuration
```solidity
// src/interfaces/IEquityToken.sol (Config struct)
bool limitOwnership;
uint8 maxOwnershipPct; // e.g., 10 = no wallet can hold >10% of total supply
```

### Enforcement

```solidity
// src/EquityToken.sol:151-155
if (_config.limitOwnership) {
    uint256 newBalance = balanceOf(to) + amount;
    uint256 maxAllowed = (totalSupply() * _config.maxOwnershipPct) / 100;
    require(newBalance <= maxAllowed, "EquityToken: exceeds max ownership limit");
}
```

The check uses `totalSupply()` at enforcement time, not at deployment. As more tokens are minted, the cap scales up proportionally. A holder at 9% of a 1M supply can receive more tokens after a mint brings supply to 2M (now their 9% = 90k, and 10% of 2M = 200k).

**Tradeoff:** Integer division can create rounding edge cases. For example, with `totalSupply = 3` and `maxOwnershipPct = 33`, `maxAllowed = 0`. In practice, tokens use 18 decimals so supply is always in `1e18` units, making rounding inconsequential.

---

## 7. Constant-Product AMM

### Formula
```
x · y = k
where x = equityReserve, y = bnbReserve, k = constant
```

### Output Calculation

```solidity
// src/EquityExchange.sol:409-415
function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
    internal pure returns (uint256)
{
    return (amountIn * reserveOut) / (reserveIn + amountIn);
}
```

**Derivation:**
```
k = x · y = (x + amountIn) · (y - amountOut)
amountOut = y - k / (x + amountIn)
           = y - (x · y) / (x + amountIn)
           = y · amountIn / (x + amountIn)
```

This matches the implementation: `amountOut = reserveOut * amountIn / (reserveIn + amountIn)`.

### Why Constant-Product?
- **No oracle needed.** Price is discovered purely by supply/demand in the pool.
- **Battle-tested.** Same math as Uniswap V2. Well-understood invariants.
- **Infinite liquidity.** The pool never runs out (price approaches infinity asymptotically).
- **Price impact is deterministic.** Slippage can be computed client-side before sending the transaction.

### No Fee on Buys
Buys have zero fee. Fee is only on sells (equity → BNB). This creates an asymmetric incentive structure: buying is free, selling is taxed. Long-term holders are rewarded with lower tax. This is a deliberate mechanism to encourage holding, similar to stamp duty in traditional equity markets.

---

## 8. Circuit Breaker

### State (per pool)

```solidity
// src/EquityExchange.sol (Pool struct)
uint256 refPriceNumerator;    // bnbReserve   at window start
uint256 refPriceDenominator;  // equityReserve at window start
bool circuitBroken;
uint256 haltedUntilBlock;
```

### Price Comparison Without Division

Price is represented as a ratio `(bnb / equity)`. Comparing prices without division avoids both floating-point issues and division-by-zero risks:

```solidity
// src/EquityExchange.sol:461-462
bool upperBreached = (currentBnb * refDenom * 100)
                   > (refNum * currentEquity * (100 + cfg.upperCircuitPct));
bool lowerBreached = (currentBnb * refDenom * 100)
                   < (refNum * currentEquity * (100 - cfg.lowerCircuitPct));
```

**Math:** The condition `currentPrice > refPrice * (1 + upperPct/100)` expands to:
```
currentBnb / currentEquity > refNum / refDenom * (100 + pct) / 100
```
Cross-multiplying (all values > 0):
```
currentBnb * refDenom * 100 > refNum * currentEquity * (100 + pct)
```
This is exact integer arithmetic with no precision loss.

**Overflow analysis:** With realistic values (reserveBnb ≤ 10^21 wei, reserveEquity ≤ 10^24, multiplier ≤ 110), the maximum product is ~10^47, well within `uint256` range (~10^77).

### Post-Trade Architecture (Critical Design Choice)

The circuit breaker check happens **after** the trade completes and reserves are updated:

```solidity
// src/EquityExchange.sol:276-278 (buyTokens)
emit TokensBought(...);
// Post-trade circuit check — state persists, no revert
_updateCircuitState(token, pool, newBnbReserve, newEquityReserve);
```

**Why post-trade?**

In Solidity, a `revert()` rolls back **all state changes** in the current transaction. If we set `pool.circuitBroken = true` and then `revert("circuit breaker triggered")`, the state change is also undone. The circuit would never actually activate.

Correct semantics require the triggering trade to succeed (state committed), then all subsequent trades in the same window are blocked. This also matches how real stock-market circuit breakers work — the breaching trade clears, then trading halts.

### Halt Enforcement

```solidity
// src/EquityExchange.sol:432-436
function _requireNotHalted(Pool storage pool) internal view {
    if (pool.circuitBroken) {
        require(
            block.number >= pool.haltedUntilBlock,
            "EquityExchange: circuit breaker active, trading halted"
        );
    }
}
```

This runs at the **start** of every `buyTokens`/`sellTokens` call, before any computation. If the halt block hasn't passed, the transaction reverts immediately.

---

## 9. 24-Hour Price Window

### Why a Window?
The circuit breaker needs a **reference price** to measure deviation against. Without a time-bound reference, the first trade of a token that has been dormant for a month would be measured against a stale price — potentially triggering the circuit on legitimate trading.

On BSC Testnet, blocks are produced roughly every ~3 seconds, so:
```solidity
uint256 public constant WINDOW_BLOCKS = 28_800; // 24h × 3600s/h ÷ 3s/block
```

### Reset Logic

```solidity
// src/EquityExchange.sol:422-430
function _maybeResetWindow(address token, Pool storage pool) internal {
    if (block.number >= pool.windowStartBlock + WINDOW_BLOCKS) {
        pool.refPriceNumerator   = pool.bnbReserve;
        pool.refPriceDenominator = pool.equityReserve;
        pool.windowStartBlock    = block.number;
        pool.circuitBroken       = false;   // clear any prior halt
        emit WindowReset(token, block.number, pool.bnbReserve, pool.equityReserve);
    }
}
```

Called at the start of every buy/sell, this atomically:
1. Snapshots the current spot price as the new reference.
2. Resets `windowStartBlock` to now.
3. Clears `circuitBroken` — a new 24h window begins with clean state.

**Note:** The window reset is **lazy** (triggered on the next trade, not by a cron/keeper). This is gas-efficient and correct — there's no need to update state when nobody is trading.

---

## 10. Hold-Duration Fee Tiers

### Goal
Reward long-term holders and discourage short-term speculation. Sellers who held for ≥ 6 months pay significantly less fee.

```
Hold < 6 months  → 0.45% fee on sell (45 basis points)
Hold ≥ 6 months  → 0.02% fee on sell  (2 basis points)
```

On BSC Testnet (~3 seconds/block):
```solidity
uint256 public constant SHORT_TERM_BLOCKS = 5_184_000; // 180 days × 86,400 s/day ÷ 3 s/block
```

### Weighted-Average Acquisition Block

Since holders may buy multiple times at different blocks, we track a **weighted average** of when their tokens were acquired:

```solidity
// src/EquityExchange.sol (HoldRecord struct)
struct HoldRecord {
    uint256 weightedBlockSum; // Σ(amount × acquisitionBlock)
    uint256 totalAmount;      // current tracked balance
}
```

**On each buy:**
```solidity
// src/EquityExchange.sol:476-479
r.weightedBlockSum += amount * blockNum;
r.totalAmount      += amount;
```
Average acquisition block = `weightedBlockSum / totalAmount`.

**Example:**
- Block 1000: buy 100 tokens → `weightedSum = 100,000`, `total = 100`
- Block 2000: buy 200 tokens → `weightedSum = 500,000`, `total = 300`
- Average = `500,000 / 300 = 1666` (block 1666 average acquisition)

**On each sell:**
```solidity
// src/EquityExchange.sol:482-491
if (amount >= r.totalAmount) {
    r.weightedBlockSum = 0;
    r.totalAmount = 0;
} else {
    // Proportionally reduce the weighted sum
    r.weightedBlockSum = (r.weightedBlockSum * (r.totalAmount - amount)) / r.totalAmount;
    r.totalAmount -= amount;
}
```

Selling proportionally reduces the weighted sum, maintaining the average correctly. This is equivalent to removing the "oldest" portion of the holding.

**Fee determination:**
```solidity
// src/EquityExchange.sol:494-501
function _getFeeBps(address token, address seller) internal view returns (uint256) {
    HoldRecord storage r = _holdRecords[token][seller];
    if (r.totalAmount == 0) return SHORT_TERM_FEE_BPS;
    uint256 avgAcquiredBlock = r.weightedBlockSum / r.totalAmount;
    if (block.number >= avgAcquiredBlock + SHORT_TERM_BLOCKS) {
        return LONG_TERM_FEE_BPS;
    }
    return SHORT_TERM_FEE_BPS;
}
```

---

## 11. Liquidity Pool & LP Shares

### Bootstrap (Initial Listing)

```solidity
// src/EquityExchange.sol:159-160
pool.totalLPShares = initialEquity; // 1 LP share = 1 equity token seeded
pool.lpShares[msg.sender] = initialEquity;
```

The first LP's share count equals the initial equity deposit. This anchors the LP share unit to the initial pool size and avoids an arbitrary starting denominator.

### Adding Liquidity (Proportional)

```solidity
// src/EquityExchange.sol:185-202
// Optimal equity for the BNB being sent:
uint256 equityOptimal = (msg.value * pool.equityReserve) / pool.bnbReserve;
// Use the smaller of optimal and desired (prevent one-sided contribution):
uint256 equityActual = equityOptimal < equityDesired ? equityOptimal : equityDesired;
// LP shares issued proportional to equity contribution:
uint256 newShares = (equityActual * pool.totalLPShares) / pool.equityReserve;
```

LP share issuance is proportional to the equity contributed relative to the equity reserve. This ensures new LPs enter at the current pool ratio without diluting existing LPs' share of the pool.

### Removing Liquidity (Proportional)

```solidity
// src/EquityExchange.sol:219-225
uint256 equityOut = (lpShares_ * pool.equityReserve) / pool.totalLPShares;
uint256 bnbOut    = (lpShares_ * pool.bnbReserve)    / pool.totalLPShares;
```

LP receives their proportional claim on both reserves. If the pool has grown (due to trades increasing reserves), the LP receives more than they deposited — that's the LP fee reward.

---

## 12. Fee Distribution (LP vs Treasury)

### Split Constants
```solidity
uint256 public constant LP_FEE_SHARE_BPS = 8_000; // 80% to LPs
// → implicit 20% to protocol treasury
```

### On Each Sell

```solidity
// src/EquityExchange.sol:307-315
uint256 lpFee      = (fee * LP_FEE_SHARE_BPS) / FEE_DENOM;  // 80% of fee
uint256 protocolFee = fee - lpFee;                           // 20% of fee

pool.bnbReserve        = newBnbReserve + lpFee; // LP fee re-enters the pool
pool.protocolFeesAccrued += protocolFee;         // protocol fee accrues separately
```

**LP fees** are added directly back into `bnbReserve`. This means LPs don't receive fees as a separate payout — instead, their LP shares represent a growing claim on the pool. When an LP removes liquidity, they withdraw more BNB than they deposited, which is their earned fee.

**Protocol fees** accrue in a separate counter and are claimed by the protocol owner:
```solidity
function withdrawProtocolFees(address token) external onlyOwner nonReentrant {
    uint256 amount = pool.protocolFeesAccrued;
    pool.protocolFeesAccrued = 0;
    _sendBnb(treasury, amount);
}
```

---

## 13. Atomic Token Deployment (EquityFactory)

### The Challenge
Listing a new equity token requires a strict sequence:
1. Deploy the token contract
2. Whitelist the exchange on it
3. Mint initial tokens
4. Approve the exchange
5. Call `listToken`

If this is done in multiple transactions, there's a window where:
- The token exists but isn't listed (users can't trade)
- Front-runners could exploit partial state

### The Solution: One Atomic Transaction

```solidity
// src/EquityFactory.sol:82-110 (create())
// 1. Deploy with factory as TEMPORARY owner
EquityToken token = new EquityToken(name_, symbol_, maxSupply_, address(this), cfg);

// 2. Mint pool tokens to factory (exchange will pull these)
token.mint(address(this), poolTokens);

// 3. Mint founder allocation DIRECTLY to msg.sender via _mint()
//    _mint() bypasses transfer restrictions (it's an internal balance op)
token.mint(msg.sender, founderTokens);

// 4. Whitelist the exchange
token.whitelistExchange(address(exchange));

// 5. Transfer ownership to actual founder
token.transferOwnership(msg.sender);

// 6. Approve and list (atomic — exchange pulls tokens in the same call)
token.approve(address(exchange), poolTokens);
exchange.listToken{value: msg.value}(tokenAddress, poolTokens);
```

**Why does the factory start as owner?** Only the owner can call `whitelistExchange` and `mint`. The factory needs both before handing ownership to the founder. After the setup, `transferOwnership` gives permanent control to the founder.

**Why does `_mint` bypass restrictions?** OpenZeppelin's `ERC20._mint` directly increments balances without calling `transfer` or `transferFrom`. This means the founder receives tokens as an initial allocation without needing the exchange whitelist to be set up first. The restriction override only applies to transfers after minting.

**Why approve after `transferOwnership`?** `approve` is an ERC-20 function that any holder can call — it's not restricted to the owner. After step 5, the factory is no longer the token owner but still holds `poolTokens` in its balance. The factory can still call `token.approve(exchange, poolTokens)` on its own behalf.

---

## 14. Security Patterns

### Reentrancy Guard
```solidity
contract EquityExchange is Ownable, ReentrancyGuard {
```
All state-mutating exchange functions (`listToken`, `addLiquidity`, `removeLiquidity`, `buyTokens`, `sellTokens`, `withdrawProtocolFees`) carry the `nonReentrant` modifier. BNB transfers use the low-level `call` pattern — without a reentrancy guard, the recipient could re-enter and drain the pool.

### SafeERC20
```solidity
using SafeERC20 for IERC20;
// All equity token transfers use:
IERC20(token).safeTransfer(...);
IERC20(token).safeTransferFrom(...);
```
`SafeERC20` wraps calls and checks return values, reverting if the token transfer fails. This protects against non-standard ERC-20 tokens that return `false` instead of reverting on failure.

### Checks-Effects-Interactions (CEI)
All functions follow the CEI pattern:
1. **Checks** — validate inputs and state
2. **Effects** — update storage
3. **Interactions** — external calls (token transfers, BNB sends) last

```solidity
// Example: sellTokens
// CHECKS
require(pool.exists, ...);
require(equityIn > 0, ...);
_requireNotHalted(pool);
// EFFECTS
pool.equityReserve = newEquityReserve;
pool.bnbReserve    = newBnbReserve + lpFee;
pool.protocolFeesAccrued += protocolFee;
_recordDisposal(token, msg.sender, equityIn);
// INTERACTIONS
_sendBnb(msg.sender, bnbOut);
_updateCircuitState(token, pool, ...); // read-then-write, no external calls
```

### Pull-Over-Push for BNB
BNB is sent using `call{value}` with failure checked:
```solidity
function _sendBnb(address to, uint256 amount) internal {
    (bool ok,) = payable(to).call{value: amount}("");
    require(ok, "EquityExchange: BNB transfer failed");
}
```
`transfer` and `send` (2300 gas limit) are intentionally avoided — they fail for contract recipients that need more gas (e.g., multisigs, smart wallets).

---

## 15. BSC Testnet-Specific Choices

| Choice | Reason |
|--------|--------|
| **Native BNB as base currency** | No WBNB wrapping needed. Lower gas. Familiar to BNB ecosystem users. |
| **`WINDOW_BLOCKS = 28_800`** | BSC Testnet produces ~1 block/3 seconds. 28,800 blocks × 3 s = 86,400 s = exactly 24 hours. |
| **`SHORT_TERM_BLOCKS = 5_184_000`** | 180 days × 86,400 s/day ÷ 3 s/block = 5,184,000 blocks. The 6-month holding threshold for the discounted fee. |
| **`circuitHaltBlocks = 100`** | Default ~300 seconds halt (100 blocks × 3 s). Configurable per token at listing time. |
| **No V4 hooks** | PancakeSwap v4 is not yet widely deployed on BSC Testnet. Custom AMM gives full protocol control and zero external dependency. Architecture is hook-friendly for future migration. |
| **`evm_version = "paris"`** | Solidity 0.8.24 targeting BSC Testnet EVM compatibility (Shanghai-equivalent). |
| **Constant-product over CLMM** | Simpler, auditable, requires no tick management. Appropriate for the MVP; can migrate to concentrated liquidity later. |

---

## Contract Addresses (BSC Testnet — Chain 97)

> Live deployment. Verify on [BSCScan Testnet](https://testnet.bscscan.com).
>
> To redeploy: `source .env && forge script script/Deploy.s.sol --rpc-url bsc_testnet --broadcast -vvvv`

| Contract | Address | Explorer |
|----------|---------|---------|
| **KYCRegistry** | `0x7199Ab4BD12EaaB852B1BeDBAd364dFD2e38a1e7` | [BSCScan ↗](https://testnet.bscscan.com/address/0x7199Ab4BD12EaaB852B1BeDBAd364dFD2e38a1e7) |
| **EquityExchange** | `0x34740D0bE3996A08AeC9A0d33A26Ae9cA21028cF` | [BSCScan ↗](https://testnet.bscscan.com/address/0x34740D0bE3996A08AeC9A0d33A26Ae9cA21028cF) |
| **EquityFactory** | `0xEA71916C6287991A1045F32E13137fc16EF91149` | [BSCScan ↗](https://testnet.bscscan.com/address/0xEA71916C6287991A1045F32E13137fc16EF91149) |

---

*Generated from source at commit HEAD. All line references are to the files in `src/`.*
