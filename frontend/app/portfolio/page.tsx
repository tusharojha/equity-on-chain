'use client'

import { useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts, useBlockNumber, useBalance } from 'wagmi'
import { EQUITY_EXCHANGE_ABI, EQUITY_TOKEN_ABI, EQUITY_FACTORY_ABI, CONTRACTS, CHAIN_CONSTANTS } from '@/lib/contracts'
import { formatBNB, formatToken, formatAddress, getTokenPrice, isShortTermHolder } from '@/lib/utils'
import { CircuitBreakerBadge } from '@/components/CircuitBreakerBadge'
import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'

// ─── Per-token row (holdings + LP) ─────────────────────────────────────────

function TokenRow({ tokenAddress, userAddress }: { tokenAddress: `0x${string}`; userAddress: `0x${string}` }) {
  const { data: currentBlock } = useBlockNumber()

  const { data } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'name' },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'symbol' },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'balanceOf', args: [userAddress] },
      { address: CONTRACTS.EQUITY_EXCHANGE, abi: EQUITY_EXCHANGE_ABI, functionName: 'getPool', args: [tokenAddress] },
      { address: CONTRACTS.EQUITY_EXCHANGE, abi: EQUITY_EXCHANGE_ABI, functionName: 'getLPShares', args: [tokenAddress, userAddress] },
      { address: CONTRACTS.EQUITY_EXCHANGE, abi: EQUITY_EXCHANGE_ABI, functionName: 'getHoldRecord', args: [tokenAddress, userAddress] },
    ],
    allowFailure: true,
  })

  const name         = data?.[0]?.result as string | undefined
  const symbol       = data?.[1]?.result as string | undefined
  const balance      = (data?.[2]?.result as bigint | undefined) ?? 0n
  const pool         = data?.[3]?.result as readonly [bigint, bigint, bigint, boolean, bigint, bigint] | undefined
  const lpShares     = (data?.[4]?.result as bigint | undefined) ?? 0n
  const holdRecord   = data?.[5]?.result as readonly [bigint, bigint] | undefined

  const equityReserve   = pool?.[0] ?? 0n
  const bnbReserve      = pool?.[1] ?? 0n
  const totalLPShares   = pool?.[2] ?? 0n
  const circuitBroken   = pool?.[3] ?? false
  const haltedUntilBlock = pool?.[4] ?? 0n

  const price = getTokenPrice(bnbReserve, equityReserve)

  // BNB value of holdings
  const holdingValueWei = equityReserve > 0n && bnbReserve > 0n
    ? (balance * bnbReserve) / equityReserve
    : 0n

  // LP value
  const lpEquity = totalLPShares > 0n ? (lpShares * equityReserve) / totalLPShares : 0n
  const lpBnb    = totalLPShares > 0n ? (lpShares * bnbReserve) / totalLPShares : 0n

  // Fee tier
  const weightedBlockSum = holdRecord?.[0] ?? 0n
  const holdAmount       = holdRecord?.[1] ?? 0n
  const shortTerm = isShortTermHolder(weightedBlockSum, holdAmount, currentBlock ?? 0n)

  if (balance === 0n && lpShares === 0n) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-brand-200 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 text-xs font-bold">
            {symbol?.slice(0, 3) ?? '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{name}</p>
            <p className="text-gray-400 text-sm">{symbol} · <span className="font-mono text-xs">{formatAddress(tokenAddress)}</span></p>
          </div>
        </div>
        <CircuitBreakerBadge circuitBroken={circuitBroken} haltedUntilBlock={haltedUntilBlock} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-gray-400 text-xs mb-1">Holdings</p>
          <p className="text-gray-900 font-semibold">{formatToken(balance)} {symbol}</p>
          <p className="text-gray-500 text-xs mt-0.5">≈ {formatBNB(holdingValueWei)} BNB</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-gray-400 text-xs mb-1">LP Shares</p>
          <p className="text-gray-900 font-semibold">{formatToken(lpShares)}</p>
          {lpShares > 0n && (
            <p className="text-gray-500 text-xs mt-0.5">{formatToken(lpEquity)} {symbol} + {formatBNB(lpBnb)} BNB</p>
          )}
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-gray-400 text-xs mb-1">Current Price</p>
          <p className="text-gray-900">{price} BNB</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-gray-400 text-xs mb-1">Sell Fee Tier</p>
          <p className={`font-semibold ${shortTerm ? 'text-amber-600' : 'text-brand-600'}`}>
            {shortTerm ? '0.45% short-term' : '0.02% long-term'}
          </p>
        </div>
      </div>

      <Link
        href={`/tokens/${tokenAddress}`}
        className="block w-full text-center py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 font-medium text-sm rounded-lg transition-colors border border-brand-200"
      >
        Trade / Manage Liquidity →
      </Link>
    </div>
  )
}

// ─── Founder tokens section ────────────────────────────────────────────────

function FounderSection({ userAddress }: { userAddress: `0x${string}` }) {
  const { data: count } = useReadContract({
    address: CONTRACTS.EQUITY_FACTORY,
    abi: EQUITY_FACTORY_ABI,
    functionName: 'deployedTokenCount',
  })

  const tokenCount = Number(count ?? 0n)

  const { data: allTokens } = useReadContracts({
    contracts: Array.from({ length: tokenCount }, (_, i) => ({
      address: CONTRACTS.EQUITY_FACTORY,
      abi: EQUITY_FACTORY_ABI,
      functionName: 'deployedTokens' as const,
      args: [BigInt(i)] as [bigint],
    })),
    query: { enabled: tokenCount > 0 },
  })

  // Get owners
  const addresses = (allTokens ?? []).map((r) => r.result as `0x${string}` | undefined).filter(Boolean) as `0x${string}`[]

  const { data: ownerResults } = useReadContracts({
    contracts: addresses.map((addr) => ({
      address: addr,
      abi: EQUITY_TOKEN_ABI,
      functionName: 'owner' as const,
    })),
    query: { enabled: addresses.length > 0 },
  })

  const myTokens = addresses.filter((_, i) => {
    const owner = ownerResults?.[i]?.result as string | undefined
    return owner?.toLowerCase() === userAddress.toLowerCase()
  })

  if (myTokens.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">My Listed Companies</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {myTokens.map((addr) => (
          <FounderTokenCard key={addr} tokenAddress={addr} />
        ))}
      </div>
    </section>
  )
}

function FounderTokenCard({ tokenAddress }: { tokenAddress: `0x${string}` }) {
  const { data } = useReadContracts({
    contracts: [
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'name' },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'symbol' },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'totalSupply' },
      { address: tokenAddress, abi: EQUITY_TOKEN_ABI, functionName: 'maxSupply' },
      { address: CONTRACTS.EQUITY_EXCHANGE, abi: EQUITY_EXCHANGE_ABI, functionName: 'getPool', args: [tokenAddress] },
    ],
    allowFailure: true,
  })

  const name         = data?.[0]?.result as string | undefined
  const symbol       = data?.[1]?.result as string | undefined
  const totalSupply  = (data?.[2]?.result as bigint | undefined) ?? 0n
  const maxSupply    = (data?.[3]?.result as bigint | undefined) ?? 0n
  const pool         = data?.[4]?.result as readonly [bigint, bigint, bigint, boolean, bigint, bigint] | undefined
  const protocolFees = pool?.[5] ?? 0n

  return (
    <div className="bg-white border border-brand-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 text-xs font-bold">
          {symbol?.slice(0, 3) ?? '?'}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{name}</p>
          <p className="text-gray-400 text-xs font-mono">{formatAddress(tokenAddress)}</p>
        </div>
        <span className="ml-auto text-xs bg-brand-50 text-brand-700 border border-brand-200 px-2 py-0.5 rounded-full">Founder</span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-gray-400 text-xs">Circulating / Max</p>
          <p className="text-gray-900 font-medium mt-0.5">{formatToken(totalSupply)} / {formatToken(maxSupply)}</p>
        </div>
        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
          <p className="text-gray-400 text-xs">Protocol Fees Accrued</p>
          <p className="text-gray-900 font-medium mt-0.5">{formatBNB(protocolFees)} BNB</p>
        </div>
      </div>

      <Link
        href={`/tokens/${tokenAddress}`}
        className="block w-full text-center py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 font-medium text-sm rounded-lg transition-colors border border-brand-200"
      >
        Manage Token →
      </Link>
    </div>
  )
}

// ─── Total portfolio value hook ────────────────────────────────────────────

function useTotalPortfolioValue(addresses: `0x${string}`[], userAddress: `0x${string}` | undefined) {
  const { data: balanceResults } = useReadContracts({
    contracts: addresses.map((addr) => ({
      address: addr,
      abi: EQUITY_TOKEN_ABI,
      functionName: 'balanceOf' as const,
      args: [userAddress ?? '0x0'] as [`0x${string}`],
    })),
    query: { enabled: addresses.length > 0 && !!userAddress },
  })

  const { data: poolResults } = useReadContracts({
    contracts: addresses.map((addr) => ({
      address: CONTRACTS.EQUITY_EXCHANGE,
      abi: EQUITY_EXCHANGE_ABI,
      functionName: 'getPool' as const,
      args: [addr] as [`0x${string}`],
    })),
    query: { enabled: addresses.length > 0 },
  })

  const { data: lpResults } = useReadContracts({
    contracts: addresses.map((addr) => ({
      address: CONTRACTS.EQUITY_EXCHANGE,
      abi: EQUITY_EXCHANGE_ABI,
      functionName: 'getLPShares' as const,
      args: [addr, userAddress ?? '0x0'] as [`0x${string}`, `0x${string}`],
    })),
    query: { enabled: addresses.length > 0 && !!userAddress },
  })

  return useMemo(() => {
    if (!balanceResults || !poolResults) return { total: 0n, hasPositions: false }
    let total = 0n
    let hasPositions = false
    for (let i = 0; i < addresses.length; i++) {
      const balance = (balanceResults[i]?.result as bigint | undefined) ?? 0n
      const lpShares = (lpResults?.[i]?.result as bigint | undefined) ?? 0n
      const pool = poolResults[i]?.result as readonly [bigint, bigint, bigint, boolean, bigint, bigint] | undefined
      const equityReserve = pool?.[0] ?? 0n
      const bnbReserve = pool?.[1] ?? 0n
      const totalLPShares = pool?.[2] ?? 0n
      if (balance > 0n || lpShares > 0n) hasPositions = true
      if (equityReserve > 0n && balance > 0n) total += (balance * bnbReserve) / equityReserve
      if (totalLPShares > 0n && lpShares > 0n) total += (lpShares * bnbReserve) / totalLPShares
    }
    return { total, hasPositions }
  }, [balanceResults, poolResults, lpResults, addresses])
}

// ─── Main Portfolio Page ───────────────────────────────────────────────────

export default function PortfolioPage() {
  const { login } = usePrivy()
  const { address, isConnected } = useAccount()

  // Fetch all listed tokens to scan for user's positions
  const { data: count } = useReadContract({
    address: CONTRACTS.EQUITY_EXCHANGE,
    abi: EQUITY_EXCHANGE_ABI,
    functionName: 'listedTokenCount',
  })

  const tokenCount = Number(count ?? 0n)

  const { data: tokenAddresses } = useReadContracts({
    contracts: Array.from({ length: tokenCount }, (_, i) => ({
      address: CONTRACTS.EQUITY_EXCHANGE,
      abi: EQUITY_EXCHANGE_ABI,
      functionName: 'listedTokens' as const,
      args: [BigInt(i)] as [bigint],
    })),
    query: { enabled: tokenCount > 0 && !!address },
  })

  const addresses = (tokenAddresses ?? [])
    .map((r) => r.result as `0x${string}` | undefined)
    .filter(Boolean) as `0x${string}`[]

  const { total: totalBnbValue } = useTotalPortfolioValue(addresses, address)
  const { data: walletBnb } = useBalance({ address })

  if (!isConnected) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 bg-brand-50 border border-brand-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <svg className="w-8 h-8 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Portfolio</h1>
        <p className="text-gray-500 mb-8">Connect your wallet to view your holdings and LP positions.</p>
        <button
          onClick={login}
          className="px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-xl shadow-sm shadow-brand-500/20"
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">Portfolio</h1>
            <p className="text-gray-400 text-xs font-mono">{address}</p>
          </div>
          <div className="flex items-stretch gap-3">
            {/* Wallet BNB balance */}
            <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-sm text-right">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Wallet Balance</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums">
                {formatBNB(walletBnb?.value ?? 0n)} <span className="text-gray-400 text-sm font-normal">BNB</span>
              </p>
            </div>
            {/* Total holdings value */}
            {totalBnbValue > 0n && (
              <div className="bg-white border border-brand-200 rounded-xl px-5 py-3 shadow-sm text-right">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Holdings Value</p>
                <p className="text-lg font-bold text-brand-600 tabular-nums">
                  {formatBNB(totalBnbValue)} <span className="text-gray-400 text-sm font-normal">BNB</span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Holdings section */}
      <section>
        <h2 className="text-base font-semibold text-gray-700 mb-4">Holdings & Positions</h2>
        {addresses.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 text-center shadow-sm">
            <div className="text-3xl mb-3">📦</div>
            <p className="text-gray-500 mb-4">No positions found across {tokenCount} listed tokens</p>
            <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm font-medium">Browse Market →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {addresses.map((addr) => (
              <TokenRow key={addr} tokenAddress={addr} userAddress={address!} />
            ))}
          </div>
        )}
      </section>

      {/* Founder section */}
      {address && <FounderSection userAddress={address} />}
    </div>
  )
}
