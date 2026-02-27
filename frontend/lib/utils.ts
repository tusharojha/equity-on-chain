import { formatUnits, parseUnits } from 'viem'

// ─── Formatting ────────────────────────────────────────────────────────────

export function formatBNB(wei: bigint, decimals = 6): string {
  const num = Number(formatUnits(wei, 18))
  if (num === 0) return '0'
  if (num < 0.000001) return '<0.000001'
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  })
}

export function formatToken(amount: bigint, decimals = 4): string {
  const num = Number(formatUnits(amount, 18))
  if (num === 0) return '0'
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M'
  if (num >= 1_000) return (num / 1_000).toFixed(2) + 'K'
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  })
}

export function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function formatPercent(bps: bigint): string {
  return (Number(bps) / 100).toFixed(2) + '%'
}

// ─── AMM Math (constant product x*y=k) ────────────────────────────────────

/**
 * Calculate output amount from an AMM swap.
 * amountOut = reserveOut * amountIn / (reserveIn + amountIn)
 */
export function calcAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
): bigint {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n
  return (reserveOut * amountIn) / (reserveIn + amountIn)
}

/**
 * Get a buy quote: how many equity tokens for a given BNB amount.
 */
export function getBuyQuote(bnbIn: bigint, bnbReserve: bigint, equityReserve: bigint): bigint {
  return calcAmountOut(bnbIn, bnbReserve, equityReserve)
}

/**
 * Get a sell quote: how much BNB for a given equity amount, after fee.
 * Fee is applied to the raw BNB output (matches contract: fee = rawBnbOut * feeBps / FEE_DENOM).
 */
export function getSellQuote(
  equityIn: bigint,
  equityReserve: bigint,
  bnbReserve: bigint,
  feeBps: bigint,       // SHORT_TERM_FEE_BPS or LONG_TERM_FEE_BPS
  feeDenom: bigint = 10_000n,
): { bnbOut: bigint; fee: bigint } {
  const rawBnbOut = calcAmountOut(equityIn, equityReserve, bnbReserve)
  const fee = (rawBnbOut * feeBps) / feeDenom
  const bnbOut = rawBnbOut - fee
  return { bnbOut, fee }
}

/**
 * Current token price in BNB (as floating-point string, e.g. "0.00012").
 */
export function getTokenPrice(bnbReserve: bigint, equityReserve: bigint): string {
  if (equityReserve === 0n) return '0'
  // price = BNB per token
  const priceWei = (bnbReserve * 10n ** 18n) / equityReserve
  return formatBNB(priceWei, 8)
}

/**
 * Price impact as a percentage string, e.g. "3.42".
 */
export function getPriceImpact(
  amountIn: bigint,
  reserveIn: bigint,
): string {
  if (reserveIn === 0n || amountIn === 0n) return '0'
  const impact = (Number(amountIn) / Number(reserveIn + amountIn)) * 100
  return impact.toFixed(2)
}

/**
 * Estimate whether a holder will pay short-term or long-term fee.
 * weightedBlockSum / totalAmount = average acquisition block
 */
export function isShortTermHolder(
  weightedBlockSum: bigint,
  totalAmount: bigint,
  currentBlock: bigint,
  shortTermBlocks: bigint = 5_184_000n, // 6 months on BSC Testnet (3 s/block)
): boolean {
  if (totalAmount === 0n) return true
  const avgAcquisitionBlock = weightedBlockSum / totalAmount
  return (currentBlock - avgAcquisitionBlock) < shortTermBlocks
}

// ─── Parse helpers ─────────────────────────────────────────────────────────

export function parseBNB(value: string): bigint {
  try {
    return parseUnits(value || '0', 18)
  } catch {
    return 0n
  }
}

export function parseToken(value: string): bigint {
  try {
    return parseUnits(value || '0', 18)
  } catch {
    return 0n
  }
}

// ─── Block to time helpers ─────────────────────────────────────────────────

export function blocksToHuman(blocks: bigint, blockTimeSecs = 3): string {
  const secs = Number(blocks) * blockTimeSecs
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`
  return `${Math.floor(secs / 86400)}d`
}

// ─── Error mapping ─────────────────────────────────────────────────────────

const ERROR_MAP: Record<string, string> = {
  'circuit breaker active': 'Trading is paused — circuit breaker is active. Try again after the halt period.',
  'insufficient BNB': 'You don\'t have enough BNB to complete this trade.',
  'insufficient equity': 'You don\'t have enough tokens to sell.',
  'slippage exceeded': 'Price moved too much. Try again or increase your slippage tolerance.',
  'KYC required': 'KYC verification is required to trade this token.',
  'ownership limit exceeded': 'This trade would exceed the maximum ownership cap for this token.',
  'direct transfers disabled': 'Token transfers are restricted to the exchange only.',
  'not the owner': 'Only the token owner can perform this action.',
  'already listed': 'This token is already listed on the exchange.',
  'insufficient BNB for demo listing': 'Not enough BNB to pay the listing fee.',
  'DeployToken: insufficient BNB': 'Not enough BNB to cover the listing fee and initial liquidity.',
}

export function mapContractError(error: Error | string): string {
  const msg = typeof error === 'string' ? error : error.message
  for (const [key, friendly] of Object.entries(ERROR_MAP)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return friendly
  }
  if (msg.includes('User rejected')) return 'Transaction was cancelled.'
  if (msg.includes('insufficient funds')) return 'Insufficient BNB for gas + transaction value.'
  return 'Transaction failed. Please check your inputs and try again.'
}
